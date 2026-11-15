import assert from "node:assert/strict";
import { promisify } from "node:util";
import { randomBytes, scrypt } from "node:crypto";
import express from "express";
import { createServer } from "node:http";
import test from "node:test";

const scryptAsync = promisify(scrypt);

test("external replies stay separate from technician data through rerouting, sync, and reset", async (t) => {
  const dbUrl = process.env.DATABASE_URL;
  if (!dbUrl || dbUrl.includes("no-db.invalid")) {
    t.skip("DATABASE_URL is not configured");
    return;
  }

  const [{ pool }, { registerRoutes }] = await Promise.all([
    import("./db"),
    import("./routes"),
  ]);
  const suffix = `${process.pid}_${Date.now()}`;
  const usernames = {
    admin: `external-isolation-admin-${suffix}`,
    external: `external-isolation-user-${suffix}`,
    tech: `external-isolation-tech-${suffix}`,
  };
  const serials = {
    matched: `external-isolation-matched-${suffix}`,
    unlinked: `external-isolation-unlinked-${suffix}`,
  };
  const app = express();
  app.use(express.json());
  const httpServer = createServer(app);
  let baseUrl = "";
  let orderIds: number[] = [];

  const deleteFixtures = async () => {
    await pool.query(`DELETE FROM notifications WHERE order_id = ANY($1::int[])`, [orderIds]);
    await pool.query(`DELETE FROM om_order_matches WHERE om_serial = ANY($1::text[])`, [Object.values(serials)]);
    await pool.query(`DELETE FROM om_responses WHERE serial_number = ANY($1::text[])`, [Object.values(serials)]);
    await pool.query(`DELETE FROM orders WHERE serial_number = ANY($1::text[])`, [Object.values(serials)]);
    await pool.query(`DELETE FROM users WHERE username = ANY($1::text[])`, [Object.values(usernames)]);
  };

  const addUser = async (username: string, role: string) => {
    const salt = randomBytes(16).toString("hex");
    const hash = await scryptAsync("external-isolation-test-password", salt, 64) as Buffer;
    const password = `${hash.toString("hex")}.${salt}`;
    const { rows } = await pool.query(
      `INSERT INTO users (username, password, role) VALUES ($1, $2, $3) RETURNING id`,
      [username, password, role],
    );
    return Number(rows[0].id);
  };

  try {
    await deleteFixtures();
    const adminId = await addUser(usernames.admin, "super_admin");
    const externalId = await addUser(usernames.external, "external");
    const techId = await addUser(usernames.tech, "tech");

    const insertOrder = async (serialNumber: string) => {
      const { rows } = await pool.query(
        `INSERT INTO orders
           (customer_name, customer_phone, customer_address, serial_number, sales_id, sales_name,
            status, is_feasible, rejection_reason, cabin_number, box_number, nearest_box_distance,
            additional_notes, central_name, tech_id, tech_name, tech_response_at,
            external_id, external_name, is_feasible_external, external_rejection_reason,
            external_central_name, external_cabin_number, external_box_number,
            external_nearest_box_distance, external_additional_notes, external_response_at)
         VALUES
           ('Test customer', '01000000000', 'Test address', $1, $2, 'Test admin',
            'not_feasible', false, 'technician rejection', 'TECH-CAB', 'TECH-BOX', '7m',
            'technician note', 'Tech Central', $3, 'Test technician', '2026-10-10T10:00:00Z',
            $4, 'Previous external reviewer', false, 'stale external rejection',
            'Old external central', 'OLD-CAB', 'OLD-BOX', '99m', 'stale note',
            '2026-10-11T10:00:00Z')
         RETURNING id`,
        [serialNumber, adminId, techId, externalId],
      );
      const id = Number(rows[0].id);
      orderIds.push(id);
      return id;
    };

    const matchedOrderId = await insertOrder(serials.matched);
    const unlinkedOrderId = await insertOrder(serials.unlinked);
    const originalTech = {
      is_feasible: false,
      rejection_reason: "technician rejection",
      central_name: "Tech Central",
      cabin_number: "TECH-CAB",
      box_number: "TECH-BOX",
      nearest_box_distance: "7m",
      additional_notes: "technician note",
      tech_id: techId,
      tech_name: "Test technician",
      tech_response_at: (await pool.query(
        `SELECT tech_response_at FROM orders WHERE id = $1`, [matchedOrderId],
      )).rows[0].tech_response_at,
    };

    await pool.query(
      `INSERT INTO om_responses
         (serial_number, status, is_feasible, rejection_reason, central_name, cabin_number,
          box_number, nearest_box_distance, additional_notes, tech_id, tech_name, responded_at)
       VALUES ($1, 'not_feasible', false, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
      [serials.matched, originalTech.rejection_reason, originalTech.central_name,
       originalTech.cabin_number, originalTech.box_number, originalTech.nearest_box_distance,
       originalTech.additional_notes, techId, originalTech.tech_name, originalTech.tech_response_at],
    );
    await pool.query(
      `INSERT INTO om_order_matches (order_id, om_serial, confirmed_by_id, confirmed_by_name)
       VALUES ($1, $2, $3, $4)`,
      [matchedOrderId, serials.matched, adminId, usernames.admin],
    );

    await registerRoutes(httpServer, app);
    await new Promise<void>((resolve) => httpServer.listen(0, "127.0.0.1", resolve));
    const address = httpServer.address();
    assert.ok(address && typeof address !== "string");
    baseUrl = `http://127.0.0.1:${address.port}`;

    const login = async (username: string) => {
      const response = await fetch(`${baseUrl}/api/login`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ username, password: "external-isolation-test-password" }),
      });
      assert.equal(response.status, 200);
      const cookie = response.headers.get("set-cookie");
      assert.ok(cookie, `${username} should receive an authenticated session`);
      return cookie.split(";")[0];
    };
    const adminCookie = await login(usernames.admin);
    const externalCookie = await login(usernames.external);
    const request = async (path: string, cookie: string, method: string, body: unknown) => fetch(`${baseUrl}${path}`, {
      method,
      headers: { cookie, "content-type": "application/json" },
      body: JSON.stringify(body),
    });
    const readOrder = async (id: number) => (await pool.query(
      `SELECT * FROM orders WHERE id = $1`, [id],
    )).rows[0];
    const readMatchedResponse = async () => (await pool.query(
      `SELECT * FROM om_responses WHERE serial_number = $1`, [serials.matched],
    )).rows[0];
    const assertTechUnchanged = (row: Record<string, any>) => {
      for (const [key, value] of Object.entries(originalTech)) {
        assert.deepEqual(row[key], value, `external workflow must preserve technician field ${key}`);
      }
    };
    const assertExternalCleared = (row: Record<string, any>) => {
      for (const key of [
        "external_id", "external_name", "is_feasible_external", "external_rejection_reason",
        "external_central_name", "external_cabin_number", "external_box_number",
        "external_nearest_box_distance", "external_additional_notes", "external_response_at",
      ]) {
        assert.equal(row[key], null, `reset/reroute must clear ${key}`);
      }
    };

    const reroute = await request(`/api/orders/${matchedOrderId}/external-review`, adminCookie, "POST", {});
    assert.equal(reroute.status, 200, await reroute.text());
    let order = await readOrder(matchedOrderId);
    assertTechUnchanged(order);
    assertExternalCleared(order);

    const rejection = await request(`/api/orders/${matchedOrderId}/external-response`, externalCookie, "PUT", {
      isFeasibleExternal: false,
      externalRejectionReason: "external rejection",
      externalCentralName: "External Central",
      externalCabinNumber: "EXT-CAB",
      externalBoxNumber: "EXT-BOX",
      externalNearestBoxDistance: "12m",
      externalAdditionalNotes: "external rejection note",
    });
    assert.equal(rejection.status, 200, await rejection.text());
    order = await readOrder(matchedOrderId);
    assertTechUnchanged(order);
    assert.equal(order.is_feasible_external, false);
    assert.equal(order.external_rejection_reason, "external rejection");
    assert.equal(order.external_central_name, "External Central");
    assertTechUnchanged(await readMatchedResponse());

    const rerouteAgain = await request("/api/om-rejections/request-external", adminCookie, "POST", {
      serialNumber: serials.matched,
    });
    assert.equal(rerouteAgain.status, 200, await rerouteAgain.text());
    order = await readOrder(matchedOrderId);
    assertTechUnchanged(order);
    assertExternalCleared(order);
    assertTechUnchanged(await readMatchedResponse());
    assertExternalCleared(await readMatchedResponse());

    const feasible = await request("/api/om-rejections/external-response", externalCookie, "POST", {
      serialNumber: serials.matched,
      isFeasible: true,
      centralName: "External Feasible Central",
      cabinNumber: "EXT-FEAS-CAB",
      boxNumber: "EXT-FEAS-BOX",
      nearestBoxDistance: "3m",
      additionalNotes: "external feasible note",
    });
    assert.equal(feasible.status, 200, await feasible.text());
    order = await readOrder(matchedOrderId);
    assertTechUnchanged(order);
    assert.equal(order.is_feasible_external, true);
    assert.equal(order.external_rejection_reason, null);
    assert.equal(order.external_cabin_number, "EXT-FEAS-CAB");
    assertTechUnchanged(await readMatchedResponse());

    const resetMatched = await request("/api/om-rejections/reset-response", adminCookie, "POST", {
      serialNumber: serials.matched,
    });
    assert.equal(resetMatched.status, 200, await resetMatched.text());
    order = await readOrder(matchedOrderId);
    assert.equal(order.status, "pending");
    assertExternalCleared(order);
    for (const key of Object.keys(originalTech)) assert.equal(order[key], null, `full response reset must clear ${key}`);

    const rerouteUnlinked = await request(`/api/orders/${unlinkedOrderId}/external-review`, adminCookie, "POST", {});
    assert.equal(rerouteUnlinked.status, 200, await rerouteUnlinked.text());
    const unlinkedRejection = await request(`/api/orders/${unlinkedOrderId}/external-response`, externalCookie, "PUT", {
      isFeasibleExternal: false,
      externalRejectionReason: "unlinked external rejection",
      externalCentralName: "Unlinked External Central",
      externalCabinNumber: "UNLINKED-CAB",
      externalBoxNumber: "UNLINKED-BOX",
      externalNearestBoxDistance: "15m",
      externalAdditionalNotes: "unlinked external note",
    });
    assert.equal(unlinkedRejection.status, 200, await unlinkedRejection.text());
    const resetUnlinked = await request(`/api/orders/${unlinkedOrderId}/reset`, adminCookie, "POST", {});
    assert.equal(resetUnlinked.status, 200, await resetUnlinked.text());
    const unlinkedOrder = await readOrder(unlinkedOrderId);
    assert.equal(unlinkedOrder.status, "pending");
    assertExternalCleared(unlinkedOrder);
    for (const key of Object.keys(originalTech)) assert.equal(unlinkedOrder[key], null, `tech reset must clear ${key}`);
  } finally {
    if (httpServer.listening) {
      await new Promise<void>((resolve) => httpServer.close(() => resolve()));
    }
    await deleteFixtures();
  }
});
