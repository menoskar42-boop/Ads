import { randomUUID } from "node:crypto";
import { getAuth } from "@clerk/express";
import { Router, type IRouter, type RequestHandler } from "express";
import {
  canRemoveGroupMember,
  canSetGroupMemberRole,
  isGroupManager,
  normalizeStatusAudience,
  normalizeStatusBody,
} from "../lib/messenger-groups-policy";
import { parseMessageCursor } from "../lib/message-pagination";
import { notifyGroupMessage } from "../lib/messenger-web-push";
import { hasMessengerBlocksSchema } from "../lib/messenger-blocks";

type DbPool = Awaited<ReturnType<typeof loadPool>>;

async function loadPool() {
  if (!process.env.ADS_DATABASE_URL) return null;
  const db = await import("@workspace/db");
  return db.pool;
}

const router: IRouter = Router();
const requiredTables = [
  "messenger_groups",
  "messenger_group_members",
  "messenger_group_messages",
  "messenger_group_settings",
  "messenger_status_updates",
  "messenger_status_audience",
  "messenger_content_reports",
];
const schemaCache = new WeakMap<object, { checkedAt: number; ready: boolean }>();
const reportWindows = new Map<string, { count: number; resetAt: number }>();
const MAX_GROUP_MEMBERS = 50;
const MAX_GROUP_MESSAGES = 100;

const requireAuth: RequestHandler = (req, res, next) => {
  const userId = getAuth(req).userId;
  if (!userId) {
    res.status(401).json({ error: "Authentication required" });
    return;
  }
  res.locals.userId = userId;
  next();
};

function userIdFrom(res: Parameters<RequestHandler>[1]): string {
  return String(res.locals.userId);
}

function requirePool(pool: DbPool, res: Parameters<RequestHandler>[1]) {
  if (!pool) {
    res.status(503).json({ error: "Messenger storage is not configured" });
    return null;
  }
  return pool;
}

async function groupsSchemaReady(pool: NonNullable<DbPool>): Promise<boolean> {
  const cached = schemaCache.get(pool);
  if (cached && Date.now() - cached.checkedAt < 15_000) return cached.ready;
  try {
    const result = await pool.query(
      `SELECT count(*)::int AS ready_count
       FROM information_schema.tables
       WHERE table_schema = current_schema()
         AND table_name = ANY($1::text[])`,
      [requiredTables],
    );
    const ready = Number(result.rows[0]?.ready_count) === requiredTables.length;
    schemaCache.set(pool, { checkedAt: Date.now(), ready });
    return ready;
  } catch {
    schemaCache.set(pool, { checkedAt: Date.now(), ready: false });
    return false;
  }
}

async function requireGroupsSchema(
  pool: NonNullable<DbPool>,
  res: Parameters<RequestHandler>[1],
): Promise<boolean> {
  if (await groupsSchemaReady(pool)) return true;
  res.status(503).json({
    error: "تحديث قاعدة Oscar Messaging مطلوب لتفعيل المجموعات والحالات.",
    reason: "database_update_required",
  });
  return false;
}

async function memberRole(
  pool: NonNullable<DbPool>,
  groupId: string,
  userId: string,
): Promise<string | null> {
  const result = await pool.query(
    `SELECT role FROM messenger_group_members WHERE group_id = $1 AND user_id = $2`,
    [groupId, userId],
  );
  return result.rows[0]?.role ?? null;
}

function publicGroupMessage(row: {
  id: string;
  group_id: string;
  sender_id: string;
  sender_name: string;
  body: string;
  created_at: Date | string;
}) {
  return {
    id: row.id,
    groupId: row.group_id,
    senderId: row.sender_id,
    senderName: row.sender_name,
    body: row.body,
    createdAt: row.created_at,
  };
}

async function groupDetail(
  pool: NonNullable<DbPool>,
  groupId: string,
  currentUserId: string,
) {
  const groupResult = await pool.query(
    `SELECT g.id, g.name, g.owner_id, g.created_at, g.updated_at, actor.role,
            (SELECT count(*)::int FROM messenger_group_members members
             WHERE members.group_id = g.id) AS member_count,
            COALESCE(latest.body, '') AS last_message,
            COALESCE(latest.created_at, g.updated_at, g.created_at) AS last_activity,
            COALESCE(settings.is_muted, false) AS is_muted
     FROM messenger_groups g
     JOIN messenger_group_members actor
       ON actor.group_id = g.id AND actor.user_id = $2
     LEFT JOIN messenger_group_settings settings
       ON settings.group_id = g.id AND settings.user_id = $2
     LEFT JOIN LATERAL (
       SELECT body, created_at FROM messenger_group_messages
       WHERE group_id = g.id ORDER BY created_at DESC LIMIT 1
     ) latest ON true
     WHERE g.id = $1`,
    [groupId, currentUserId],
  );
  if (!groupResult.rows[0]) return null;
  const row = groupResult.rows[0];
  const members = await pool.query(
    `SELECT p.user_id, p.username, p.display_name, m.role, m.joined_at
     FROM messenger_group_members m
     JOIN messenger_profiles p ON p.user_id = m.user_id
     WHERE m.group_id = $1
     ORDER BY CASE m.role WHEN 'owner' THEN 0 WHEN 'admin' THEN 1 ELSE 2 END,
              m.joined_at, p.display_name`,
    [groupId],
  );
  return {
    id: row.id,
    name: row.name,
    ownerId: row.owner_id,
    role: row.role,
    memberCount: Number(row.member_count),
    lastMessage: row.last_message,
    updatedAt: row.last_activity,
    isMuted: Boolean(row.is_muted),
    members: members.rows.map((member) => ({
      userId: member.user_id,
      username: member.username,
      displayName: member.display_name,
      role: member.role,
      joinedAt: member.joined_at,
    })),
  };
}

router.get("/messenger/groups/capability", requireAuth, async (_req, res, next) => {
  try {
    const pool = requirePool(await loadPool(), res);
    if (!pool) return;
    const enabled = await groupsSchemaReady(pool);
    res.json({
      enabled,
      reason: enabled ? null : "database_update_required",
      maxMembers: MAX_GROUP_MEMBERS,
      statusLifetimeHours: 24,
    });
  } catch (error) {
    next(error);
  }
});

router.get("/messenger/groups", requireAuth, async (_req, res, next) => {
  try {
    const pool = requirePool(await loadPool(), res);
    if (!pool || !(await requireGroupsSchema(pool, res))) return;
    const userId = userIdFrom(res);
    const result = await pool.query(
      `SELECT g.id, g.name, m.role,
              (SELECT count(*)::int FROM messenger_group_members all_members
               WHERE all_members.group_id = g.id) AS member_count,
              COALESCE(latest.body, '') AS last_message,
              COALESCE(latest.created_at, g.updated_at, g.created_at) AS updated_at,
              COALESCE(settings.is_muted, false) AS is_muted
       FROM messenger_group_members m
       JOIN messenger_groups g ON g.id = m.group_id
       LEFT JOIN messenger_group_settings settings
         ON settings.group_id = g.id AND settings.user_id = m.user_id
       LEFT JOIN LATERAL (
         SELECT body, created_at FROM messenger_group_messages
         WHERE group_id = g.id ORDER BY created_at DESC LIMIT 1
       ) latest ON true
       WHERE m.user_id = $1
       ORDER BY updated_at DESC, g.id`,
      [userId],
    );
    res.json({
      groups: result.rows.map((row) => ({
        id: row.id,
        name: row.name,
        role: row.role,
        memberCount: Number(row.member_count),
        lastMessage: row.last_message,
        updatedAt: row.updated_at,
        isMuted: Boolean(row.is_muted),
      })),
    });
  } catch (error) {
    next(error);
  }
});

router.post("/messenger/groups", requireAuth, async (req, res, next) => {
  const pool = requirePool(await loadPool(), res);
  if (!pool || !(await requireGroupsSchema(pool, res))) return;
  const userId = userIdFrom(res);
  const name = typeof req.body?.name === "string" ? req.body.name.trim() : "";
  const inputMembers: unknown = req.body?.memberUserIds;
  if (inputMembers !== undefined && !Array.isArray(inputMembers)) {
    res.status(400).json({ error: "قائمة الأعضاء غير صحيحة." });
    return;
  }
  const requested = Array.isArray(inputMembers)
    ? inputMembers.filter((value): value is string => typeof value === "string")
    : [];
  const memberIds = [...new Set([userId, ...requested])];
  if (!name || name.length > 60 || requested.length !== (Array.isArray(inputMembers) ? inputMembers.length : 0)) {
    res.status(400).json({ error: "اكتب اسمًا للمجموعة وأعضاء صالحين." });
    return;
  }
  if (memberIds.length > MAX_GROUP_MEMBERS) {
    res.status(400).json({ error: `المجموعة تستوعب حتى ${MAX_GROUP_MEMBERS} عضوًا.` });
    return;
  }
  if (memberIds.length < 2) {
    res.status(400).json({ error: "اختر عضوًا آخر على الأقل لإنشاء المجموعة." });
    return;
  }

  const client = await pool.connect();
  try {
    const profiles = await client.query(
      `SELECT user_id FROM messenger_profiles WHERE user_id = ANY($1::text[])`,
      [memberIds],
    );
    if (profiles.rows.length !== memberIds.length) {
      res.status(400).json({ error: "تعذّر العثور على أحد الحسابات المختارة." });
      return;
    }
    const groupId = randomUUID();
    await client.query("BEGIN");
    await client.query(
      `INSERT INTO messenger_groups (id, name, owner_id) VALUES ($1, $2, $3)`,
      [groupId, name, userId],
    );
    await client.query(
      `INSERT INTO messenger_group_members (group_id, user_id, role)
       SELECT $1, members.user_id,
              CASE WHEN members.user_id = $2 THEN 'owner' ELSE 'member' END
       FROM unnest($3::text[]) AS members(user_id)`,
      [groupId, userId, memberIds],
    );
    await client.query("COMMIT");
    res.status(201).json({ group: await groupDetail(pool, groupId, userId) });
  } catch (error) {
    await client.query("ROLLBACK").catch(() => undefined);
    next(error);
  } finally {
    client.release();
  }
});

router.get("/messenger/groups/:groupId", requireAuth, async (req, res, next) => {
  try {
    const pool = requirePool(await loadPool(), res);
    if (!pool || !(await requireGroupsSchema(pool, res))) return;
    const group = await groupDetail(pool, String(req.params.groupId), userIdFrom(res));
    if (!group) {
      res.status(404).json({ error: "المجموعة غير موجودة أو لم تعد عضوًا فيها." });
      return;
    }
    res.json({ group });
  } catch (error) {
    next(error);
  }
});

router.patch("/messenger/groups/:groupId", requireAuth, async (req, res, next) => {
  try {
    const pool = requirePool(await loadPool(), res);
    if (!pool || !(await requireGroupsSchema(pool, res))) return;
    const userId = userIdFrom(res);
    const groupId = String(req.params.groupId);
    const name = typeof req.body?.name === "string" ? req.body.name.trim() : "";
    const role = await memberRole(pool, groupId, userId);
    if (!role) {
      res.status(404).json({ error: "المجموعة غير موجودة أو لم تعد عضوًا فيها." });
      return;
    }
    if (!isGroupManager(role)) {
      res.status(403).json({ error: "تغيير اسم المجموعة متاح للمشرفين فقط." });
      return;
    }
    if (!name || name.length > 60) {
      res.status(400).json({ error: "اسم المجموعة مطلوب وبحد أقصى 60 حرفًا." });
      return;
    }
    await pool.query(
      `UPDATE messenger_groups SET name = $2, updated_at = now() WHERE id = $1`,
      [groupId, name],
    );
    res.json({ group: await groupDetail(pool, groupId, userId) });
  } catch (error) {
    next(error);
  }
});

router.post("/messenger/groups/:groupId/members", requireAuth, async (req, res, next) => {
  const pool = requirePool(await loadPool(), res);
  if (!pool || !(await requireGroupsSchema(pool, res))) return;
  const userId = userIdFrom(res);
  const groupId = String(req.params.groupId);
  const targetId = typeof req.body?.userId === "string" ? req.body.userId : "";
  if (!targetId || targetId === userId) {
    res.status(400).json({ error: "اختر حسابًا آخر لإضافته." });
    return;
  }
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const group = await client.query(
      `SELECT id FROM messenger_groups WHERE id = $1 FOR UPDATE`,
      [groupId],
    );
    if (!group.rows[0]) {
      await client.query("ROLLBACK");
      res.status(404).json({ error: "المجموعة غير موجودة." });
      return;
    }
    const actor = await client.query(
      `SELECT role FROM messenger_group_members WHERE group_id = $1 AND user_id = $2`,
      [groupId, userId],
    );
    if (!isGroupManager(actor.rows[0]?.role)) {
      await client.query("ROLLBACK");
      res.status(actor.rows[0] ? 403 : 404).json({
        error: actor.rows[0] ? "إضافة الأعضاء متاحة للمشرفين فقط." : "المجموعة غير موجودة.",
      });
      return;
    }
    const target = await client.query(
      `SELECT user_id FROM messenger_profiles WHERE user_id = $1`,
      [targetId],
    );
    if (!target.rows[0]) {
      await client.query("ROLLBACK");
      res.status(404).json({ error: "الحساب المختار غير موجود." });
      return;
    }
    const count = await client.query(
      `SELECT count(*)::int AS count FROM messenger_group_members WHERE group_id = $1`,
      [groupId],
    );
    const alreadyMember = await client.query(
      `SELECT 1 FROM messenger_group_members WHERE group_id = $1 AND user_id = $2`,
      [groupId, targetId],
    );
    if (!alreadyMember.rows.length && Number(count.rows[0]?.count) >= MAX_GROUP_MEMBERS) {
      await client.query("ROLLBACK");
      res.status(400).json({ error: `المجموعة وصلت إلى حد ${MAX_GROUP_MEMBERS} عضوًا.` });
      return;
    }
    await client.query(
      `INSERT INTO messenger_group_members (group_id, user_id, role)
       VALUES ($1, $2, 'member') ON CONFLICT (group_id, user_id) DO NOTHING`,
      [groupId, targetId],
    );
    await client.query("UPDATE messenger_groups SET updated_at = now() WHERE id = $1", [groupId]);
    await client.query("COMMIT");
    res.status(alreadyMember.rows.length ? 200 : 201).json({
      group: await groupDetail(pool, groupId, userId),
    });
  } catch (error) {
    await client.query("ROLLBACK").catch(() => undefined);
    next(error);
  } finally {
    client.release();
  }
});

router.delete(
  "/messenger/groups/:groupId/members/:userId",
  requireAuth,
  async (req, res, next) => {
    const pool = requirePool(await loadPool(), res);
    if (!pool || !(await requireGroupsSchema(pool, res))) return;
    const actorId = userIdFrom(res);
    const groupId = String(req.params.groupId);
    const targetId = String(req.params.userId);
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      await client.query(`SELECT id FROM messenger_groups WHERE id = $1 FOR UPDATE`, [groupId]);
      const roles = await client.query(
        `SELECT user_id, role FROM messenger_group_members
         WHERE group_id = $1 AND user_id = ANY($2::text[]) FOR UPDATE`,
        [groupId, [actorId, targetId]],
      );
      const roleByUser = new Map(roles.rows.map((row) => [row.user_id, row.role]));
      const actorRole = roleByUser.get(actorId);
      const targetRole = roleByUser.get(targetId);
      if (!actorRole || !targetRole) {
        await client.query("ROLLBACK");
        res.status(404).json({ error: "المجموعة أو العضو غير موجود." });
        return;
      }
      if (actorId === targetId || !canRemoveGroupMember(actorRole, targetRole)) {
        await client.query("ROLLBACK");
        res.status(403).json({ error: "لا تملك صلاحية إزالة هذا العضو." });
        return;
      }
      await client.query(
        `DELETE FROM messenger_group_members WHERE group_id = $1 AND user_id = $2`,
        [groupId, targetId],
      );
      await client.query("UPDATE messenger_groups SET updated_at = now() WHERE id = $1", [groupId]);
      await client.query("COMMIT");
      res.json({ group: await groupDetail(pool, groupId, actorId) });
    } catch (error) {
      await client.query("ROLLBACK").catch(() => undefined);
      next(error);
    } finally {
      client.release();
    }
  },
);

router.patch(
  "/messenger/groups/:groupId/members/:userId/role",
  requireAuth,
  async (req, res, next) => {
    try {
      const pool = requirePool(await loadPool(), res);
      if (!pool || !(await requireGroupsSchema(pool, res))) return;
      const actorId = userIdFrom(res);
      const groupId = String(req.params.groupId);
      const targetId = String(req.params.userId);
      const nextRole = req.body?.role;
      const client = await pool.connect();
      try {
        await client.query("BEGIN");
        await client.query(`SELECT id FROM messenger_groups WHERE id = $1 FOR UPDATE`, [groupId]);
        const roles = await client.query(
          `SELECT user_id, role FROM messenger_group_members
           WHERE group_id = $1 AND user_id = ANY($2::text[]) FOR UPDATE`,
          [groupId, [actorId, targetId]],
        );
        const roleByUser = new Map(roles.rows.map((row) => [row.user_id, row.role]));
        const actorRole = roleByUser.get(actorId);
        const targetRole = roleByUser.get(targetId);
        if (!actorRole || !targetRole) {
          await client.query("ROLLBACK");
          res.status(404).json({ error: "المجموعة أو العضو غير موجود." });
          return;
        }
        if (!canSetGroupMemberRole(actorRole, targetRole, nextRole)) {
          await client.query("ROLLBACK");
          res.status(403).json({ error: "تغيير صلاحيات الأعضاء متاح لمنشئ المجموعة فقط." });
          return;
        }
        await client.query(
          `UPDATE messenger_group_members SET role = $3
           WHERE group_id = $1 AND user_id = $2`,
          [groupId, targetId, nextRole],
        );
        await client.query("UPDATE messenger_groups SET updated_at = now() WHERE id = $1", [groupId]);
        await client.query("COMMIT");
        res.json({ group: await groupDetail(pool, groupId, actorId) });
      } catch (error) {
        await client.query("ROLLBACK").catch(() => undefined);
        next(error);
      } finally {
        client.release();
      }
    } catch (error) {
      next(error);
    }
  },
);

router.post("/messenger/groups/:groupId/leave", requireAuth, async (req, res, next) => {
  const pool = requirePool(await loadPool(), res);
  if (!pool || !(await requireGroupsSchema(pool, res))) return;
  const userId = userIdFrom(res);
  const groupId = String(req.params.groupId);
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const group = await client.query(
      `SELECT owner_id FROM messenger_groups WHERE id = $1 FOR UPDATE`,
      [groupId],
    );
    const member = await client.query(
      `SELECT role FROM messenger_group_members WHERE group_id = $1 AND user_id = $2 FOR UPDATE`,
      [groupId, userId],
    );
    if (!group.rows[0] || !member.rows[0]) {
      await client.query("ROLLBACK");
      res.status(404).json({ error: "المجموعة غير موجودة أو لم تعد عضوًا فيها." });
      return;
    }
    if (group.rows[0].owner_id === userId) {
      const successor = await client.query(
        `SELECT user_id FROM messenger_group_members
         WHERE group_id = $1 AND user_id <> $2
         ORDER BY CASE role WHEN 'admin' THEN 0 ELSE 1 END, joined_at, user_id
         LIMIT 1 FOR UPDATE`,
        [groupId, userId],
      );
      if (!successor.rows[0]) {
        await client.query(`DELETE FROM messenger_groups WHERE id = $1`, [groupId]);
        await client.query("COMMIT");
        res.json({ ok: true, groupDeleted: true });
        return;
      }
      await client.query(
        `UPDATE messenger_groups SET owner_id = $2, updated_at = now() WHERE id = $1`,
        [groupId, successor.rows[0].user_id],
      );
      await client.query(
        `UPDATE messenger_group_members SET role = 'owner'
         WHERE group_id = $1 AND user_id = $2`,
        [groupId, successor.rows[0].user_id],
      );
    }
    await client.query(
      `DELETE FROM messenger_group_members WHERE group_id = $1 AND user_id = $2`,
      [groupId, userId],
    );
    await client.query("COMMIT");
    res.json({ ok: true, groupDeleted: false });
  } catch (error) {
    await client.query("ROLLBACK").catch(() => undefined);
    next(error);
  } finally {
    client.release();
  }
});

router.patch("/messenger/groups/:groupId/mute", requireAuth, async (req, res, next) => {
  try {
    const pool = requirePool(await loadPool(), res);
    if (!pool || !(await requireGroupsSchema(pool, res))) return;
    const userId = userIdFrom(res);
    const groupId = String(req.params.groupId);
    if (typeof req.body?.isMuted !== "boolean") {
      res.status(400).json({ error: "قيمة الكتم غير صحيحة." });
      return;
    }
    if (!(await memberRole(pool, groupId, userId))) {
      res.status(404).json({ error: "المجموعة غير موجودة أو لم تعد عضوًا فيها." });
      return;
    }
    await pool.query(
      `INSERT INTO messenger_group_settings (group_id, user_id, is_muted)
       VALUES ($1, $2, $3)
       ON CONFLICT (group_id, user_id)
       DO UPDATE SET is_muted = EXCLUDED.is_muted, updated_at = now()`,
      [groupId, userId, req.body.isMuted],
    );
    res.json({ group: await groupDetail(pool, groupId, userId) });
  } catch (error) {
    next(error);
  }
});

router.get("/messenger/groups/:groupId/messages", requireAuth, async (req, res, next) => {
  try {
    const pool = requirePool(await loadPool(), res);
    if (!pool || !(await requireGroupsSchema(pool, res))) return;
    const groupId = String(req.params.groupId);
    const userId = userIdFrom(res);
    const parsedCursor = parseMessageCursor(req.query.beforeMessageId);
    if (!parsedCursor.valid) {
      res.status(400).json({ error: "مؤشر الرسائل غير صالح." });
      return;
    }
    const beforeMessageId = parsedCursor.cursor?.id ?? null;
    if (beforeMessageId) {
      const cursorExists = await pool.query(
        `SELECT 1
         FROM messenger_group_messages message
         JOIN messenger_group_members member
           ON member.group_id = message.group_id AND member.user_id = $3
         WHERE message.group_id = $1 AND message.id = $2`,
        [groupId, beforeMessageId, userId],
      );
      if (!cursorExists.rows[0]) {
        res.status(400).json({ error: "مؤشر الرسائل غير صالح." });
        return;
      }
    }
    const limit = Math.min(
      MAX_GROUP_MESSAGES,
      Math.max(1, Number.parseInt(String(req.query.limit ?? "80"), 10) || 80),
    );
    const result = await pool.query(
      `SELECT messages.id, messages.group_id, messages.sender_id,
              profiles.display_name AS sender_name, messages.body, messages.created_at
       FROM (
         SELECT id, group_id, sender_id, body, created_at
         FROM messenger_group_messages
         WHERE group_id = $1
            AND ($4::text IS NULL OR EXISTS (
              SELECT 1 FROM messenger_group_messages cursor
              WHERE cursor.id = $4 AND cursor.group_id = $1
                AND (messenger_group_messages.created_at < cursor.created_at
                     OR (messenger_group_messages.created_at = cursor.created_at
                         AND messenger_group_messages.id < cursor.id))
            ))
           AND EXISTS (
             SELECT 1 FROM messenger_group_members
             WHERE group_id = $1 AND user_id = $2
           )
          ORDER BY created_at DESC, id DESC
          LIMIT $3
       ) messages
       JOIN messenger_profiles profiles ON profiles.user_id = messages.sender_id
       ORDER BY messages.created_at, messages.id`,
      [groupId, userId, limit, beforeMessageId],
    );
    if (!result.rows.length && !(await memberRole(pool, groupId, userId))) {
      res.status(404).json({ error: "المجموعة غير موجودة أو لم تعد عضوًا فيها." });
      return;
    }
    res.json({ messages: result.rows.map(publicGroupMessage) });
  } catch (error) {
    next(error);
  }
});

router.post("/messenger/groups/:groupId/messages", requireAuth, async (req, res, next) => {
  try {
    const pool = requirePool(await loadPool(), res);
    if (!pool || !(await requireGroupsSchema(pool, res))) return;
    const groupId = String(req.params.groupId);
    const userId = userIdFrom(res);
    const body = typeof req.body?.body === "string" ? req.body.body.trim() : "";
    const clientMessageId =
      typeof req.body?.clientMessageId === "string" ? req.body.clientMessageId.trim() : "";
    if (!body || body.length > 4000 || clientMessageId.length < 8 || clientMessageId.length > 80) {
      res.status(400).json({ error: "تحقق من نص الرسالة ثم حاول مرة أخرى." });
      return;
    }
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      const group = await client.query(
        `SELECT id FROM messenger_groups WHERE id = $1 FOR SHARE`,
        [groupId],
      );
      const member = group.rows[0]
        ? await client.query(
            `SELECT 1 FROM messenger_group_members WHERE group_id = $1 AND user_id = $2`,
            [groupId, userId],
          )
        : { rows: [] };
      if (!member.rows.length) {
        await client.query("ROLLBACK");
        res.status(404).json({ error: "المجموعة غير موجودة أو لم تعد عضوًا فيها." });
        return;
      }
      const id = randomUUID();
      const result = await client.query(
        `INSERT INTO messenger_group_messages
           (id, group_id, sender_id, client_message_id, body)
         VALUES ($1, $2, $3, $4, $5)
         ON CONFLICT (group_id, sender_id, client_message_id) DO NOTHING
         RETURNING id, group_id, sender_id, body, created_at`,
        [id, groupId, userId, clientMessageId, body],
      );
      const row =
        result.rows[0] ??
        (
          await client.query(
            `SELECT id, group_id, sender_id, body, created_at
             FROM messenger_group_messages
             WHERE group_id = $1 AND sender_id = $2 AND client_message_id = $3`,
            [groupId, userId, clientMessageId],
          )
        ).rows[0];
      if (!row) {
        await client.query("ROLLBACK");
        res.status(409).json({ error: "تعذر حفظ الرسالة." });
        return;
      }
      await client.query("UPDATE messenger_groups SET updated_at = now() WHERE id = $1", [groupId]);
      await client.query("COMMIT");
      const sender = await pool.query(
        `SELECT display_name FROM messenger_profiles WHERE user_id = $1`,
        [userId],
      );
      const message = publicGroupMessage({
        ...row,
        sender_name: sender.rows[0]?.display_name ?? "",
      });
      if (result.rows.length) {
        void notifyGroupMessage(pool, {
          groupId,
          senderId: userId,
          body,
        });
      }
      res.status(result.rows.length ? 201 : 200).json({ message });
    } catch (error) {
      await client.query("ROLLBACK").catch(() => undefined);
      throw error;
    } finally {
      client.release();
    }
  } catch (error) {
    next(error);
  }
});

router.get("/messenger/statuses", requireAuth, async (_req, res, next) => {
  try {
    const pool = requirePool(await loadPool(), res);
    if (!pool || !(await requireGroupsSchema(pool, res))) return;
    const userId = userIdFrom(res);
    const result = await pool.query(
      `SELECT s.id, s.author_id, author.display_name AS author_name,
              s.body,
              CASE WHEN s.author_id = $1 THEN s.audience_mode ELSE 'selected' END AS audience_mode,
              s.created_at, s.expires_at, (s.author_id = $1) AS is_mine
       FROM messenger_status_updates s
       JOIN messenger_profiles author ON author.user_id = s.author_id
       WHERE s.expires_at > now()
         AND (s.author_id = $1 OR EXISTS (
           SELECT 1 FROM messenger_status_audience audience
           WHERE audience.status_id = s.id AND audience.user_id = $1
         ))
       ORDER BY s.created_at DESC, s.id
       LIMIT 100`,
      [userId],
    );
    res.json({
      statuses: result.rows.map((row) => ({
        id: row.id,
        authorId: row.author_id,
        authorName: row.author_name,
        body: row.body,
        audienceMode: row.audience_mode,
        createdAt: row.created_at,
        expiresAt: row.expires_at,
        isMine: Boolean(row.is_mine),
      })),
    });
  } catch (error) {
    next(error);
  }
});

router.post("/messenger/statuses", requireAuth, async (req, res, next) => {
  const pool = requirePool(await loadPool(), res);
  if (!pool || !(await requireGroupsSchema(pool, res))) return;
  const authorId = userIdFrom(res);
  const body = normalizeStatusBody(req.body?.body);
  const audience = normalizeStatusAudience(
    req.body?.audienceMode,
    req.body?.audienceUserIds,
    authorId,
  );
  if (!body || !audience) {
    res.status(400).json({ error: "تحقق من نص الحالة والجمهور المختار." });
    return;
  }
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    let audienceIds = audience.userIds;
    if (audience.mode === "contacts") {
      const contacts = await client.query(
        `SELECT DISTINCT CASE WHEN user_a = $1 THEN user_b ELSE user_a END AS user_id
         FROM messenger_conversations
         WHERE user_a = $1 OR user_b = $1`,
        [authorId],
      );
      audienceIds = contacts.rows.map((row) => String(row.user_id));
    } else {
      const validContacts = await client.query(
        `SELECT DISTINCT CASE WHEN user_a = $1 THEN user_b ELSE user_a END AS user_id
         FROM messenger_conversations
         WHERE (user_a = $1 OR user_b = $1)
           AND CASE WHEN user_a = $1 THEN user_b ELSE user_a END = ANY($2::text[])`,
        [authorId, audienceIds],
      );
      if (validContacts.rows.length !== audienceIds.length) {
        await client.query("ROLLBACK");
        res.status(400).json({ error: "اختر أشخاصًا توجد بينك وبينهم محادثة فقط." });
        return;
      }
    }
    if (!audienceIds.length) {
      await client.query("ROLLBACK");
      res.status(400).json({ error: "لا توجد جهات اتصال لاختيارها لهذه الحالة." });
      return;
    }
    if (audienceIds.length > 100) {
      await client.query("ROLLBACK");
      res.status(400).json({ error: "اختر حتى 100 جهة اتصال للحالة الواحدة." });
      return;
    }
    const id = randomUUID();
    const created = await client.query(
      `INSERT INTO messenger_status_updates
         (id, author_id, body, audience_mode, expires_at)
       VALUES ($1, $2, $3, $4, now() + interval '24 hours')
       RETURNING id, author_id, body, audience_mode, created_at, expires_at`,
      [id, authorId, body, audience.mode],
    );
    await client.query(
      `INSERT INTO messenger_status_audience (status_id, user_id)
       SELECT $1, audience.user_id FROM unnest($2::text[]) AS audience(user_id)`,
      [id, audienceIds],
    );
    await client.query("COMMIT");
    const row = created.rows[0];
    const profile = await pool.query(
      `SELECT display_name FROM messenger_profiles WHERE user_id = $1`,
      [authorId],
    );
    res.status(201).json({
      status: {
        id: row.id,
        authorId: row.author_id,
        authorName: profile.rows[0]?.display_name ?? "",
        body: row.body,
        audienceMode: row.audience_mode,
        createdAt: row.created_at,
        expiresAt: row.expires_at,
        isMine: true,
      },
    });
  } catch (error) {
    await client.query("ROLLBACK").catch(() => undefined);
    next(error);
  } finally {
    client.release();
  }
});

router.delete("/messenger/statuses/:statusId", requireAuth, async (req, res, next) => {
  try {
    const pool = requirePool(await loadPool(), res);
    if (!pool || !(await requireGroupsSchema(pool, res))) return;
    const result = await pool.query(
      `DELETE FROM messenger_status_updates
       WHERE id = $1 AND author_id = $2 RETURNING id`,
      [String(req.params.statusId), userIdFrom(res)],
    );
    if (!result.rows[0]) {
      res.status(404).json({ error: "الحالة غير موجودة أو لا تملك صلاحية حذفها." });
      return;
    }
    res.json({ ok: true });
  } catch (error) {
    next(error);
  }
});

router.post("/messenger/reports", requireAuth, async (req, res, next) => {
  try {
    const pool = requirePool(await loadPool(), res);
    if (!pool || !(await requireGroupsSchema(pool, res))) return;
    const userId = userIdFrom(res);
    const targetType = req.body?.targetType;
    const targetId = typeof req.body?.targetId === "string" ? req.body.targetId.trim() : "";
    const reason = typeof req.body?.reason === "string" ? req.body.reason.trim() : "";
    if (
      !["group_message", "status", "user", "direct_message"].includes(targetType) ||
      !targetId ||
      !reason ||
      reason.length < 5 ||
      reason.length > 500
    ) {
      res.status(400).json({ error: "اختر سببًا واضحًا للإبلاغ." });
      return;
    }
    if (
      (targetType === "user" || targetType === "direct_message") &&
      !(await hasMessengerBlocksSchema(pool))
    ) {
      res.status(503).json({ error: "تحديث قاعدة البيانات مطلوب" });
      return;
    }
    const now = Date.now();
    const window = reportWindows.get(userId);
    if (!window || now >= window.resetAt) {
      reportWindows.set(userId, { count: 1, resetAt: now + 60_000 });
    } else if (window.count >= 5) {
      res.status(429).json({ error: "حاول الإبلاغ مرة أخرى بعد قليل." });
      return;
    } else {
      window.count += 1;
    }
    const visible =
      targetType === "group_message"
        ? await pool.query(
            `SELECT 1
             FROM messenger_group_messages message
             JOIN messenger_group_members member
               ON member.group_id = message.group_id AND member.user_id = $2
             WHERE message.id = $1 AND message.sender_id <> $2`,
            [targetId, userId],
          )
          : targetType === "status"
        ? await pool.query(
            `SELECT 1 FROM messenger_status_updates status
             WHERE status.id = $1 AND status.author_id <> $2 AND status.expires_at > now()
               AND EXISTS (
                 SELECT 1 FROM messenger_status_audience audience
                 WHERE audience.status_id = status.id AND audience.user_id = $2
               )`,
            [targetId, userId],
          )
        : targetType === "user"
          ? await pool.query(
              `SELECT 1 FROM messenger_profiles
               WHERE user_id = $1 AND user_id <> $2`,
              [targetId, userId],
            )
          : await pool.query(
              `SELECT 1
               FROM messenger_messages message
               JOIN messenger_conversations conversation
                 ON conversation.id = message.conversation_id
               WHERE message.id = $1
                 AND (conversation.user_a = $2 OR conversation.user_b = $2)`,
              [targetId, userId],
            );
    if (!visible.rows.length) {
      res.status(404).json({ error: "المحتوى غير موجود أو لم يعد ظاهرًا لك." });
      return;
    }
    const id = randomUUID();
    const inserted = await pool.query(
      `INSERT INTO messenger_content_reports (id, reporter_id, target_type, target_id, reason)
       VALUES ($1, $2, $3, $4, $5)
       ON CONFLICT (reporter_id, target_type, target_id) DO NOTHING
       RETURNING id`,
      [id, userId, targetType, targetId, reason],
    );
    res.status(inserted.rows.length ? 201 : 200).json({
      ok: true,
      alreadyReported: !inserted.rows.length,
    });
  } catch (error) {
    next(error);
  }
});

export default router;
