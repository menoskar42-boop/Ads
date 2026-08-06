import type { Express } from "express";
import { eq, and, desc } from "drizzle-orm";
import { drizzle } from "drizzle-orm/node-postgres";
import pg from "pg";
import {
  readingGroups, groupMembers, groupReadingLogs, groupMessages, groupMissions,
  challengeParticipants, churchChallenges,
  groupAssignments, assignmentReadings, groupJoinRequests, groupGuestTokens,
} from "@shared/schema";
import crypto from "crypto";

const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
// Swallow idle-client errors (Neon auto-suspend) so they don't crash the process.
pool.on('error', (err) => console.error('[pg] group-routes idle client error (recovered):', err.message));
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

async function isAdminMember(groupId: number, memberKey: string): Promise<boolean> {
  const members = await db.select().from(groupMembers)
    .where(and(eq(groupMembers.groupId, groupId), eq(groupMembers.memberKey, memberKey)));
  return members.length > 0 && members[0].isAdmin === true;
}

async function isAdminByLeaderKey(group: any, memberKey: string): Promise<boolean> {
  if (memberKey === group.leaderKey) return true;
  return isAdminMember(group.id, memberKey);
}

// ينقل كل تاريخ العضو من اسم قديم لاسم جديد (سجلات القراءة + المهام + الرسائل)
// مع تجنّب التكرار في سجلات القراءة، حتى لا يتيتّم تاريخ العضو عند تغيير اسمه.
async function migrateMemberName(groupId: number, oldName: string, newName: string): Promise<void> {
  if (!oldName || !newName || oldName === newName) return;
  // group_reading_logs — احذف المكرّر (نفس السفر/الإصحاح) ثم انقل
  await pool.query(
    `DELETE FROM group_reading_logs g
     WHERE g.group_id = $1 AND g.user_name = $2
       AND EXISTS (SELECT 1 FROM group_reading_logs r
         WHERE r.group_id = $1 AND r.user_name = $3 AND r.book = g.book AND r.chapter = g.chapter)`,
    [groupId, oldName, newName]
  );
  await pool.query(
    `UPDATE group_reading_logs SET user_name = $1 WHERE group_id = $2 AND user_name = $3`,
    [newName, groupId, oldName]
  );
  // assignment_readings — احذف المكرّر ثم انقل
  await pool.query(
    `DELETE FROM assignment_readings g
     WHERE g.group_id = $1 AND g.user_name = $2
       AND EXISTS (SELECT 1 FROM assignment_readings r
         WHERE r.group_id = $1 AND r.user_name = $3 AND r.book_name = g.book_name AND r.chapter = g.chapter)`,
    [groupId, oldName, newName]
  );
  await pool.query(
    `UPDATE assignment_readings SET user_name = $1 WHERE group_id = $2 AND user_name = $3`,
    [newName, groupId, oldName]
  );
  // group_messages — نقل مباشر (كل رسالة فريدة)
  await pool.query(
    `UPDATE group_messages SET user_name = $1 WHERE group_id = $2 AND user_name = $3`,
    [newName, groupId, oldName]
  );
}

export function registerGroupRoutes(app: Express) {

  // ── معلومات الدعوة (endpoint عام بدون auth) ──
  app.get('/api/groups/:code/invite-info', async (req, res) => {
    try {
      const [group] = await db.select({
        groupCode: readingGroups.groupCode,
        name: readingGroups.name,
        churchName: readingGroups.churchName,
        leaderName: readingGroups.leaderName,
        linkJoinMode: readingGroups.linkJoinMode,
        guestAccessEnabled: readingGroups.guestAccessEnabled,
      }).from(readingGroups).where(eq(readingGroups.groupCode, req.params.code.toUpperCase()));

      if (!group) return res.status(404).json({ error: 'المجموعة غير موجودة' });
      res.json({ group });
    } catch (err) {
      res.status(500).json({ error: 'فشل تحميل بيانات المجموعة' });
    }
  });

  // ── الانضمام عبر رابط الدعوة ──
  app.post('/api/groups/:code/invite-join', async (req, res) => {
    try {
      const { userName, phone } = req.body;
      const code = req.params.code.toUpperCase();

      if (!userName || !phone) return res.status(400).json({ error: 'الاسم ورقم الموبايل مطلوبان' });
      if (phone.trim().length < 10) return res.status(400).json({ error: 'رقم الموبايل غير صحيح' });

      const [group] = await db.select().from(readingGroups).where(eq(readingGroups.groupCode, code));
      if (!group) return res.status(404).json({ error: 'المجموعة غير موجودة' });

      const normalizedPhone = phone.trim().replace(/\s+/g, '');

      // هل هو عضو بالفعل؟ — ابحث بالتليفون أولاً (يضمن إرجاع الأدمن الصحيح)
      const existingByPhone = await db.select().from(groupMembers)
        .where(and(eq(groupMembers.groupId, group.id), eq(groupMembers.phone, normalizedPhone)));
      if (existingByPhone.length > 0) {
        const found = existingByPhone[0];
        const newName = userName.trim();
        if (found.userName !== newName) {
          // حماية: لو الاسم الجديد مستخدَم من عضو آخر (تليفون مختلف) → ماتغيّرش الاسم
          const clash = await db.select().from(groupMembers)
            .where(and(eq(groupMembers.groupId, group.id), eq(groupMembers.userName, newName)));
          const takenByOther = clash.some(m => m.id !== found.id);
          if (!takenByOther) {
            // انقل التاريخ ثم غيّر الاسم — عشان التقدّم يفضل متربط بالعضو
            await migrateMemberName(group.id, found.userName, newName);
            await db.update(groupMembers).set({ userName: newName }).where(eq(groupMembers.id, found.id));
            return res.json({ group, member: { ...found, userName: newName }, status: 'already_member' });
          }
          // الاسم محجوز لعضو تاني → سيب اسمه زي ما هو وتعرّف عليه بس
          return res.json({ group, member: found, status: 'already_member' });
        }
        return res.json({ group, member: found, status: 'already_member' });
      }

      // البحث بالاسم كـ fallback
      const [existing] = await db.select().from(groupMembers)
        .where(and(eq(groupMembers.groupId, group.id), eq(groupMembers.userName, userName.trim())));
      if (existing) {
        if (!existing.phone && normalizedPhone) {
          await db.update(groupMembers).set({ phone: normalizedPhone }).where(eq(groupMembers.id, existing.id));
        }
        return res.json({ group, member: existing, status: 'already_member' });
      }

      if (group.linkJoinMode === 'auto') {
        // في وضع auto: إذا كان هناك طلب معلق نلغيه ونضيف العضو مباشرة
        await db.delete(groupJoinRequests)
          .where(and(eq(groupJoinRequests.groupId, group.id), eq(groupJoinRequests.userName, userName.trim())));
        // انضمام مباشر — نتحقق مرة أخرى بـ INSERT WHERE NOT EXISTS لمنع التكرار
        const memberKey = generateKey();
        const result = await pool.query(
          `INSERT INTO group_members (group_id, user_name, member_key, phone, is_admin, is_muted)
           SELECT $1, $2, $3, $4, false, false
           WHERE NOT EXISTS (
             SELECT 1 FROM group_members WHERE group_id = $1 AND (user_name = $2 OR phone = $4)
           )
           RETURNING *`,
          [group.id, userName.trim(), memberKey, normalizedPhone]
        );
        if (result.rows.length === 0) {
          // ابحث بالتليفون أولاً ثم بالاسم للإرجاع الصحيح
          const dupPhone = await db.select().from(groupMembers)
            .where(and(eq(groupMembers.groupId, group.id), eq(groupMembers.phone, normalizedPhone)));
          const dup = dupPhone[0] || (await db.select().from(groupMembers)
            .where(and(eq(groupMembers.groupId, group.id), eq(groupMembers.userName, userName.trim()))))[0];
          return res.json({ group, member: dup, status: 'already_member' });
        }
        return res.json({ group, member: result.rows[0], status: 'joined', memberKey });
      }

      // وضع الموافقة — هل يوجد طلب معلق؟
      const [pending] = await db.select().from(groupJoinRequests)
        .where(and(eq(groupJoinRequests.groupId, group.id), eq(groupJoinRequests.userName, userName.trim()), eq(groupJoinRequests.status, 'pending')));
      if (pending) return res.json({ group, status: 'pending', request: pending });

      // إنشاء طلب انضمام جديد
      const [request] = await db.insert(groupJoinRequests).values({
        groupId: group.id,
        userName: userName.trim(),
        phone: phone.trim(),
        status: 'pending',
      }).returning();
      res.json({ group, status: 'pending', request });
    } catch (err) {
      console.error('[groups] invite-join error:', err);
      res.status(500).json({ error: 'فشل الانضمام' });
    }
  });

  // ── تغيير وضع الانضمام عبر الرابط ──
  app.put('/api/groups/:code/link-mode', async (req, res) => {
    try {
      const [group] = await db.select().from(readingGroups).where(eq(readingGroups.groupCode, req.params.code.toUpperCase()));
      if (!group) return res.status(404).json({ error: 'المجموعة غير موجودة' });

      const { leaderKey, mode } = req.body;
      if (!['auto', 'approval'].includes(mode)) return res.status(400).json({ error: 'وضع غير صحيح' });

      const authorized = await isAdminByLeaderKey(group, leaderKey);
      if (!authorized) return res.status(403).json({ error: 'غير مسموح' });

      await db.update(readingGroups).set({ linkJoinMode: mode }).where(eq(readingGroups.id, group.id));
      res.json({ success: true, mode });
    } catch (err) {
      console.error('[groups] link-mode error:', err);
      res.status(500).json({ error: 'فشل تحديث الإعداد' });
    }
  });

  // ── تغيير من يستطيع الإرسال في الشات ──
  app.put('/api/groups/:code/messaging-mode', async (req, res) => {
    try {
      const [group] = await db.select().from(readingGroups).where(eq(readingGroups.groupCode, req.params.code.toUpperCase()));
      if (!group) return res.status(404).json({ error: 'المجموعة غير موجودة' });

      const { leaderKey, mode } = req.body;
      if (!['all', 'admin_only'].includes(mode)) return res.status(400).json({ error: 'وضع غير صحيح' });

      const authorized = await isAdminByLeaderKey(group, leaderKey);
      if (!authorized) return res.status(403).json({ error: 'غير مسموح' });

      await db.update(readingGroups).set({ messagingMode: mode } as any).where(eq(readingGroups.id, group.id));
      res.json({ success: true, mode });
    } catch (err) {
      console.error('[groups] messaging-mode error:', err);
      res.status(500).json({ error: 'فشل تحديث الإعداد' });
    }
  });

  // ── الدخول الضيف (تلقائي بدون بيانات) ──────────────────────────────────
  app.post('/api/groups/:code/guest-join', async (req, res) => {
    try {
      const code = req.params.code.toUpperCase();
      const [group] = await db.select().from(readingGroups).where(eq(readingGroups.groupCode, code));
      if (!group) return res.status(404).json({ error: 'المجموعة غير موجودة' });
      if (!group.guestAccessEnabled) return res.status(403).json({ error: 'الدخول الضيف غير مفعّل' });

      // قراءة الـ cookie لمعرفة إذا كان هذا الجهاز له token سابق
      const rawCookie = req.headers.cookie || '';
      let guestTokens: Record<string, string> = {};
      try {
        const match = rawCookie.match(/mbg_guest=([^;]+)/);
        if (match) guestTokens = JSON.parse(decodeURIComponent(match[1]));
      } catch {}

      const existingToken = guestTokens[code];

      if (existingToken) {
        // البحث عن التوكن في DB
        const [existing] = await db.select().from(groupGuestTokens)
          .where(and(eq(groupGuestTokens.token, existingToken), eq(groupGuestTokens.groupCode, code)));
        if (existing) {
          // تأكد أن المستخدم لا يزال عضوًا فعليًا في group_members
          const [member] = await db.select().from(groupMembers)
            .where(and(eq(groupMembers.groupId, group.id), eq(groupMembers.memberKey, existing.memberKey)));
          if (member) {
            return res.json({ userName: member.userName, memberKey: existing.memberKey, memberNumber: existing.memberNumber, isGuest: true });
          }
        }
      }

      // إنشاء ضيف جديد — احسب رقم العضوية التالي
      const guestsInGroup = await db.select().from(groupGuestTokens).where(eq(groupGuestTokens.groupCode, code));
      const memberNumber = guestsInGroup.length + 1;
      const userName = `عضو ${memberNumber}`;
      const newToken = crypto.randomUUID();
      const memberKey = 'g_' + crypto.randomBytes(8).toString('hex');

      // أضف في group_members كعضو فعلي
      await pool.query(
        `INSERT INTO group_members (group_id, user_name, member_key, is_admin, is_muted) VALUES ($1, $2, $3, false, false)`,
        [group.id, userName, memberKey]
      );

      // احفظ التوكن
      await db.insert(groupGuestTokens).values({
        token: newToken,
        groupId: group.id,
        groupCode: code,
        memberNumber,
        memberKey,
      });

      // اضبط الـ cookie (سنة كاملة)
      const newTokens = { ...guestTokens, [code]: newToken };
      res.setHeader('Set-Cookie', `mbg_guest=${encodeURIComponent(JSON.stringify(newTokens))}; Max-Age=31536000; Path=/; HttpOnly; SameSite=Lax`);
      res.json({ userName, memberKey, memberNumber, isGuest: true });
    } catch (err) {
      console.error('[groups] guest-join error:', err);
      res.status(500).json({ error: 'فشل الدخول الضيف' });
    }
  });

  // ── تسجيل اسم وتليفون لضيف موجود ──────────────────────────────────────
  app.post('/api/groups/:code/guest-register', async (req, res) => {
    try {
      const code = req.params.code.toUpperCase();
      const { memberKey, userName: newName, phone } = req.body;
      if (!memberKey || !newName?.trim()) return res.status(400).json({ error: 'بيانات ناقصة' });

      const [group] = await db.select().from(readingGroups).where(eq(readingGroups.groupCode, code));
      if (!group) return res.status(404).json({ error: 'المجموعة غير موجودة' });

      // احفظ الاسم القديم (عضو X) لنقل سجلات القراءة
      const [currentMember] = await db.select().from(groupMembers)
        .where(and(eq(groupMembers.groupId, group.id), eq(groupMembers.memberKey, memberKey)));
      if (!currentMember) return res.status(404).json({ error: 'العضو غير موجود' });
      const oldName = currentMember.userName;

      // هل يوجد عضو آخر بنفس الاسم الجديد؟ (حالة الأدمن يسجّل دخوله من حساب ضيف)
      const normalizedRegPhone = phone?.trim().replace(/\s+/g, '') || '';
      const nameConflict = await db.select().from(groupMembers)
        .where(and(eq(groupMembers.groupId, group.id), eq(groupMembers.userName, newName.trim())));
      const existingReal = nameConflict.find(m => m.memberKey !== memberKey);

      if (existingReal) {
        // العضو الحقيقي موجود — انقل قراءات الضيف (عضو X) لاسمه الحقيقي أولاً
        // حتى لا يفقد الإصحاحات التي قرأها أثناء ظهوره كضيف
        if (oldName && oldName !== existingReal.userName) {
          // انقل سجلات القراءة مع تجنّب التكرار (احذف المكرر ثم حدّث)
          await pool.query(
            `DELETE FROM group_reading_logs g
             WHERE g.group_id = $1 AND g.user_name = $2
               AND EXISTS (
                 SELECT 1 FROM group_reading_logs r
                 WHERE r.group_id = $1 AND r.user_name = $3
                   AND r.book = g.book AND r.chapter = g.chapter
               )`,
            [group.id, oldName, existingReal.userName]
          );
          await pool.query(
            `UPDATE group_reading_logs SET user_name = $1 WHERE group_id = $2 AND user_name = $3`,
            [existingReal.userName, group.id, oldName]
          );
          // انقل قراءات assignment_readings كذلك
          await pool.query(
            `DELETE FROM assignment_readings g
             WHERE g.group_id = $1 AND g.user_name = $2
               AND EXISTS (
                 SELECT 1 FROM assignment_readings r
                 WHERE r.group_id = $1 AND r.user_name = $3
                   AND r.book_name = g.book_name AND r.chapter = g.chapter
               )`,
            [group.id, oldName, existingReal.userName]
          );
          await pool.query(
            `UPDATE assignment_readings SET user_name = $1 WHERE group_id = $2 AND user_name = $3`,
            [existingReal.userName, group.id, oldName]
          );
          await pool.query(
            `UPDATE group_messages SET user_name = $1 WHERE group_id = $2 AND user_name = $3`,
            [existingReal.userName, group.id, oldName]
          );
        }

        // احذف حساب الضيف وأعد مفتاح العضو الأصلي
        await db.delete(groupMembers)
          .where(and(eq(groupMembers.groupId, group.id), eq(groupMembers.memberKey, memberKey)));
        await db.delete(groupGuestTokens)
          .where(and(eq(groupGuestTokens.groupCode, code), eq(groupGuestTokens.memberKey, memberKey)));

        // حدّث تليفون العضو الأصلي لو لم يكن مسجلاً
        if (normalizedRegPhone && !existingReal.phone) {
          await db.update(groupMembers)
            .set({ phone: normalizedRegPhone })
            .where(eq(groupMembers.id, existingReal.id));
        }

        return res.json({
          success: true,
          userName: existingReal.userName,
          memberKey: existingReal.memberKey,
          isAdmin: existingReal.isAdmin || false,
          merged: true,
        });
      }

      // تحديث اسم العضو في group_members
      await db.update(groupMembers)
        .set({ userName: newName.trim(), ...(normalizedRegPhone ? { phone: normalizedRegPhone } : {}) })
        .where(and(eq(groupMembers.groupId, group.id), eq(groupMembers.memberKey, memberKey)));

      // نقل كل السجلات التاريخية للاسم الجديد (يحافظ على الترتيب والتقدم)
      if (oldName && oldName !== newName.trim()) {
        // group_reading_logs مع تجنّب التكرار
        await pool.query(
          `DELETE FROM group_reading_logs g
           WHERE g.group_id = $1 AND g.user_name = $2
             AND EXISTS (
               SELECT 1 FROM group_reading_logs r
               WHERE r.group_id = $1 AND r.user_name = $3
                 AND r.book = g.book AND r.chapter = g.chapter
             )`,
          [group.id, oldName, newName.trim()]
        );
        await pool.query(
          `UPDATE group_reading_logs SET user_name = $1 WHERE group_id = $2 AND user_name = $3`,
          [newName.trim(), group.id, oldName]
        );
        // assignment_readings مع تجنّب التكرار
        await pool.query(
          `DELETE FROM assignment_readings g
           WHERE g.group_id = $1 AND g.user_name = $2
             AND EXISTS (
               SELECT 1 FROM assignment_readings r
               WHERE r.group_id = $1 AND r.user_name = $3
                 AND r.book_name = g.book_name AND r.chapter = g.chapter
             )`,
          [group.id, oldName, newName.trim()]
        );
        await pool.query(
          `UPDATE assignment_readings SET user_name = $1 WHERE group_id = $2 AND user_name = $3`,
          [newName.trim(), group.id, oldName]
        );
        await pool.query(
          `UPDATE group_messages SET user_name = $1 WHERE group_id = $2 AND user_name = $3`,
          [newName.trim(), group.id, oldName]
        );
      }

      // تحديث التليفون في guest_tokens
      if (normalizedRegPhone) {
        await db.update(groupGuestTokens)
          .set({ phone: normalizedRegPhone })
          .where(and(eq(groupGuestTokens.groupCode, code), eq(groupGuestTokens.memberKey, memberKey)));
      }

      res.json({ success: true, userName: newName.trim(), memberKey, isAdmin: false, oldName });
    } catch (err) {
      console.error('[groups] guest-register error:', err);
      res.status(500).json({ error: 'فشل التسجيل' });
    }
  });

  // ── تفعيل/إيقاف الدخول الضيف (أدمن فقط) ──────────────────────────────
  app.put('/api/groups/:code/guest-access', async (req, res) => {
    try {
      const code = req.params.code.toUpperCase();
      const [group] = await db.select().from(readingGroups).where(eq(readingGroups.groupCode, code));
      if (!group) return res.status(404).json({ error: 'المجموعة غير موجودة' });

      const { leaderKey, enabled } = req.body;
      const authorized = await isAdminByLeaderKey(group, leaderKey);
      if (!authorized) return res.status(403).json({ error: 'غير مسموح' });

      await db.update(readingGroups).set({ guestAccessEnabled: !!enabled } as any).where(eq(readingGroups.id, group.id));
      res.json({ success: true, guestAccessEnabled: !!enabled });
    } catch (err) {
      console.error('[groups] guest-access error:', err);
      res.status(500).json({ error: 'فشل تحديث الإعداد' });
    }
  });

  // endpoint مؤقت لإنشاء مجموعة بكود محدد مسبقاً (للاستخدام الإداري فقط)
  app.post('/api/groups/seed-once', async (req, res) => {
    try {
      const { secret, groupCode, name, churchName, admins } = req.body;
      // This endpoint can mint a group with admins of the caller's choosing, so
      // its secret was a committed literal anyone could read and use. Gate it on
      // an env secret with no default, and refuse entirely when unset — the
      // seeding is a one-time operation, so a disabled endpoint is the safe
      // resting state.
      const seedSecret = process.env.MYBIBLE_SEED_SECRET || '';
      if (!seedSecret || secret !== seedSecret) {
        return res.status(403).json({ error: 'غير مسموح' });
      }
      if (!groupCode || !name || !admins?.length) {
        return res.status(400).json({ error: 'بيانات ناقصة' });
      }
      const existing = await db.select().from(readingGroups).where(eq(readingGroups.groupCode, groupCode.toUpperCase()));
      if (existing.length > 0) {
        return res.json({ status: 'already_exists', group: existing[0] });
      }
      const leaderKey = generateKey();
      const [group] = await db.insert(readingGroups).values({
        groupCode: groupCode.toUpperCase(),
        name,
        churchName: churchName || null,
        leaderName: admins[0].name,
        leaderKey,
      }).returning();
      const members = admins.map((a: { name: string; phone: string }, i: number) => ({
        groupId:   group.id,
        userName:  a.name,
        memberKey: i === 0 ? leaderKey : generateKey(),
        phone:     a.phone,
        isAdmin:   true,
      }));
      await db.insert(groupMembers).values(members);
      res.json({ status: 'created', group });
    } catch (err) {
      console.error('[groups] seed-once error:', err);
      res.status(500).json({ error: 'فشل إنشاء المجموعة' });
    }
  });

  app.post('/api/groups', async (req, res) => {
    try {
      const { name, churchName, leaderName, phone } = req.body;
      if (!name || !leaderName) {
        return res.status(400).json({ error: 'اسم المجموعة واسم الخادم مطلوبان' });
      }
      if (!phone || String(phone).trim().length < 10) {
        return res.status(400).json({ error: 'رقم الموبايل مطلوب' });
      }
      const groupCode = generateCode();
      const leaderKey = generateKey();

      const [group] = await db.insert(readingGroups).values({
        groupCode,
        name,
        churchName: churchName || null,
        leaderName,
        leaderKey,
      }).returning();

      await db.insert(groupMembers).values({
        groupId: group.id,
        userName: leaderName,
        memberKey: leaderKey,
        isAdmin: true,
        phone: String(phone).trim(),
      });

      res.json({ group, leaderKey });
    } catch (err) {
      console.error('[groups] create error:', err);
      res.status(500).json({ error: 'فشل إنشاء المجموعة' });
    }
  });

  app.post('/api/groups/join', async (req, res) => {
    try {
      const { groupCode, userName, phone } = req.body;
      if (!groupCode || !userName) {
        return res.status(400).json({ error: 'الكود واسم المستخدم مطلوبان' });
      }
      if (!phone || phone.trim().length < 10) {
        return res.status(400).json({ error: 'رقم الموبايل مطلوب (10 أرقام على الأقل)' });
      }

      const [group] = await db.select().from(readingGroups).where(eq(readingGroups.groupCode, groupCode.toUpperCase()));
      if (!group) {
        return res.status(404).json({ error: 'المجموعة غير موجودة' });
      }

      // البحث بالتليفون أولاً (أدق — يضمن إرجاع إنتري الأدمن الصح)
      const normalizedJoinPhone = phone.trim().replace(/\s+/g, '');
      const existingByPhone = await db.select().from(groupMembers)
        .where(and(eq(groupMembers.groupId, group.id), eq(groupMembers.phone, normalizedJoinPhone)));
      if (existingByPhone.length > 0) {
        const found = existingByPhone[0];
        const newName = userName.trim();
        if (found.userName !== newName) {
          // حماية: لو الاسم الجديد مستخدَم من عضو آخر (تليفون مختلف) → ماتغيّرش الاسم
          const clash = await db.select().from(groupMembers)
            .where(and(eq(groupMembers.groupId, group.id), eq(groupMembers.userName, newName)));
          const takenByOther = clash.some(m => m.id !== found.id);
          if (!takenByOther) {
            await migrateMemberName(group.id, found.userName, newName);
            await db.update(groupMembers).set({ userName: newName }).where(eq(groupMembers.id, found.id));
            return res.json({ group, member: { ...found, userName: newName }, status: 'already_member' });
          }
          return res.json({ group, member: found, status: 'already_member' });
        }
        return res.json({ group, member: found, status: 'already_member' });
      }

      // البحث بالاسم كـ fallback
      const existing = await db.select().from(groupMembers)
        .where(and(eq(groupMembers.groupId, group.id), eq(groupMembers.userName, userName)));
      if (existing.length > 0) {
        if (!existing[0].phone && phone) {
          await db.update(groupMembers).set({ phone: normalizedJoinPhone })
            .where(eq(groupMembers.id, existing[0].id));
        }
        return res.json({ group, member: { ...existing[0], phone: normalizedJoinPhone }, status: 'already_member' });
      }

      const pendingRequest = await db.select().from(groupJoinRequests)
        .where(and(
          eq(groupJoinRequests.groupId, group.id),
          eq(groupJoinRequests.userName, userName),
          eq(groupJoinRequests.status, 'pending')
        ));
      if (pendingRequest.length > 0) {
        return res.json({ group, status: 'pending', request: pendingRequest[0] });
      }

      const [request] = await db.insert(groupJoinRequests).values({
        groupId: group.id,
        userName,
        phone: phone.trim(),
        status: 'pending',
      }).returning();

      res.json({ group, status: 'pending', request });
    } catch (err) {
      console.error('[groups] join error:', err);
      res.status(500).json({ error: 'فشل الانضمام' });
    }
  });

  app.get('/api/groups/:code/join-requests', async (req, res) => {
    try {
      const [group] = await db.select().from(readingGroups).where(eq(readingGroups.groupCode, req.params.code.toUpperCase()));
      if (!group) return res.status(404).json({ error: 'المجموعة غير موجودة' });

      // Pending requests carry applicants' names and phone numbers. Only an
      // admin may read them — the approve/reject endpoints below already
      // require an admin key, and listing must be gated the same way.
      const leaderKey = String((req.query.leaderKey || req.query.memberKey || '') as string);
      if (!leaderKey || !(await isAdminByLeaderKey(group, leaderKey))) {
        return res.status(403).json({ error: 'غير مصرّح' });
      }

      const requests = await db.select().from(groupJoinRequests)
        .where(and(eq(groupJoinRequests.groupId, group.id), eq(groupJoinRequests.status, 'pending')))
        .orderBy(desc(groupJoinRequests.createdAt));

      // Field name matches what the client reads (joinRequests); it previously
      // returned `requests`, so the admin's pending-requests panel was always
      // empty.
      res.json({ joinRequests: requests, requests });
    } catch (err) {
      console.error('[groups] join-requests error:', err);
      res.status(500).json({ error: 'فشل جلب الطلبات' });
    }
  });

  app.post('/api/groups/:code/join-requests/:requestId/approve', async (req, res) => {
    try {
      const { leaderKey } = req.body;
      const [group] = await db.select().from(readingGroups).where(eq(readingGroups.groupCode, req.params.code.toUpperCase()));
      if (!group) return res.status(404).json({ error: 'المجموعة غير موجودة' });

      const adminMember = await db.select().from(groupMembers)
        .where(and(eq(groupMembers.groupId, group.id), eq(groupMembers.memberKey, leaderKey), eq(groupMembers.isAdmin, true)));
      if (adminMember.length === 0) return res.status(403).json({ error: 'غير مصرح' });

      const requestId = parseInt(req.params.requestId);
      const [request] = await db.select().from(groupJoinRequests).where(eq(groupJoinRequests.id, requestId));
      if (!request || request.groupId !== group.id || request.status !== 'pending') {
        return res.status(404).json({ error: 'الطلب غير موجود' });
      }

      await db.update(groupJoinRequests).set({ status: 'approved' }).where(eq(groupJoinRequests.id, requestId));

      const memberKey = generateKey();
      const [member] = await db.insert(groupMembers).values({
        groupId: group.id,
        userName: request.userName,
        memberKey,
        phone: request.phone || null,
        isAdmin: false,
      }).returning();

      res.json({ member });
    } catch (err) {
      console.error('[groups] approve error:', err);
      res.status(500).json({ error: 'فشل الموافقة' });
    }
  });

  app.post('/api/groups/:code/join-requests/:requestId/reject', async (req, res) => {
    try {
      const { leaderKey } = req.body;
      const [group] = await db.select().from(readingGroups).where(eq(readingGroups.groupCode, req.params.code.toUpperCase()));
      if (!group) return res.status(404).json({ error: 'المجموعة غير موجودة' });

      const adminMember = await db.select().from(groupMembers)
        .where(and(eq(groupMembers.groupId, group.id), eq(groupMembers.memberKey, leaderKey), eq(groupMembers.isAdmin, true)));
      if (adminMember.length === 0) return res.status(403).json({ error: 'غير مصرح' });

      const requestId = parseInt(req.params.requestId);
      await db.update(groupJoinRequests).set({ status: 'rejected' }).where(eq(groupJoinRequests.id, requestId));

      res.json({ success: true });
    } catch (err) {
      console.error('[groups] reject error:', err);
      res.status(500).json({ error: 'فشل الرفض' });
    }
  });

  app.get('/api/groups/:code', async (req, res) => {
    try {
      const [group] = await db.select().from(readingGroups).where(eq(readingGroups.groupCode, req.params.code.toUpperCase()));
      if (!group) return res.status(404).json({ error: 'المجموعة غير موجودة' });

      const members = await db.select().from(groupMembers).where(eq(groupMembers.groupId, group.id));
      const today = new Date().toISOString().split('T')[0];

      // عداد "قرأوا اليوم" — يجمع من group_reading_logs (الأساس) و assignment_readings (احتياطي)
      const readTodayResult = await pool.query(
        `SELECT DISTINCT user_name FROM (
           SELECT user_name FROM group_reading_logs
           WHERE group_id = $1 AND date = $2
           UNION
           SELECT user_name FROM assignment_readings
           WHERE group_id = $1 AND completed = true
             AND COALESCE(completed_date, TO_CHAR(completed_at, 'YYYY-MM-DD')) = $2
         ) t`,
        [group.id, today]
      );
      const readTodayNames = new Set<string>(readTodayResult.rows.map((r: any) => r.user_name));

      // memberKey is the admin capability token and phone is PII. This endpoint
      // has no auth (the group code is enough to reach it), so returning either
      // for OTHER members let anyone with the code read every admin's key —
      // full group takeover — and harvest all members' phone numbers. Return
      // memberKey only on the caller's own row (they prove it by sending the key
      // they already hold), and never anyone's phone. The caller's own row keeps
      // its key so the client can still recognise itself as a member/admin.
      const callerKey = String((req.query.me || req.query.memberKey || '') as string);
      const membersWithStatus = members.map((m: any) => {
        const { phone, memberKey, ...safe } = m;
        return {
          ...safe,
          memberKey: (callerKey && memberKey === callerKey) ? memberKey : undefined,
          readToday: readTodayNames.has(m.userName),
          log: null,
        };
      });

      const readTodayCount = membersWithStatus.filter((m: any) => m.readToday).length;

      const allLogs = await db.select().from(groupReadingLogs)
        .where(eq(groupReadingLogs.groupId, group.id));
      const uniqueChaptersRead = new Set(allLogs.map(l => `${l.book}-${l.chapter}`)).size;

      res.json({
        group,
        members: membersWithStatus,
        stats: {
          totalMembers: members.length,
          readToday: readTodayCount,
          chaptersRead: uniqueChaptersRead,
        },
      });
    } catch (err) {
      console.error('[groups] get error:', err);
      res.status(500).json({ error: 'فشل تحميل المجموعة' });
    }
  });

  app.post('/api/groups/:code/reading', async (req, res) => {
    try {
      const [group] = await db.select().from(readingGroups).where(eq(readingGroups.groupCode, req.params.code.toUpperCase()));
      if (!group) return res.status(404).json({ error: 'المجموعة غير موجودة' });

      const { userName, book, chapter, timeSpent, scrollPercent } = req.body;
      const date = new Date().toISOString().split('T')[0];

      let quality = 'unknown';
      if (timeSpent < 30) quality = 'fast';
      else if (scrollPercent > 70 && timeSpent > 60) quality = 'genuine';
      else quality = 'normal';

      const existing = await db.select().from(groupReadingLogs)
        .where(and(
          eq(groupReadingLogs.groupId, group.id),
          eq(groupReadingLogs.userName, userName),
          eq(groupReadingLogs.date, date),
          eq(groupReadingLogs.book, book),
          eq(groupReadingLogs.chapter, chapter),
        ));

      if (existing.length > 0) {
        return res.json({ log: existing[0], alreadyLogged: true });
      }

      const [log] = await db.insert(groupReadingLogs).values({
        groupId: group.id,
        userName,
        book,
        chapter,
        date,
        timeSpent,
        scrollPercent,
        quality,
      }).returning();

      try {
        const cps = await db.select().from(challengeParticipants)
          .where(eq(challengeParticipants.groupId, group.id));
        for (const cp of cps) {
          const [ch] = await db.select().from(churchChallenges)
            .where(eq(churchChallenges.id, cp.challengeId));
          if (ch && ch.isActive && ch.bookName === book && chapter >= ch.startChapter && chapter <= ch.endChapter) {
            await db.update(challengeParticipants)
              .set({ totalChaptersRead: (cp.totalChaptersRead || 0) + 1 })
              .where(eq(challengeParticipants.id, cp.id));
          }
        }
      } catch (e) {
        console.log('[groups] challenge progress update error (non-critical):', e);
      }

      res.json({ log });
    } catch (err) {
      console.error('[groups] reading log error:', err);
      res.status(500).json({ error: 'فشل تسجيل القراءة' });
    }
  });

  // ── إعداد القراءات التلقائية ────────────────────────────────────────────────
  app.put('/api/groups/:code/auto-reading', async (req, res) => {
    try {
      const [group] = await db.select().from(readingGroups).where(eq(readingGroups.groupCode, req.params.code.toUpperCase()));
      if (!group) return res.status(404).json({ error: 'المجموعة غير موجودة' });

      const { leaderKey, config } = req.body;
      const authorized = await isAdminByLeaderKey(group, leaderKey);
      if (!authorized) return res.status(403).json({ error: 'غير مسموح' });

      const [updated] = await db.update(readingGroups)
        .set({ autoReadingConfig: config })
        .where(eq(readingGroups.id, group.id))
        .returning();

      res.json({ group: updated });
    } catch (err) {
      console.error('[groups] auto-reading config error:', err);
      res.status(500).json({ error: 'فشل الحفظ' });
    }
  });

  // اشتراك الأعضاء في إشعارات الشات
  app.post('/api/groups/:code/push-subscribe', async (req, res) => {
    try {
      const [group] = await db.select().from(readingGroups).where(eq(readingGroups.groupCode, req.params.code.toUpperCase()));
      if (!group) return res.status(404).json({ error: 'المجموعة غير موجودة' });
      const { memberKey, userName, subscription } = req.body;
      if (!memberKey || !userName || !subscription?.endpoint) return res.status(400).json({ error: 'بيانات ناقصة' });
      // Validate member
      const [member] = await db.select().from(groupMembers).where(
        and(eq(groupMembers.groupId, group.id), eq(groupMembers.memberKey, memberKey))
      );
      if (!member) return res.status(403).json({ error: 'غير مسموح' });
      // Upsert subscription
      await pool.query(
        `INSERT INTO group_push_subscriptions (group_id, group_code, user_name, member_key, endpoint, p256dh, auth)
         VALUES ($1, $2, $3, $4, $5, $6, $7)
         ON CONFLICT (group_id, endpoint) DO UPDATE SET user_name=$3, member_key=$4, updated_at=NOW()`,
        [group.id, group.groupCode, userName, memberKey, subscription.endpoint, subscription.keys?.p256dh || '', subscription.keys?.auth || '']
      );
      res.json({ ok: true });
    } catch (err) {
      console.error('[groups] push-subscribe error:', err);
      res.status(500).json({ error: 'فشل الاشتراك' });
    }
  });

  // ── احتساب إصحاحات كمقروءة لعضو (أدمن فقط) — لحالات العذر مثل تعطل الجهاز ──
  app.post('/api/groups/:code/members/:memberName/credit-readings', async (req, res) => {
    try {
      const [group] = await db.select().from(readingGroups).where(eq(readingGroups.groupCode, req.params.code.toUpperCase()));
      if (!group) return res.status(404).json({ error: 'المجموعة غير موجودة' });

      const { leaderKey, chapters } = req.body as { leaderKey: string; chapters: { book: string; chapter: number; assignmentId?: number | null }[] };
      const authorized = await isAdminByLeaderKey(group, leaderKey);
      if (!authorized) return res.status(403).json({ error: 'غير مسموح' });

      const targetName = decodeURIComponent(req.params.memberName);
      if (!Array.isArray(chapters) || chapters.length === 0) {
        return res.status(400).json({ error: 'لا توجد إصحاحات للاحتساب' });
      }

      const today = new Date().toISOString().split('T')[0];
      let credited = 0;
      for (const c of chapters) {
        if (!c?.book || !c?.chapter) continue;
        // سجّل في group_reading_logs (يُحتسب في كل الإحصاءات) مع تجنّب التكرار
        await pool.query(
          `INSERT INTO group_reading_logs (group_id, user_name, book, chapter, date, time_spent)
           SELECT $1,$2,$3,$4,$5,0
           WHERE NOT EXISTS (
             SELECT 1 FROM group_reading_logs
             WHERE group_id=$1 AND user_name=$2 AND book=$3 AND chapter=$4
           )`,
          [group.id, targetName, c.book, c.chapter, today]
        );
        // علّم صف الـ assignment كمكتمل إن وُجد assignmentId
        if (c.assignmentId) {
          const existing = await db.select().from(assignmentReadings).where(and(
            eq(assignmentReadings.assignmentId, c.assignmentId),
            eq(assignmentReadings.groupId, group.id),
            eq(assignmentReadings.userName, targetName),
            eq(assignmentReadings.chapter, c.chapter),
          ));
          if (existing.length > 0) {
            await pool.query(
              `UPDATE assignment_readings SET completed=true, completed_at=NOW(), completed_date=$2 WHERE id=$1`,
              [existing[0].id, today]
            );
          } else {
            await pool.query(
              `INSERT INTO assignment_readings
                 (assignment_id, group_id, user_name, book_name, chapter, completed, completed_at, completed_date, created_at)
               VALUES ($1,$2,$3,$4,$5,true,NOW(),$6,NOW())`,
              [c.assignmentId, group.id, targetName, c.book, c.chapter, today]
            );
          }
        }
        credited++;
      }

      res.json({ success: true, credited });
    } catch (err) {
      console.error('[groups] credit-readings error:', err);
      res.status(500).json({ error: 'فشل احتساب القراءات' });
    }
  });

  app.put('/api/groups/:code/today', async (req, res) => {
    try {
      const [group] = await db.select().from(readingGroups).where(eq(readingGroups.groupCode, req.params.code.toUpperCase()));
      if (!group) return res.status(404).json({ error: 'المجموعة غير موجودة' });

      const { leaderKey, todayBook, todayChapter, challengeTotal } = req.body;
      const authorized = await isAdminByLeaderKey(group, leaderKey);
      if (!authorized) {
        return res.status(403).json({ error: 'غير مسموح' });
      }

      const updates: any = {};
      if (todayBook !== undefined) updates.todayBook = todayBook;
      if (todayChapter !== undefined) updates.todayChapter = todayChapter;
      if (challengeTotal !== undefined) updates.challengeTotal = challengeTotal;

      const [updated] = await db.update(readingGroups)
        .set(updates)
        .where(eq(readingGroups.id, group.id))
        .returning();

      res.json({ group: updated });
    } catch (err) {
      console.error('[groups] update today error:', err);
      res.status(500).json({ error: 'فشل التحديث' });
    }
  });

  app.delete('/api/groups/:code/members/:memberName', async (req, res) => {
    try {
      const [group] = await db.select().from(readingGroups).where(eq(readingGroups.groupCode, req.params.code.toUpperCase()));
      if (!group) return res.status(404).json({ error: 'المجموعة غير موجودة' });

      const { leaderKey } = req.body;
      const authorized = await isAdminByLeaderKey(group, leaderKey);
      if (!authorized) {
        return res.status(403).json({ error: 'غير مسموح' });
      }

      await db.delete(groupMembers)
        .where(and(eq(groupMembers.groupId, group.id), eq(groupMembers.userName, req.params.memberName)));

      res.json({ success: true });
    } catch (err) {
      console.error('[groups] remove member error:', err);
      res.status(500).json({ error: 'فشل حذف العضو' });
    }
  });

  app.put('/api/groups/:code/members/:memberName/admin', async (req, res) => {
    try {
      const [group] = await db.select().from(readingGroups).where(eq(readingGroups.groupCode, req.params.code.toUpperCase()));
      if (!group) return res.status(404).json({ error: 'المجموعة غير موجودة' });

      const { leaderKey, isAdmin: setAdmin } = req.body;
      const authorized = await isAdminByLeaderKey(group, leaderKey);
      if (!authorized) {
        return res.status(403).json({ error: 'غير مسموح' });
      }

      await db.update(groupMembers)
        .set({ isAdmin: setAdmin })
        .where(and(eq(groupMembers.groupId, group.id), eq(groupMembers.userName, req.params.memberName)));

      res.json({ success: true });
    } catch (err) {
      console.error('[groups] set admin error:', err);
      res.status(500).json({ error: 'فشل تغيير الدور' });
    }
  });

  // ── تعديل/دمج اسم عضو (أدمن فقط) — يصحّح الأسماء الخاطئة ويجمع القراءات ──
  app.put('/api/groups/:code/members/:memberName/rename', async (req, res) => {
    try {
      const [group] = await db.select().from(readingGroups).where(eq(readingGroups.groupCode, req.params.code.toUpperCase()));
      if (!group) return res.status(404).json({ error: 'المجموعة غير موجودة' });

      const { leaderKey, newName } = req.body;
      const authorized = await isAdminByLeaderKey(group, leaderKey);
      if (!authorized) return res.status(403).json({ error: 'غير مسموح' });

      const fromName = decodeURIComponent(req.params.memberName);
      const toName = (newName || '').trim();
      if (!toName) return res.status(400).json({ error: 'الاسم الجديد مطلوب' });
      if (fromName === toName) return res.json({ success: true, userName: toName, unchanged: true });

      const [source] = await db.select().from(groupMembers)
        .where(and(eq(groupMembers.groupId, group.id), eq(groupMembers.userName, fromName)));
      if (!source) return res.status(404).json({ error: 'العضو غير موجود' });

      // هل يوجد عضو آخر بالاسم الجديد؟ → دمج
      const [target] = await db.select().from(groupMembers)
        .where(and(eq(groupMembers.groupId, group.id), eq(groupMembers.userName, toName)));

      const merged = !!target && target.memberKey !== source.memberKey;

      // انقل كل تاريخ fromName إلى toName (helper مشترك — يعمل للحالتين)
      await migrateMemberName(group.id, fromName, toName);

      if (merged) {
        // العضو الجديد موجود — احذف الصف المكرر (مع نقل صلاحية الأدمن لو لزم)
        if (source.isAdmin && !target.isAdmin) {
          await db.update(groupMembers).set({ isAdmin: true }).where(eq(groupMembers.id, target.id));
        }
        if (source.phone && !target.phone) {
          await db.update(groupMembers).set({ phone: source.phone }).where(eq(groupMembers.id, target.id));
        }
        await db.delete(groupMembers).where(eq(groupMembers.id, source.id));
      } else {
        // مجرد إعادة تسمية
        await db.update(groupMembers).set({ userName: toName }).where(eq(groupMembers.id, source.id));
      }

      res.json({ success: true, userName: toName, merged });
    } catch (err) {
      console.error('[groups] rename member error:', err);
      res.status(500).json({ error: 'فشل تعديل الاسم' });
    }
  });

  app.post('/api/groups/:code/add-admin', async (req, res) => {
    try {
      const [group] = await db.select().from(readingGroups).where(eq(readingGroups.groupCode, req.params.code.toUpperCase()));
      if (!group) return res.status(404).json({ error: 'المجموعة غير موجودة' });

      const { leaderKey, name, phone } = req.body;
      if (!name || !phone) return res.status(400).json({ error: 'الاسم ورقم الموبايل مطلوبان' });

      const authorized = await isAdminByLeaderKey(group, leaderKey);
      if (!authorized) return res.status(403).json({ error: 'غير مسموح' });

      const normalizedPhone = String(phone).trim().replace(/\s+/g, '');

      // إذا كان موجوداً بالفعل — نحوّله لأدمن فقط
      const [existing] = await db.select().from(groupMembers)
        .where(and(eq(groupMembers.groupId, group.id), eq(groupMembers.phone, normalizedPhone)));

      if (existing) {
        await db.update(groupMembers)
          .set({ isAdmin: true })
          .where(eq(groupMembers.id, existing.id));
        return res.json({ memberKey: existing.memberKey, alreadyMember: true });
      }

      const memberKey = generateKey();
      await db.insert(groupMembers).values({
        groupId: group.id,
        userName: name.trim(),
        memberKey,
        phone: normalizedPhone,
        isAdmin: true,
      });

      res.json({ memberKey });
    } catch (err) {
      console.error('[groups] add-admin error:', err);
      res.status(500).json({ error: 'فشل إضافة الأدمن' });
    }
  });

  app.post('/api/groups/:code/leave', async (req, res) => {
    try {
      const [group] = await db.select().from(readingGroups).where(eq(readingGroups.groupCode, req.params.code.toUpperCase()));
      if (!group) return res.status(404).json({ error: 'المجموعة غير موجودة' });

      const { memberKey } = req.body;
      if (!memberKey) return res.status(400).json({ error: 'مطلوب معرف العضو' });

      const [member] = await db.select().from(groupMembers)
        .where(and(eq(groupMembers.groupId, group.id), eq(groupMembers.memberKey, memberKey)));
      if (!member) return res.status(404).json({ error: 'العضو غير موجود' });

      if (member.isAdmin) {
        const admins = await db.select().from(groupMembers)
          .where(and(eq(groupMembers.groupId, group.id), eq(groupMembers.isAdmin, true)));
        if (admins.length <= 1) {
          return res.status(400).json({ error: 'يجب تعيين أدمن آخر قبل مغادرة المجموعة' });
        }
      }

      await db.delete(groupMembers)
        .where(and(eq(groupMembers.groupId, group.id), eq(groupMembers.memberKey, memberKey)));

      res.json({ success: true });
    } catch (err) {
      console.error('[groups] leave error:', err);
      res.status(500).json({ error: 'فشل مغادرة المجموعة' });
    }
  });

  app.get('/api/groups/:code/messages', async (req, res) => {
    try {
      const [group] = await db.select().from(readingGroups).where(eq(readingGroups.groupCode, req.params.code.toUpperCase()));
      if (!group) return res.status(404).json({ error: 'المجموعة غير موجودة' });

      const messages = await db.select().from(groupMessages)
        .where(eq(groupMessages.groupId, group.id))
        .orderBy(desc(groupMessages.createdAt))
        .limit(100);

      const mutedMembers = await db.select().from(groupMembers)
        .where(and(eq(groupMembers.groupId, group.id), eq(groupMembers.isMuted, true)));
      const mutedNames = new Set(mutedMembers.map(m => m.userName));

      const filtered = messages.filter(m => !mutedNames.has(m.userName));
      res.json({ messages: filtered.reverse() });
    } catch (err) {
      console.error('[groups] messages error:', err);
      res.status(500).json({ error: 'فشل تحميل الرسائل' });
    }

  // ── ملخص الشات (عداد غير مقروء + آخر رسالة) ──────────────────────────────
  }); app.get('/api/groups/:code/messages/summary', async (req, res) => {
    try {
      const [group] = await db.select().from(readingGroups).where(eq(readingGroups.groupCode, req.params.code.toUpperCase()));
      if (!group) return res.status(404).json({ unreadCount: 0, lastMessage: null });

      const afterId = parseInt(req.query.afterId as string || '0') || 0;

      // آخر رسالة للمعاينة
      const [last] = await db.select().from(groupMessages)
        .where(eq(groupMessages.groupId, group.id))
        .orderBy(desc(groupMessages.createdAt))
        .limit(1);

      // عدد الرسائل الجديدة بعد آخر مقروء
      let unreadCount = 0;
      if (afterId > 0) {
        const result = await pool.query(
          `SELECT COUNT(*) FROM group_messages WHERE group_id = $1 AND id > $2`,
          [group.id, afterId]
        );
        unreadCount = parseInt(result.rows[0].count) || 0;
      }

      res.json({
        unreadCount,
        lastMessage: last ? (last.imageUrl ? '📷 صورة' : last.message?.slice(0, 60) || '') : null,
        lastSenderName: last?.userName || null,
        lastTime: last?.createdAt || null,
        lastMessageId: last?.id || 0,
      });
    } catch (err) {
      console.error('[groups] messages summary error:', err);
      res.status(500).json({ unreadCount: 0, lastMessage: null });
    }
  });

  app.post('/api/groups/:code/messages', async (req, res) => {
    try {
      const [group] = await db.select().from(readingGroups).where(eq(readingGroups.groupCode, req.params.code.toUpperCase()));
      if (!group) return res.status(404).json({ error: 'المجموعة غير موجودة' });

      const { userName, message, memberKey, imageUrl, replyToId, replyToText, replyToUserName } = req.body;
      if (!userName || (!message && !imageUrl)) {
        return res.status(400).json({ error: 'الرسالة واسم المستخدم مطلوبان' });
      }

      const mutedCheck = await db.select().from(groupMembers)
        .where(and(eq(groupMembers.groupId, group.id), eq(groupMembers.userName, userName), eq(groupMembers.isMuted, true)));
      if (mutedCheck.length > 0) {
        return res.status(403).json({ error: 'تم كتم هذا العضو' });
      }

      // إذا كان وضع الرسائل للأدمن فقط، تحقق من صلاحية المرسل
      const messagingMode = (group as any).messaging_mode || (group as any).messagingMode || 'all';
      if (messagingMode === 'admin_only') {
        const isAdminSenderCheck = req.body.memberKey ? await isAdminByLeaderKey(group, req.body.memberKey) : false;
        if (!isAdminSenderCheck) {
          return res.status(403).json({ error: 'الإرسال متاح للأدمن فقط حالياً' });
        }
      }

      const [msg] = await db.insert(groupMessages).values({
        groupId: group.id,
        userName,
        message: message || '',
        ...(imageUrl ? { imageUrl } : {}),
        ...(replyToId ? { replyToId, replyToText: replyToText || null, replyToUserName: replyToUserName || null } : {}),
      }).returning();

      res.json({ message: msg });

      // إشعارات push — تعمل في الخلفية بعد الرد
      setImmediate(async () => {
        try {
          const { sendGroupChatNotification } = await import('./push-notifications');
          const isAdminSender = memberKey ? await isAdminByLeaderKey(group, memberKey) : false;
          const msgText = imageUrl ? '📷 صورة' : (message || '');

          // إشعار لكل الأعضاء عند رسالة الأدمن
          if (isAdminSender && memberKey) {
            const subsResult = await pool.query(
              `SELECT endpoint, p256dh, auth FROM group_push_subscriptions WHERE group_id = $1 AND member_key != $2`,
              [group.id, memberKey]
            );
            if (subsResult.rows.length > 0) {
              sendGroupChatNotification(group.groupCode, group.name, userName, msgText, subsResult.rows).catch(() => {});
            }
          }

          // إشعار للأعضاء المذكورين بـ @
          if (message) {
            const mentionMatches = message.match(/@([؀-ۿa-zA-Z0-9_ ]+)/g) || [];
            for (const mention of mentionMatches) {
              const mentionedName = mention.slice(1).trim();
              const mentionSub = await pool.query(
                `SELECT endpoint, p256dh, auth FROM group_push_subscriptions WHERE group_id = $1 AND user_name = $2 LIMIT 1`,
                [group.id, mentionedName]
              );
              if (mentionSub.rows.length > 0) {
                sendGroupChatNotification(
                  group.groupCode, group.name, userName,
                  `${userName} ذكرك: ${msgText}`,
                  mentionSub.rows
                ).catch(() => {});
              }
            }
          }
        } catch {}
      });
    } catch (err) {
      console.error('[groups] send message error:', err);
      res.status(500).json({ error: 'فشل إرسال الرسالة' });
    }
  });

  app.put('/api/groups/:code/messages/:messageId/pin', async (req, res) => {
    try {
      const [group] = await db.select().from(readingGroups).where(eq(readingGroups.groupCode, req.params.code.toUpperCase()));
      if (!group) return res.status(404).json({ error: 'المجموعة غير موجودة' });

      const { leaderKey } = req.body;
      const authorized = await isAdminByLeaderKey(group, leaderKey);
      if (!authorized) {
        return res.status(403).json({ error: 'غير مسموح' });
      }

      const [msg] = await db.update(groupMessages)
        .set({ isPinned: true })
        .where(eq(groupMessages.id, parseInt(req.params.messageId)))
        .returning();

      res.json({ message: msg });
    } catch (err) {
      console.error('[groups] pin error:', err);
      res.status(500).json({ error: 'فشل تثبيت الرسالة' });
    }
  });

  app.delete('/api/groups/:code/messages/:messageId', async (req, res) => {
    try {
      const [group] = await db.select().from(readingGroups).where(eq(readingGroups.groupCode, req.params.code.toUpperCase()));
      if (!group) return res.status(404).json({ error: 'المجموعة غير موجودة' });

      const { leaderKey } = req.body;
      const authorized = await isAdminByLeaderKey(group, leaderKey);
      if (!authorized) {
        return res.status(403).json({ error: 'غير مسموح' });
      }

      await db.delete(groupMessages).where(eq(groupMessages.id, parseInt(req.params.messageId)));
      res.json({ success: true });
    } catch (err) {
      console.error('[groups] delete message error:', err);
      res.status(500).json({ error: 'فشل حذف الرسالة' });
    }
  });

  app.put('/api/groups/:code/messages/:messageId/react', async (req, res) => {
    try {
      const [group] = await db.select().from(readingGroups).where(eq(readingGroups.groupCode, req.params.code.toUpperCase()));
      if (!group) return res.status(404).json({ error: 'المجموعة غير موجودة' });

      const { emoji, userName } = req.body;
      if (!emoji || !userName) return res.status(400).json({ error: 'emoji و userName مطلوبان' });

      const msgId = parseInt(req.params.messageId);
      const [msg] = await db.select().from(groupMessages)
        .where(and(eq(groupMessages.id, msgId), eq(groupMessages.groupId, group.id)));
      if (!msg) return res.status(404).json({ error: 'الرسالة غير موجودة' });

      const reactions: { emoji: string; users: string[] }[] = (msg as any).reactions || [];
      const idx = reactions.findIndex((r: any) => r.emoji === emoji);
      if (idx >= 0) {
        const userIdx = reactions[idx].users.indexOf(userName);
        if (userIdx >= 0) {
          reactions[idx].users.splice(userIdx, 1);
          if (reactions[idx].users.length === 0) reactions.splice(idx, 1);
        } else {
          reactions[idx].users.push(userName);
        }
      } else {
        reactions.push({ emoji, users: [userName] });
      }

      await pool.query('UPDATE group_messages SET reactions = $1 WHERE id = $2', [JSON.stringify(reactions), msgId]);
      res.json({ success: true, reactions });
    } catch (err) {
      console.error('[groups] react error:', err);
      res.status(500).json({ error: 'فشل التفاعل' });
    }
  });

  app.put('/api/groups/:code/members/:memberName/mute', async (req, res) => {
    try {
      const [group] = await db.select().from(readingGroups).where(eq(readingGroups.groupCode, req.params.code.toUpperCase()));
      if (!group) return res.status(404).json({ error: 'المجموعة غير موجودة' });

      const { leaderKey, muted } = req.body;
      const authorized = await isAdminByLeaderKey(group, leaderKey);
      if (!authorized) {
        return res.status(403).json({ error: 'غير مسموح' });
      }

      await db.update(groupMembers)
        .set({ isMuted: muted })
        .where(and(eq(groupMembers.groupId, group.id), eq(groupMembers.userName, req.params.memberName)));

      res.json({ success: true });
    } catch (err) {
      console.error('[groups] mute error:', err);
      res.status(500).json({ error: 'فشل كتم العضو' });
    }
  });

  app.get('/api/groups/:code/reports', async (req, res) => {
    try {
      const [group] = await db.select().from(readingGroups).where(eq(readingGroups.groupCode, req.params.code.toUpperCase()));
      if (!group) return res.status(404).json({ error: 'المجموعة غير موجودة' });

      const logs = await db.select().from(groupReadingLogs)
        .where(eq(groupReadingLogs.groupId, group.id))
        .orderBy(desc(groupReadingLogs.createdAt));

      res.json({ logs });
    } catch (err) {
      console.error('[groups] reports error:', err);
      res.status(500).json({ error: 'فشل تحميل التقارير' });
    }
  });

  // الإصحاحات التي قرأها عضو (من group_reading_logs و assignment_readings) — للقراءة فقط
  app.get('/api/groups/:code/members/:memberName/read-chapters', async (req, res) => {
    try {
      const [group] = await db.select().from(readingGroups).where(eq(readingGroups.groupCode, req.params.code.toUpperCase()));
      if (!group) return res.status(404).json({ error: 'المجموعة غير موجودة' });

      const targetName = decodeURIComponent(req.params.memberName);
      const result = await pool.query(
        `SELECT DISTINCT book, chapter FROM (
           SELECT book, chapter FROM group_reading_logs WHERE group_id = $1 AND user_name = $2
           UNION
           SELECT book_name AS book, chapter FROM assignment_readings
           WHERE group_id = $1 AND user_name = $2 AND completed = true
         ) t`,
        [group.id, targetName]
      );
      res.json({ chapters: result.rows.map((r: any) => ({ book: r.book, chapter: r.chapter })) });
    } catch (err) {
      console.error('[groups] read-chapters error:', err);
      res.status(500).json({ error: 'فشل تحميل القراءات' });
    }
  });

  app.get('/api/groups/:code/leaderboard', async (req, res) => {
    try {
      const [group] = await db.select().from(readingGroups).where(eq(readingGroups.groupCode, req.params.code.toUpperCase()));
      if (!group) return res.status(404).json({ error: 'المجموعة غير موجودة' });

      const logs = await db.select().from(groupReadingLogs)
        .where(eq(groupReadingLogs.groupId, group.id));

      const memberStats: Record<string, { chaptersReadCount: number; lastReadingDate: string; totalReadingTimeMinutes: number }> = {};
      const seenChapters = new Set<string>();
      for (const log of logs) {
        if (!memberStats[log.userName]) {
          memberStats[log.userName] = { chaptersReadCount: 0, lastReadingDate: '', totalReadingTimeMinutes: 0 };
        }
        const chapterKey = `${log.userName}|${log.book}|${log.chapter}`;
        if (!seenChapters.has(chapterKey)) {
          seenChapters.add(chapterKey);
          memberStats[log.userName].chaptersReadCount++;
        }
        memberStats[log.userName].totalReadingTimeMinutes += Math.round((log.timeSpent || 0) / 60);
        if (log.date > memberStats[log.userName].lastReadingDate) {
          memberStats[log.userName].lastReadingDate = log.date;
        }
      }

      const leaderboard = Object.entries(memberStats)
        .map(([userName, stats]) => ({ userName, ...stats }))
        .sort((a, b) => b.chaptersReadCount - a.chaptersReadCount)
        .slice(0, 10);

      res.json({ leaderboard });
    } catch (err) {
      console.error('[groups] leaderboard error:', err);
      res.status(500).json({ error: 'فشل تحميل ترتيب القراءة' });
    }
  });

  // إحصاءات جميع الأعضاء (الإصحاحات المقروءة بدون حد أعلى) من كلا الجدولين
  app.get('/api/groups/:code/member-stats', async (req, res) => {
    try {
      const [group] = await db.select().from(readingGroups).where(eq(readingGroups.groupCode, req.params.code.toUpperCase()));
      if (!group) return res.status(404).json({ error: 'المجموعة غير موجودة' });

      const result = await pool.query(
        `SELECT user_name, COUNT(DISTINCT book || '|' || chapter::text) AS chapters
         FROM (
           SELECT user_name, book, chapter::text AS chapter
           FROM group_reading_logs WHERE group_id = $1
           UNION ALL
           SELECT user_name, book_name AS book, chapter::text AS chapter
           FROM assignment_readings WHERE group_id = $1 AND completed = true
         ) t
         GROUP BY user_name`,
        [group.id]
      );

      const stats: Record<string, number> = {};
      for (const row of result.rows) {
        stats[row.user_name] = parseInt(row.chapters) || 0;
      }

      res.json({ stats });
    } catch (err) {
      console.error('[groups] member-stats error:', err);
      res.status(500).json({ error: 'فشل تحميل الإحصاءات' });
    }
  });

  // الإصحاحات غير المقروءة لعضو معين من الـ assignments النشطة — للعضو نفسه أو الأدمن
  app.get('/api/groups/:code/members/:memberName/readings', async (req, res) => {
    try {
      const [group] = await db.select().from(readingGroups).where(eq(readingGroups.groupCode, req.params.code.toUpperCase()));
      if (!group) return res.status(404).json({ error: 'المجموعة غير موجودة' });

      const requesterKey = req.query.memberKey as string || '';
      const targetName = decodeURIComponent(req.params.memberName);

      // مسموح للعضو نفسه أو الأدمن
      const [requester] = await db.select().from(groupMembers)
        .where(and(eq(groupMembers.groupId, group.id), eq(groupMembers.memberKey, requesterKey)));
      const isSelf = requester?.userName === targetName;
      const isAdminUser = await isAdminByLeaderKey(group, requesterKey);
      if (!isSelf && !isAdminUser) return res.status(403).json({ error: 'غير مسموح' });

      // كل الـ assignments النشطة للمجموعة
      const assignments = await db.select().from(groupAssignments)
        .where(and(eq(groupAssignments.groupId, group.id), eq(groupAssignments.isActive, true)));

      if (assignments.length === 0) {
        return res.json({ chapters: [], assignmentId: null, hasAssignment: false });
      }

      // الإصحاحات التي أكملها العضو من الـ assignment_readings
      const completedRows = await db.select().from(assignmentReadings)
        .where(and(
          eq(assignmentReadings.groupId, group.id),
          eq(assignmentReadings.userName, targetName),
          eq(assignmentReadings.completed, true),
        ));
      const completedKeys = new Set(completedRows.map(r => `${r.bookName}|${r.chapter}`));

      // الإصحاحات التي قرأها العضو بشكل عام (group_reading_logs)
      const logs = await db.select().from(groupReadingLogs)
        .where(and(eq(groupReadingLogs.groupId, group.id), eq(groupReadingLogs.userName, targetName)));
      for (const log of logs) completedKeys.add(`${log.book}|${log.chapter}`);

      // اجمع كل إصحاحات الـ assignments غير المقروءة
      const unread: { book: string; chapter: number; assignmentId: number }[] = [];
      for (const a of assignments) {
        const chapters = (a.chapters as number[]) || [];
        for (const ch of chapters) {
          if (!completedKeys.has(`${a.bookName}|${ch}`)) {
            unread.push({ book: a.bookName, chapter: ch, assignmentId: a.id });
          }
        }
      }

      // رتّب حسب السفر ثم رقم الإصحاح
      unread.sort((a, b) => a.book.localeCompare(b.book) || a.chapter - b.chapter);

      // أول assignment id للاستخدام في تسجيل القراءة
      const firstAssignmentId = assignments[0]?.id ?? null;

      res.json({ chapters: unread, assignmentId: firstAssignmentId, hasAssignment: true });
    } catch (err) {
      console.error('[groups] member readings error:', err);
      res.status(500).json({ error: 'فشل تحميل القراءات' });
    }
  });

  app.get('/api/groups/:code/leader-report', async (req, res) => {
    try {
      const [group] = await db.select().from(readingGroups).where(eq(readingGroups.groupCode, req.params.code.toUpperCase()));
      if (!group) return res.status(404).json({ error: 'المجموعة غير موجودة' });

      const leaderKey = req.query.leaderKey as string || '';
      const authorized = await isAdminByLeaderKey(group, leaderKey);
      if (!authorized) return res.status(403).json({ error: 'غير مسموح' });

      const members = await db.select().from(groupMembers).where(eq(groupMembers.groupId, group.id));

      const now = new Date();
      const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
      const threeDaysAgo = new Date(now.getTime() - 3 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];

      // إحصاءات الأسبوع — يجمع من group_reading_logs و assignment_readings معاً
      const weeklyResult = await pool.query(
        `SELECT DISTINCT user_name, book, chapter, read_date FROM (
           SELECT user_name, book, chapter::text AS chapter, date AS read_date
           FROM group_reading_logs WHERE group_id = $1 AND date >= $2
           UNION
           SELECT user_name, book_name AS book, chapter::text AS chapter,
                  COALESCE(completed_date, TO_CHAR(completed_at, 'YYYY-MM-DD')) AS read_date
           FROM assignment_readings
           WHERE group_id = $1 AND completed = true
             AND COALESCE(completed_date, TO_CHAR(completed_at, 'YYYY-MM-DD')) >= $2
         ) t WHERE read_date IS NOT NULL`,
        [group.id, weekAgo]
      );

      const weeklyChapters = new Set(weeklyResult.rows.map((r: any) => `${r.book}-${r.chapter}`)).size;

      const lastReadByMember: Record<string, string> = {};
      for (const row of weeklyResult.rows) {
        const d = row.read_date as string;
        if (d && (!lastReadByMember[row.user_name] || d > lastReadByMember[row.user_name])) {
          lastReadByMember[row.user_name] = d;
        }
      }

      // أيضاً نفحص قبل الأسبوع لمعرفة آخر قراءة لكل عضو
      const olderResult = await pool.query(
        `SELECT DISTINCT user_name, MAX(date) AS last_date FROM group_reading_logs
         WHERE group_id = $1 AND date < $2 GROUP BY user_name
         UNION
         SELECT user_name, MAX(COALESCE(completed_date, TO_CHAR(completed_at, 'YYYY-MM-DD'))) AS last_date
         FROM assignment_readings WHERE group_id = $1 AND completed = true
           AND COALESCE(completed_date, TO_CHAR(completed_at, 'YYYY-MM-DD')) < $2
         GROUP BY user_name`,
        [group.id, weekAgo]
      );
      for (const row of olderResult.rows) {
        if (row.last_date && !lastReadByMember[row.user_name]) {
          lastReadByMember[row.user_name] = row.last_date;
        }
      }

      const inactiveMembers = members.filter(m => {
        const lastRead = lastReadByMember[m.userName];
        return !lastRead || lastRead < threeDaysAgo;
      }).map(m => m.userName);

      // تفاصيل قراءات الأعضاء النشطين — نجيب المستخدمين من weeklyResult أولاً ثم تفاصيلهم
      const activeUserNames = [...new Set(weeklyResult.rows.map((r: any) => r.user_name as string))];
      let activeMembers: any[] = [];

      if (activeUserNames.length > 0) {
        // التفاصيل من group_reading_logs — وهو السجل الشامل لكل القراءات هذا الأسبوع
        // (قراءات المهام والقراءة التلقائية كلها تُسجَّل فيه)، حتى لا يظهر القارئ بـ"٠ إصحاح"
        const placeholders = activeUserNames.map((_: any, i: number) => `$${i + 3}`).join(',');
        const detailsResult = await pool.query(
          `SELECT user_name, book AS book_name, chapter,
                  time_spent, COALESCE(scroll_percent, 0) AS scroll_depth,
                  date AS read_date
           FROM group_reading_logs
           WHERE group_id = $1 AND date >= $2 AND user_name IN (${placeholders})
           ORDER BY user_name, date DESC, id DESC`,
          [group.id, weekAgo, ...activeUserNames]
        );

        const activeMembersMap: Record<string, any[]> = {};
        for (const row of detailsResult.rows) {
          if (!activeMembersMap[row.user_name]) activeMembersMap[row.user_name] = [];
          activeMembersMap[row.user_name].push({
            bookName: row.book_name,
            chapter: row.chapter,
            timeSpent: row.time_spent || 0,
            scrollCount: 0,
            scrollDepth: row.scroll_depth || 0,
            readDate: row.read_date || '',
          });
        }
        // اعرض فقط من له إصحاح واحد على الأقل فعلاً هذا الأسبوع
        activeMembers = activeUserNames
          .map(userName => ({ userName, chapters: activeMembersMap[userName] || [] }))
          .filter(m => m.chapters.length > 0);
      }

      res.json({
        groupName: group.name,
        totalMembers: members.length,
        chaptersThisWeek: weeklyChapters,
        inactiveMembers,
        activeMembers,
      });
    } catch (err) {
      console.error('[groups] leader report error:', err);
      res.status(500).json({ error: 'فشل تحميل التقرير' });
    }
  });

  app.post('/api/groups/:code/missions', async (req, res) => {
    try {
      const [group] = await db.select().from(readingGroups).where(eq(readingGroups.groupCode, req.params.code.toUpperCase()));
      if (!group) return res.status(404).json({ error: 'المجموعة غير موجودة' });

      const { leaderKey, title, bookName, startChapter, endChapter, deadline } = req.body;
      const authorized = await isAdminByLeaderKey(group, leaderKey);
      if (!authorized) return res.status(403).json({ error: 'غير مسموح' });

      await db.update(groupMissions).set({ isActive: false })
        .where(and(eq(groupMissions.groupId, group.id), eq(groupMissions.isActive, true)));

      const [mission] = await db.insert(groupMissions).values({
        groupId: group.id,
        title,
        bookName,
        startChapter,
        endChapter,
        deadline,
        createdBy: req.body.userName || group.leaderName,
      }).returning();

      res.json({ mission });
    } catch (err) {
      console.error('[groups] create mission error:', err);
      res.status(500).json({ error: 'فشل إنشاء المهمة' });
    }
  });

  app.get('/api/groups/:code/missions', async (req, res) => {
    try {
      const [group] = await db.select().from(readingGroups).where(eq(readingGroups.groupCode, req.params.code.toUpperCase()));
      if (!group) return res.status(404).json({ error: 'المجموعة غير موجودة' });

      const missions = await db.select().from(groupMissions)
        .where(and(eq(groupMissions.groupId, group.id), eq(groupMissions.isActive, true)));

      const activeMission = missions[0] || null;

      if (activeMission) {
        const members = await db.select().from(groupMembers).where(eq(groupMembers.groupId, group.id));
        const logs = await db.select().from(groupReadingLogs)
          .where(eq(groupReadingLogs.groupId, group.id));

        const missionChapters = new Set<string>();
        for (let ch = activeMission.startChapter; ch <= activeMission.endChapter; ch++) {
          missionChapters.add(`${activeMission.bookName}-${ch}`);
        }
        const totalChapters = missionChapters.size;

        const memberProgress: Record<string, number> = {};
        for (const m of members) { memberProgress[m.userName] = 0; }

        for (const log of logs) {
          const key = `${log.book}-${log.chapter}`;
          if (missionChapters.has(key) && memberProgress[log.userName] !== undefined) {
            memberProgress[log.userName]++;
          }
        }

        const completedMembers = Object.values(memberProgress).filter(c => c >= totalChapters).length;
        const groupProgress = members.length > 0 ? Math.round((completedMembers / members.length) * 100) : 0;

        return res.json({
          mission: activeMission,
          totalChapters,
          memberProgress,
          completedMembers,
          totalMembers: members.length,
          groupProgress,
        });
      }

      res.json({ mission: null });
    } catch (err) {
      console.error('[groups] get missions error:', err);
      res.status(500).json({ error: 'فشل تحميل المهمة' });
    }
  });

  app.get('/api/groups/:code/assignments', async (req, res) => {
    try {
      const [group] = await db.select().from(readingGroups).where(eq(readingGroups.groupCode, req.params.code.toUpperCase()));
      if (!group) return res.status(404).json({ error: 'المجموعة غير موجودة' });

      const assignments = await db.select().from(groupAssignments)
        .where(and(eq(groupAssignments.groupId, group.id), eq(groupAssignments.isActive, true)))
        .orderBy(desc(groupAssignments.createdAt));

      res.json({ assignments });
    } catch (err) {
      console.error('[groups] get assignments error:', err);
      res.status(500).json({ error: 'فشل تحميل القراءات المطلوبة' });
    }
  });

  app.post('/api/groups/:code/assignments', async (req, res) => {
    try {
      const [group] = await db.select().from(readingGroups).where(eq(readingGroups.groupCode, req.params.code.toUpperCase()));
      if (!group) return res.status(404).json({ error: 'المجموعة غير موجودة' });

      const { leaderKey, userName, type, title, bookName, chapters, deadline } = req.body;
      const authorized = await isAdminByLeaderKey(group, leaderKey);
      if (!authorized) return res.status(403).json({ error: 'غير مسموح' });

      const date = new Date().toISOString().split('T')[0];
      const [assignment] = await db.insert(groupAssignments).values({
        groupId: group.id,
        type,
        title: title || null,
        bookName,
        chapters: chapters,
        assignedBy: userName,
        assignedDate: date,
        deadline: deadline || null,
      }).returning();

      res.json({ assignment });
    } catch (err) {
      console.error('[groups] create assignment error:', err);
      res.status(500).json({ error: 'فشل إنشاء القراءة المطلوبة' });
    }
  });

  app.delete('/api/groups/:code/assignments/:assignmentId', async (req, res) => {
    try {
      const [group] = await db.select().from(readingGroups).where(eq(readingGroups.groupCode, req.params.code.toUpperCase()));
      if (!group) return res.status(404).json({ error: 'المجموعة غير موجودة' });

      const { leaderKey } = req.body;
      const authorized = await isAdminByLeaderKey(group, leaderKey);
      if (!authorized) return res.status(403).json({ error: 'غير مسموح' });

      await db.update(groupAssignments)
        .set({ isActive: false })
        .where(eq(groupAssignments.id, parseInt(req.params.assignmentId)));

      res.json({ success: true });
    } catch (err) {
      console.error('[groups] delete assignment error:', err);
      res.status(500).json({ error: 'فشل حذف القراءة' });
    }
  });

  app.get('/api/groups/:code/assignments/:assignmentId/progress', async (req, res) => {
    try {
      const [group] = await db.select().from(readingGroups).where(eq(readingGroups.groupCode, req.params.code.toUpperCase()));
      if (!group) return res.status(404).json({ error: 'المجموعة غير موجودة' });

      const assignmentId = parseInt(req.params.assignmentId);
      const readings = await db.select().from(assignmentReadings)
        .where(and(eq(assignmentReadings.assignmentId, assignmentId), eq(assignmentReadings.groupId, group.id)));

      const memberProgress: Record<string, { completed: number; total_time: number; chapters: Record<number, { timeSpent: number; scrollCount: number; completed: boolean }> }> = {};

      for (const r of readings) {
        if (!memberProgress[r.userName]) {
          memberProgress[r.userName] = { completed: 0, total_time: 0, chapters: {} };
        }
        memberProgress[r.userName].chapters[r.chapter] = {
          timeSpent: r.timeSpent || 0,
          scrollCount: r.scrollCount || 0,
          completed: r.completed || false,
        };
        if (r.completed) {
          memberProgress[r.userName].completed++;
          memberProgress[r.userName].total_time += (r.timeSpent || 0);
        }
      }

      res.json({ memberProgress });
    } catch (err) {
      console.error('[groups] get assignment progress error:', err);
      res.status(500).json({ error: 'فشل تحميل تقدم القراءة' });
    }
  });

  app.post('/api/groups/:code/assignments/:assignmentId/open', async (req, res) => {
    try {
      const [group] = await db.select().from(readingGroups).where(eq(readingGroups.groupCode, req.params.code.toUpperCase()));
      if (!group) return res.status(404).json({ error: 'المجموعة غير موجودة' });

      const assignmentId = parseInt(req.params.assignmentId);
      const { userName, bookName, chapter } = req.body;
      if (!userName || !bookName || !chapter) return res.status(400).json({ error: 'بيانات ناقصة' });

      const existing = await db.select().from(assignmentReadings)
        .where(and(
          eq(assignmentReadings.assignmentId, assignmentId),
          eq(assignmentReadings.groupId, group.id),
          eq(assignmentReadings.userName, userName),
          eq(assignmentReadings.chapter, chapter),
        ));

      if (existing.length === 0) {
        await db.insert(assignmentReadings).values({
          assignmentId,
          groupId: group.id,
          userName,
          bookName,
          chapter,
          timeSpent: 0,
          scrollCount: 0,
          scrollDepth: 0,
          completed: false,
          openedAt: new Date(),
        });
      }

      res.json({ ok: true });
    } catch (err) {
      console.error('[groups] assignment open error:', err);
      res.status(500).json({ error: 'فشل تسجيل فتح الإصحاح' });
    }
  });

  app.post('/api/groups/:code/assignments/:assignmentId/read', async (req, res) => {
    try {
      const [group] = await db.select().from(readingGroups).where(eq(readingGroups.groupCode, req.params.code.toUpperCase()));
      if (!group) return res.status(404).json({ error: 'المجموعة غير موجودة' });

      const assignmentId = parseInt(req.params.assignmentId);
      const { userName, bookName, timeSpent, scrollCount, scrollDepth } = req.body;
      const chapter = parseInt(req.body.chapter);

      const existing = await db.select().from(assignmentReadings)
        .where(and(
          eq(assignmentReadings.assignmentId, assignmentId),
          eq(assignmentReadings.groupId, group.id),
          eq(assignmentReadings.userName, userName),
          eq(assignmentReadings.chapter, chapter),
        ));

      if (existing.length > 0) {
        const today = new Date().toISOString().split('T')[0];
        await pool.query(
          `UPDATE assignment_readings SET
            time_spent = GREATEST(COALESCE(time_spent,0), $1),
            scroll_count = GREATEST(COALESCE(scroll_count,0), $2),
            scroll_depth = GREATEST(COALESCE(scroll_depth,0), $3),
            completed = true,
            completed_at = NOW(),
            completed_date = $4
           WHERE id = $5`,
          [timeSpent || 0, scrollCount || 0, scrollDepth || 0, today, existing[0].id]
        );
        const updated = { ...existing[0], completed: true, completedAt: new Date() };

        // سجّل في group_reading_logs حتى تُحتسب للإحصائيات اليومية
        try {
          const date = new Date().toISOString().split('T')[0];
          await pool.query(
            `INSERT INTO group_reading_logs (group_id, user_name, book, chapter, date, time_spent)
             SELECT $1,$2,$3,$4,$5,$6
             WHERE NOT EXISTS (
               SELECT 1 FROM group_reading_logs
               WHERE group_id=$1 AND user_name=$2 AND date=$5 AND book=$3 AND chapter=$4
             )`,
            [group.id, userName, bookName, chapter, date, timeSpent || 0]
          );
        } catch (logErr) {
          console.error('[groups] assignment read - log insert error (update path):', logErr);
        }

        // تحقق هل أتم العضو كل إصحاحات كل القراءات
        const allDoneCheck = await pool.query(
          `SELECT COUNT(*) = 0 AS all_done
           FROM (
             SELECT ga.id, ch::int AS chapter
             FROM group_assignments ga
             CROSS JOIN LATERAL unnest(ga.chapters::int[]) AS ch
             WHERE ga.group_id = $1
           ) required
           WHERE NOT EXISTS (
             SELECT 1 FROM assignment_readings ar
             WHERE ar.assignment_id = required.id
               AND ar.user_name = $2
               AND ar.chapter = required.chapter
               AND ar.completed = true
           )`,
          [group.id, userName]
        );
        const allDone: boolean = allDoneCheck.rows[0]?.all_done === true;

        return res.json({ reading: updated, allDone });
      }

      const todayStr = new Date().toISOString().split('T')[0];
      const insertResult = await pool.query(
        `INSERT INTO assignment_readings
           (assignment_id, group_id, user_name, book_name, chapter,
            time_spent, scroll_count, scroll_depth,
            completed, opened_at, completed_at, completed_date, created_at)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,true,NOW(),NOW(),$9,NOW())
         RETURNING *`,
        [assignmentId, group.id, userName, bookName, chapter,
         timeSpent || 0, scrollCount || 0, scrollDepth || 0, todayStr]
      );
      const reading = insertResult.rows[0];

      try {
        const date = new Date().toISOString().split('T')[0];
        await pool.query(
          `INSERT INTO group_reading_logs (group_id, user_name, book, chapter, date, time_spent)
           SELECT $1,$2,$3,$4,$5,$6
           WHERE NOT EXISTS (
             SELECT 1 FROM group_reading_logs
             WHERE group_id=$1 AND user_name=$2 AND date=$5 AND book=$3 AND chapter=$4
           )`,
          [group.id, userName, bookName, chapter, date, timeSpent || 0]
        );
      } catch (logErr) {
        console.error('[groups] assignment read - log insert error (insert path):', logErr);
      }

      try {
        const cps = await db.select().from(challengeParticipants)
          .where(eq(challengeParticipants.groupId, group.id));
        for (const cp of cps) {
          const [ch] = await db.select().from(churchChallenges)
            .where(eq(churchChallenges.id, cp.challengeId));
          if (ch && ch.isActive && ch.bookName === bookName && chapter >= ch.startChapter && chapter <= ch.endChapter) {
            await db.update(challengeParticipants)
              .set({ totalChaptersRead: (cp.totalChaptersRead || 0) + 1 })
              .where(eq(challengeParticipants.id, cp.id));
          }
        }
      } catch (e) {
        console.log('[groups] challenge update from assignment (non-critical):', e);
      }

      const allDoneCheck2 = await pool.query(
        `SELECT COUNT(*) = 0 AS all_done
         FROM (
           SELECT ga.id, ch::int AS chapter
           FROM group_assignments ga
           CROSS JOIN LATERAL unnest(ga.chapters::int[]) AS ch
           WHERE ga.group_id = $1
         ) required
         WHERE NOT EXISTS (
           SELECT 1 FROM assignment_readings ar
           WHERE ar.assignment_id = required.id
             AND ar.user_name = $2
             AND ar.chapter = required.chapter
             AND ar.completed = true
         )`,
        [group.id, userName]
      );
      const allDone2: boolean = allDoneCheck2.rows[0]?.all_done === true;

      res.json({ reading, allDone: allDone2 });
    } catch (err) {
      console.error('[groups] assignment read error:', err);
      res.status(500).json({ error: 'فشل تسجيل القراءة' });
    }
  });

  app.get('/api/groups/:code/assignments/:assignmentId/admin-report', async (req, res) => {
    try {
      const [group] = await db.select().from(readingGroups).where(eq(readingGroups.groupCode, req.params.code.toUpperCase()));
      if (!group) return res.status(404).json({ error: 'المجموعة غير موجودة' });

      const assignmentId = parseInt(req.params.assignmentId);
      const [assignment] = await db.select().from(groupAssignments).where(eq(groupAssignments.id, assignmentId));
      if (!assignment) return res.status(404).json({ error: 'القراءة غير موجودة' });

      const members = await db.select().from(groupMembers)
        .where(eq(groupMembers.groupId, group.id));

      const readings = await db.select().from(assignmentReadings)
        .where(and(eq(assignmentReadings.assignmentId, assignmentId), eq(assignmentReadings.groupId, group.id)));

      const chapters = (assignment.chapters as number[]) || [];

      const report = members.map(m => {
        const memberReadings = readings.filter(r => r.userName === m.userName);
        const chapterDetails = chapters.map(ch => {
          const r = memberReadings.find(mr => mr.chapter === ch);
          let quality: string | null = null;
          if (r?.completed) {
            if ((r.timeSpent || 0) < 30) quality = 'fast';
            else if ((r.scrollDepth || 0) >= 80 && (r.timeSpent || 0) >= 60) quality = 'genuine';
            else quality = 'normal';
          } else if (r?.openedAt) {
            quality = 'opened';
          }
          return {
            chapter: ch,
            timeSpent: r?.timeSpent || 0,
            scrollCount: r?.scrollCount || 0,
            scrollDepth: r?.scrollDepth || 0,
            completed: r?.completed || false,
            opened: !!r?.openedAt,
            openedAt: r?.openedAt || null,
            completedAt: r?.completedAt || null,
            quality,
          };
        });

        const completedChapters = chapterDetails.filter(c => c.completed).length;
        const openedChapters = chapterDetails.filter(c => c.opened && !c.completed).length;
        const totalTime = chapterDetails.reduce((sum, c) => sum + c.timeSpent, 0);
        const avgScrollDepth = completedChapters > 0
          ? Math.round(chapterDetails.filter(c => c.completed).reduce((sum, c) => sum + c.scrollDepth, 0) / completedChapters)
          : 0;
        const lastActivity = chapterDetails
          .map(c => c.completedAt || c.openedAt)
          .filter(Boolean)
          .sort()
          .pop() || null;

        return {
          userName: m.userName,
          completedChapters,
          openedChapters,
          totalChapters: chapters.length,
          totalTime,
          totalScrolls: chapterDetails.reduce((sum, c) => sum + c.scrollCount, 0),
          avgScrollDepth,
          lastActivity,
          chapterDetails,
        };
      });

      report.sort((a, b) => b.completedChapters - a.completedChapters);
      res.json({ report, assignment });
    } catch (err) {
      console.error('[groups] admin report error:', err);
      res.status(500).json({ error: 'فشل تحميل التقرير' });
    }
  });
}
