import type { Express } from "express";
import { eq, and, or } from "drizzle-orm";
import { drizzle } from "drizzle-orm/node-postgres";
import pg from "pg";
import {
  churches, churchAdmins, readingGroups, groupMembers,
} from "@shared/schema";

const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
// Swallow idle-client errors (Neon auto-suspend) so they don't crash the process.
pool.on('error', (err) => console.error('[pg] church-routes idle client error (recovered):', err.message));
const db = drizzle(pool);

function generateCode(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let code = '';
  for (let i = 0; i < 5; i++) {
    code += chars[Math.floor(Math.random() * chars.length)];
  }
  return code;
}

function generateKey(): string {
  return Math.random().toString(36).substring(2, 15) + Date.now().toString(36);
}

// The site-admin phone was committed here as a fallback — a secret in a
// public repo, and the only auth factor these church/challenge admin
// endpoints check. Now env-only and fail-closed: if ADMIN_PHONE is unset,
// admin is denied rather than defaulting to a known value. The owner must
// set ADMIN_PHONE as a deployment secret to use admin.
const ADMIN_PHONE = process.env.ADMIN_PHONE || '';
if (!ADMIN_PHONE) console.warn('[security] ADMIN_PHONE not set — church/challenge admin is disabled until it is.');

export function registerChurchRoutes(app: Express) {

  app.post('/api/ministry/login', async (req, res) => {
    try {
      const { name, phone } = req.body;
      if (!name || !phone) {
        return res.status(400).json({ error: 'الاسم ورقم الموبايل مطلوبان' });
      }

      const normalizedPhone = phone.trim().replace(/\s+/g, '');

      // Super admin bypass
      if (normalizedPhone === ADMIN_PHONE) {
        return res.json({ role: 'admin', groups: [] });
      }

      // Look up member records by phone
      const members = await db.select({
        member: groupMembers,
        group: readingGroups,
      }).from(groupMembers)
        .innerJoin(readingGroups, eq(groupMembers.groupId, readingGroups.id))
        .where(eq(groupMembers.phone, normalizedPhone));

      // مستخدم جديد — مش في أي مجموعة بعد، نسمح له بالدخول بمجموعات فاضية
      if (members.length === 0) {
        return res.json({ role: 'user', groups: [], isNew: true });
      }

      // Verify name matches at least one record
      const nameMatch = members.find(
        m => m.member.userName.trim() === name.trim()
      );
      if (!nameMatch) {
        return res.status(401).json({
          error: 'الاسم لا يطابق الرقم المسجل. تأكد من الاسم الذي سجلته عند الانضمام.'
        });
      }

      // Build groups list with memberKeys
      const groups = members.map(m => ({
        groupCode: m.group.groupCode,
        groupName: m.group.name,
        churchName: m.group.churchName || '',
        memberKey: m.member.memberKey,
        userName: m.member.userName,
        isAdmin: m.member.isAdmin || m.group.leaderKey === m.member.memberKey,
      }));

      res.json({ role: 'user', groups });
    } catch (err) {
      console.error('[ministry] login error:', err);
      res.status(500).json({ error: 'فشل تسجيل الدخول' });
    }
  });

  app.post('/api/churches/request', async (req, res) => {
    try {
      const { name, governorate, adminName, adminPhone, notes } = req.body;
      if (!name || !governorate || !adminName || !adminPhone) {
        return res.status(400).json({ error: 'جميع الحقول المطلوبة يجب ملؤها' });
      }

      const [church] = await db.insert(churches).values({
        name,
        governorate,
        adminName,
        adminPhone,
        notes: notes || null,
        status: 'pending',
      }).returning();

      res.json({ church });
    } catch (err) {
      console.error('[churches] request error:', err);
      res.status(500).json({ error: 'فشل إرسال الطلب' });
    }
  });

  app.get('/api/churches', async (req, res) => {
    try {
      const approved = await db.select().from(churches).where(eq(churches.status, 'approved'));
      res.json({ churches: approved });
    } catch (err) {
      console.error('[churches] list error:', err);
      res.status(500).json({ error: 'فشل تحميل الكنائس' });
    }
  });

  app.get('/api/churches/all', async (req, res) => {
    try {
      const all = await db.select().from(churches);
      res.json({ churches: all });
    } catch (err) {
      console.error('[churches] list all error:', err);
      res.status(500).json({ error: 'فشل تحميل الكنائس' });
    }
  });

  // ── كل الكنائس مع مجموعاتها لأدمن الموقع ──
  app.get('/api/admin/churches', async (req, res) => {
    try {
      const phone = req.query.phone as string;
      if (phone !== ADMIN_PHONE) return res.status(403).json({ error: 'غير مسموح' });

      const allChurches = await db.select().from(churches).where(
        eq(churches.status, 'approved')
      );
      const allDisabled = await db.select().from(churches).where(eq(churches.status, 'disabled'));
      const combined = [...allChurches, ...allDisabled];

      const result = await Promise.all(combined.map(async (c) => {
        const groups = await db.select({
          id: readingGroups.id,
          groupCode: readingGroups.groupCode,
          name: readingGroups.name,
          leaderName: readingGroups.leaderName,
          createdAt: readingGroups.createdAt,
        }).from(readingGroups).where(eq(readingGroups.churchId, c.id));
        return { ...c, groups };
      }));

      res.json({ churches: result });
    } catch (err) {
      console.error('[admin] churches error:', err);
      res.status(500).json({ error: 'فشل تحميل الكنائس' });
    }
  });

  app.get('/api/churches/pending', async (req, res) => {
    try {
      const phone = req.query.phone as string;
      if (phone !== ADMIN_PHONE) {
        return res.status(403).json({ error: 'غير مسموح' });
      }
      const pending = await db.select().from(churches).where(eq(churches.status, 'pending'));
      res.json({ churches: pending });
    } catch (err) {
      console.error('[churches] pending error:', err);
      res.status(500).json({ error: 'فشل تحميل الطلبات' });
    }
  });

  app.put('/api/churches/:id/approve', async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      const [church] = await db.update(churches)
        .set({ status: 'approved' })
        .where(eq(churches.id, id))
        .returning();

      if (!church) return res.status(404).json({ error: 'الكنيسة غير موجودة' });

      await pool.query(
        `INSERT INTO church_admins (church_id, phone, name)
         SELECT $1, $2, $3
         WHERE NOT EXISTS (SELECT 1 FROM church_admins WHERE church_id = $1 AND phone = $2)`,
        [id, church.adminPhone, church.adminName]
      );

      res.json({ church });
    } catch (err) {
      console.error('[churches] approve error:', err);
      res.status(500).json({ error: 'فشل الموافقة' });
    }
  });

  app.put('/api/churches/:id/reject', async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      const [church] = await db.update(churches)
        .set({ status: 'rejected' })
        .where(eq(churches.id, id))
        .returning();

      if (!church) return res.status(404).json({ error: 'الكنيسة غير موجودة' });
      res.json({ church });
    } catch (err) {
      console.error('[churches] reject error:', err);
      res.status(500).json({ error: 'فشل الرفض' });
    }
  });

  // ── تعطيل / تفعيل كنيسة (أدمن الموقع) ──
  app.put('/api/churches/:id/toggle-status', async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      const { phone } = req.body;
      if (phone !== ADMIN_PHONE) return res.status(403).json({ error: 'غير مسموح' });

      const [current] = await db.select().from(churches).where(eq(churches.id, id));
      if (!current) return res.status(404).json({ error: 'الكنيسة غير موجودة' });

      const newStatus = current.status === 'disabled' ? 'approved' : 'disabled';
      const [church] = await db.update(churches).set({ status: newStatus }).where(eq(churches.id, id)).returning();
      res.json({ church });
    } catch (err) {
      console.error('[churches] toggle-status error:', err);
      res.status(500).json({ error: 'فشل تغيير الحالة' });
    }
  });

  // ── حذف كنيسة نهائياً مع جميع مجموعاتها (أدمن الموقع) ──
  app.delete('/api/churches/:id', async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      const { phone } = req.body;
      if (phone !== ADMIN_PHONE) return res.status(403).json({ error: 'غير مسموح' });

      // حذف أعضاء المجموعات التابعة للكنيسة
      const churchGroups = await db.select({ id: readingGroups.id }).from(readingGroups).where(eq(readingGroups.churchId, id));
      for (const g of churchGroups) {
        await db.delete(groupMembers).where(eq(groupMembers.groupId, g.id));
      }
      await db.delete(readingGroups).where(eq(readingGroups.churchId, id));
      await db.delete(churchAdmins).where(eq(churchAdmins.churchId, id));
      await db.delete(churches).where(eq(churches.id, id));

      res.json({ success: true });
    } catch (err) {
      console.error('[churches] delete error:', err);
      res.status(500).json({ error: 'فشل الحذف' });
    }
  });

  // ── حذف مجموعة من كنيسة (أدمن الموقع) ──
  app.delete('/api/admin/groups/:code', async (req, res) => {
    try {
      const { phone } = req.body;
      if (phone !== ADMIN_PHONE) return res.status(403).json({ error: 'غير مسموح' });

      const code = req.params.code.toUpperCase();
      const [group] = await db.select().from(readingGroups).where(eq(readingGroups.groupCode, code));
      if (!group) return res.status(404).json({ error: 'المجموعة غير موجودة' });

      await db.delete(groupMembers).where(eq(groupMembers.groupId, group.id));
      await db.delete(readingGroups).where(eq(readingGroups.id, group.id));

      res.json({ success: true });
    } catch (err) {
      console.error('[admin] delete group error:', err);
      res.status(500).json({ error: 'فشل حذف المجموعة' });
    }
  });

  app.get('/api/churches/:id', async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      const [church] = await db.select().from(churches).where(eq(churches.id, id));
      if (!church || church.status !== 'approved') {
        return res.status(404).json({ error: 'الكنيسة غير موجودة' });
      }

      const groups = await db.select().from(readingGroups).where(eq(readingGroups.churchId, id));
      const adminsResult = await pool.query(
        `SELECT id, church_id AS "churchId", phone, name, COALESCE(role, 'admin') AS role, created_at AS "createdAt"
         FROM church_admins WHERE church_id = $1`, [id]
      );

      res.json({ church, groups, admins: adminsResult.rows });
    } catch (err) {
      console.error('[churches] get error:', err);
      res.status(500).json({ error: 'فشل تحميل الكنيسة' });
    }
  });

  app.get('/api/churches/:id/is-admin', async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      const phone = req.query.phone as string;
      if (!phone) return res.json({ isAdmin: false });

      const adminsResult = await pool.query(
        `SELECT COALESCE(role, 'admin') AS role FROM church_admins WHERE church_id = $1 AND phone = $2`,
        [id, phone]
      );

      res.json({ isAdmin: adminsResult.rows.length > 0, role: adminsResult.rows[0]?.role ?? null });
    } catch (err) {
      res.json({ isAdmin: false, role: null });
    }
  });

  app.post('/api/churches/:id/groups', async (req, res) => {
    try {
      const churchId = parseInt(req.params.id);
      const { name, ageGroup, description, leaderName, leaderPhone } = req.body;

      if (!name || !leaderName) {
        return res.status(400).json({ error: 'اسم المجموعة واسم الخادم مطلوبان' });
      }

      const [church] = await db.select().from(churches).where(eq(churches.id, churchId));
      if (!church || church.status !== 'approved') {
        return res.status(404).json({ error: 'الكنيسة غير موجودة' });
      }

      const authCheck = await pool.query(
        `SELECT id FROM church_admins WHERE church_id = $1 AND phone = $2`,
        [churchId, leaderPhone]
      );
      if (authCheck.rows.length === 0) {
        return res.status(403).json({ error: 'غير مسموح - يجب أن تكون أدمن الكنيسة' });
      }

      const groupCode = generateCode();
      const leaderKey = generateKey();

      const [group] = await db.insert(readingGroups).values({
        groupCode,
        name,
        churchName: church.name,
        churchId,
        ageGroup: ageGroup || null,
        description: description || null,
        leaderName,
        leaderKey,
      }).returning();

      await db.insert(groupMembers).values({
        groupId: group.id,
        userName: leaderName,
        memberKey: leaderKey,
        isAdmin: true,
      });

      res.json({ group, leaderKey });
    } catch (err) {
      console.error('[churches] create group error:', err);
      res.status(500).json({ error: 'فشل إنشاء المجموعة' });
    }
  });

  app.post('/api/churches/:id/admins', async (req, res) => {
    try {
      const churchId = parseInt(req.params.id);
      const { name, phone, requestorPhone } = req.body;

      if (!name || !phone) {
        return res.status(400).json({ error: 'الاسم والموبايل مطلوبان' });
      }

      const reqCheck = await pool.query(
        `SELECT id FROM church_admins WHERE church_id = $1 AND phone = $2`,
        [churchId, requestorPhone]
      );
      if (reqCheck.rows.length === 0) {
        return res.status(403).json({ error: 'غير مسموح' });
      }

      const existingCheck = await pool.query(
        `SELECT id, church_id AS "churchId", phone, name, COALESCE(role, 'admin') AS role FROM church_admins WHERE church_id = $1 AND phone = $2`,
        [churchId, phone]
      );
      if (existingCheck.rows.length > 0) {
        return res.json({ admin: existingCheck.rows[0], alreadyExists: true });
      }

      const adminInsert = await pool.query(
        `INSERT INTO church_admins (church_id, phone, name, role) VALUES ($1, $2, $3, 'admin') RETURNING id, church_id AS "churchId", phone, name, COALESCE(role, 'admin') AS role`,
        [churchId, phone, name]
      );
      const admin = adminInsert.rows[0];

      res.json({ admin });
    } catch (err) {
      console.error('[churches] add admin error:', err);
      res.status(500).json({ error: 'فشل إضافة أدمن' });
    }
  });

  app.post('/api/churches/:id/servants', async (req, res) => {
    try {
      const churchId = parseInt(req.params.id);
      const { name, phone, requestorPhone } = req.body;

      if (!name || !phone) {
        return res.status(400).json({ error: 'الاسم والموبايل مطلوبان' });
      }

      // فقط أدمن كامل (role='admin') يقدر يضيف خادم
      const requestorCheck = await pool.query(
        `SELECT COALESCE(role, 'admin') AS role FROM church_admins WHERE church_id = $1 AND phone = $2`,
        [churchId, requestorPhone]
      );
      if (requestorCheck.rows.length === 0 || requestorCheck.rows[0].role !== 'admin') {
        return res.status(403).json({ error: 'غير مسموح - يجب أن تكون أدمن الكنيسة' });
      }

      const existingServant = await pool.query(
        `SELECT id, church_id AS "churchId", phone, name, COALESCE(role, 'admin') AS role FROM church_admins WHERE church_id = $1 AND phone = $2`,
        [churchId, phone]
      );
      if (existingServant.rows.length > 0) {
        return res.json({ servant: existingServant.rows[0], alreadyExists: true });
      }

      const normalizedPhone = String(phone).replace(/\s/g, '');
      const servantInsert = await pool.query(
        `INSERT INTO church_admins (church_id, phone, name, role) VALUES ($1, $2, $3, 'servant') RETURNING id, church_id AS "churchId", phone, name, role`,
        [churchId, normalizedPhone, name]
      );
      const servant = servantInsert.rows[0];

      res.json({ servant });
    } catch (err) {
      console.error('[churches] add servant error:', err);
      res.status(500).json({ error: 'فشل إضافة الخادم' });
    }
  });
}
