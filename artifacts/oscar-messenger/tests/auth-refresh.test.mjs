import assert from "node:assert/strict";
import test from "node:test";
import { ApiError, customFetch, setAuthTokenGetter } from "../../../lib/api-client-react/src/custom-fetch.ts";

const originalFetch = globalThis.fetch;

test("retries one 401 with a fresh Clerk token exactly once", async () => {
  const tokens = [];
  let requests = 0;
  setAuthTokenGetter(async (options) => {
    tokens.push(options);
    return options?.skipCache ? "fresh-token" : "expired-token";
  });
  globalThis.fetch = async (_input, init) => {
    requests += 1;
    const auth = new Headers(init?.headers).get("authorization");
    if (requests === 1) {
      assert.equal(auth, "Bearer expired-token");
      return new Response(JSON.stringify({ error: "expired" }), {
        status: 401,
        headers: { "content-type": "application/json" },
      });
    }
    assert.equal(auth, "Bearer fresh-token");
    return new Response(JSON.stringify({ ok: true }), {
      status: 200,
      headers: { "content-type": "application/json" },
    });
  };

  try {
    assert.deepEqual(
      await customFetch("/api/messenger/profile", { responseType: "json" }),
      { ok: true },
    );
    assert.equal(requests, 2);
    assert.equal(tokens.length, 2);
    assert.equal(tokens[0], undefined);
    assert.deepEqual(tokens[1], { skipCache: true });
  } finally {
    globalThis.fetch = originalFetch;
    setAuthTokenGetter(null);
  }
});

test("a second 401 is returned without another retry", async () => {
  let requests = 0;
  setAuthTokenGetter(async ({ skipCache } = {}) => (skipCache ? "fresh" : "old"));
  globalThis.fetch = async () => {
    requests += 1;
    return new Response(JSON.stringify({ error: "unauthorized" }), {
      status: 401,
      headers: { "content-type": "application/json" },
    });
  };

  try {
    await assert.rejects(
      customFetch("/api/messenger/profile", { responseType: "json" }),
      (error) => error instanceof ApiError && error.status === 401,
    );
    assert.equal(requests, 2);
  } finally {
    globalThis.fetch = originalFetch;
    setAuthTokenGetter(null);
  }
});

test("retries through same-origin cookies when Clerk returns no fresh token", async () => {
  let requests = 0;
  setAuthTokenGetter(async ({ skipCache } = {}) => (skipCache ? null : "expired"));
  globalThis.fetch = async (_input, init) => {
    requests += 1;
    const auth = new Headers(init?.headers).get("authorization");
    if (requests === 1) {
      assert.equal(auth, "Bearer expired");
    } else {
      assert.equal(auth, null);
    }
    return new Response(JSON.stringify({ error: "unauthorized" }), {
      status: 401,
      headers: { "content-type": "application/json" },
    });
  };

  try {
    await assert.rejects(
      customFetch("/api/messenger/profile", { responseType: "json" }),
      (error) => error instanceof ApiError && error.status === 401,
    );
    assert.equal(requests, 2);
  } finally {
    globalThis.fetch = originalFetch;
    setAuthTokenGetter(null);
  }
});

test("5xx and network errors are not retried", async () => {
  let requests = 0;
  setAuthTokenGetter(async () => "token");
  globalThis.fetch = async () => {
    requests += 1;
    return new Response("unavailable", { status: 503 });
  };
  try {
    await assert.rejects(
      customFetch("/api/messenger/profile"),
      (error) => error instanceof ApiError && error.status === 503,
    );
    assert.equal(requests, 1);

    globalThis.fetch = async () => {
      requests += 1;
      throw new TypeError("Failed to fetch");
    };
    await assert.rejects(customFetch("/api/messenger/profile"), /Failed to fetch/);
    assert.equal(requests, 2);
  } finally {
    globalThis.fetch = originalFetch;
    setAuthTokenGetter(null);
  }
});
