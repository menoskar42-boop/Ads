import { Router } from "express";
import { db, profilesTable, userRolesTable, referralsTable } from "@workspace/db";
import { eq, inArray } from "drizzle-orm";
import crypto from "crypto";
import bcrypt from "bcryptjs";
import { signSession } from "../lib/session";
import { requireAuth, requireRole } from "../middleware/auth";

const router = Router();
const BCRYPT_ROUNDS = 12;

async function hashPassword(pw: string) { return bcrypt.hash(pw, BCRYPT_ROUNDS); }

async function verifyPassword(pw: string, hash: string) {
  if (hash.length === 64 && /^[0-9a-f]+$/.test(hash)) {
    return crypto.createHash("sha256").update(pw + "fh_salt").digest("hex") === hash;
  }
  return bcrypt.compare(pw, hash);
}

function generateReferralCode() { return crypto.randomBytes(3).toString("hex").toUpperCase(); }

function sanitizeProfile(p: typeof profilesTable.$inferSelect) {
  const { password_hash: _h, ...safe } = p;
  return safe;
}

router.post("/auth/signup", async (req, res) => {
  const { email, password, full_name } = req.body;
  if (!email || !password) return res.status(400).json({ error: "Email and password required" });
  if (password.length < 6) return res.status(400).json({ error: "Password must be at least 6 characters" });

  const existing = await db.select({ id: profilesTable.id }).from(profilesTable)
    .where(eq(profilesTable.email, email.toLowerCase())).limit(1);
  if (existing.length) return res.status(400).json({ error: "Email already registered" });

  const user_id = crypto.randomUUID();
  const [profile] = await db.insert(profilesTable).values({
    user_id,
    full_name,
    email: email.toLowerCase(),
    password_hash: await hashPassword(password),
    referral_code: generateReferralCode(),
  }).returning();

  await db.insert(userRolesTable).values({ user_id, role: "customer" }).onConflictDoNothing();
  res.status(201).json({
    user: { id: profile.user_id, email: profile.email, user_metadata: { full_name } },
    session_token: signSession(profile.user_id),
  });
});

router.post("/auth/signin", async (req, res) => {
  const { email, password } = req.body;
  if (!email || !password) return res.status(400).json({ error: "Email and password required" });

  const [profile] = await db.select().from(profilesTable)
    .where(eq(profilesTable.email, email.toLowerCase())).limit(1);
  if (!profile?.password_hash) return res.status(401).json({ error: "Invalid email or password" });

  const valid = await verifyPassword(password, profile.password_hash);
  if (!valid) return res.status(401).json({ error: "Invalid email or password" });

  if (profile.password_hash.length === 64 && /^[0-9a-f]+$/.test(profile.password_hash)) {
    await db.update(profilesTable)
      .set({ password_hash: await hashPassword(password) })
      .where(eq(profilesTable.user_id, profile.user_id));
  }

  res.json({
    user: { id: profile.user_id, email: profile.email, user_metadata: { full_name: profile.full_name } },
    session_token: signSession(profile.user_id),
  });
});

// Public display-name lookup used by review lists — returns only non-PII fields
router.get("/auth/profiles/display", async (req, res) => {
  const { user_id__in } = req.query;
  if (!user_id__in) return res.status(400).json({ error: "user_id__in required" });
  const ids = (user_id__in as string).split(",").slice(0, 100);
  const rows = await db.select({
    user_id: profilesTable.user_id,
    full_name: profilesTable.full_name,
    avatar_url: profilesTable.avatar_url,
  }).from(profilesTable).where(inArray(profilesTable.user_id, ids));
  res.json(rows);
});

// GET /auth/me — return current user's profile from session token
router.get("/auth/me", requireAuth, async (req, res) => {
  const [p] = await db.select().from(profilesTable).where(eq(profilesTable.user_id, req.userId!)).limit(1);
  if (!p) return res.status(404).json({ error: "Not found" });
  const roles = await db.select({ role: userRolesTable.role }).from(userRolesTable)
    .where(eq(userRolesTable.user_id, req.userId!));
  res.json({ ...sanitizeProfile(p), roles: roles.map(r => r.role) });
});

router.get("/auth/profiles", requireAuth, async (req, res) => {
  const isAdmin = (req.userRoles ?? []).includes("admin");
  const { user_id, user_id__in } = req.query;
  if (user_id__in) {
    // Any authenticated user may bulk-fetch profiles (sanitized — no password_hash)
    // Admins get full sanitized profile; regular users only get non-PII display fields
    const ids = (user_id__in as string).split(",").slice(0, 100);
    const rows = await db.select().from(profilesTable).where(inArray(profilesTable.user_id, ids));
    if (isAdmin) return res.json(rows.map(sanitizeProfile));
    return res.json(rows.map(p => ({
      user_id: p.user_id,
      full_name: p.full_name,
      avatar_url: p.avatar_url,
      referral_code: p.referral_code,
      referred_by: p.referred_by,
    })));
  }
  if (!user_id) return res.status(400).json({ error: "user_id required" });
  if (!isAdmin && user_id !== req.userId) return res.status(403).json({ error: "Forbidden" });
  res.json((await db.select().from(profilesTable).where(eq(profilesTable.user_id, user_id as string))).map(sanitizeProfile));
});

router.get("/auth/profiles/:userId", requireAuth, async (req, res) => {
  const isAdmin = (req.userRoles ?? []).includes("admin");
  if (!isAdmin && req.params.userId !== req.userId) return res.status(403).json({ error: "Forbidden" });
  const [p] = await db.select().from(profilesTable).where(eq(profilesTable.user_id, req.params.userId)).limit(1);
  if (!p) return res.status(404).json({ error: "Not found" });
  res.json(sanitizeProfile(p));
});

router.patch("/auth/profiles/:userId", requireAuth, async (req, res) => {
  if (req.userId !== req.params.userId) return res.status(403).json({ error: "Forbidden" });
  const { password_hash: _h, email: _e, ...rest } = req.body;
  const [p] = await db.update(profilesTable).set({ ...rest, updated_at: new Date() })
    .where(eq(profilesTable.user_id, req.params.userId)).returning();
  if (!p) return res.status(404).json({ error: "Not found" });
  res.json(sanitizeProfile(p));
});

router.patch("/auth/profiles", requireAuth, async (req, res) => {
  const { password_hash: _h, email: _e, ...rest } = req.body;
  const [p] = await db.update(profilesTable).set({ ...rest, updated_at: new Date() })
    .where(eq(profilesTable.user_id, req.userId!)).returning();
  if (!p) return res.status(404).json({ error: "Not found" });
  res.json(sanitizeProfile(p));
});

router.get("/auth/roles-table", requireAuth, async (req, res) => {
  const { user_id } = req.query;
  if (!user_id) return res.status(400).json({ error: "user_id required" });
  if (!(req.userRoles ?? []).includes("admin") && user_id !== req.userId) {
    return res.status(403).json({ error: "Forbidden" });
  }
  res.json(await db.select().from(userRolesTable).where(eq(userRolesTable.user_id, user_id as string)));
});

router.post("/auth/roles-table", requireAuth, requireRole("admin"), async (req, res) => {
  const { user_id, role } = req.body;
  if (!user_id || !role) return res.status(400).json({ error: "user_id and role required" });
  const [row] = await db.insert(userRolesTable).values({ user_id, role }).onConflictDoNothing().returning();
  res.status(201).json(row ?? { user_id, role });
});

router.get("/auth/roles/:userId", requireAuth, async (req, res) => {
  if (!(req.userRoles ?? []).includes("admin") && req.params.userId !== req.userId) {
    return res.status(403).json({ error: "Forbidden" });
  }
  const roles = await db.select().from(userRolesTable).where(eq(userRolesTable.user_id, req.params.userId));
  res.json(roles.map(r => r.role));
});

router.get("/auth/referral/:code", async (req, res) => {
  const [p] = await db.select({ user_id: profilesTable.user_id }).from(profilesTable)
    .where(eq(profilesTable.referral_code, req.params.code.toUpperCase())).limit(1);
  if (!p) return res.status(404).json({ error: "Invalid referral code" });
  res.json({ referrer_id: p.user_id });
});

router.post("/auth/referrals-table", requireAuth, async (req, res) => {
  const { referred_id: _ignored, ...rest } = req.body;
  const [referral] = await db.insert(referralsTable).values({ ...rest, referred_id: req.userId! }).returning();
  res.status(201).json(referral);
});

router.get("/auth/referrals-table", requireAuth, async (req, res) => {
  const isAdmin = (req.userRoles ?? []).includes("admin");
  const { referrer_id, referred_id } = req.query;
  let rows = await db.select().from(referralsTable);
  if (isAdmin) {
    if (referrer_id) rows = rows.filter(r => r.referrer_id === referrer_id);
    if (referred_id) rows = rows.filter(r => r.referred_id === referred_id);
  } else {
    if ((referrer_id && referrer_id !== req.userId) || (referred_id && referred_id !== req.userId)) {
      return res.status(403).json({ error: "Forbidden" });
    }
    rows = rows.filter(r => r.referrer_id === req.userId || r.referred_id === req.userId);
  }
  res.json(rows);
});

router.get("/auth/referrals", requireAuth, async (req, res) => {
  const isAdmin = (req.userRoles ?? []).includes("admin");
  const { referrer_id } = req.query;
  let rows = await db.select().from(referralsTable);
  if (isAdmin) {
    if (referrer_id) rows = rows.filter(r => r.referrer_id === referrer_id);
  } else {
    if (referrer_id && referrer_id !== req.userId) return res.status(403).json({ error: "Forbidden" });
    rows = rows.filter(r => r.referrer_id === req.userId || r.referred_id === req.userId);
  }
  res.json(rows);
});

export default router;
