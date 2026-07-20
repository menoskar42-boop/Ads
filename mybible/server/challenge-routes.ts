import type { Express } from "express";
import { eq, and, desc, sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/node-postgres";
import pg from "pg";
import {
  churchChallenges, challengeParticipants, readingGroups, groupReadingLogs, groupMembers,
} from "@shared/schema";

const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
const db = drizzle(pool);

const ADMIN_PHONE = process.env.ADMIN_PHONE || '01552406406';

export function registerChallengeRoutes(app: Express) {

  app.get('/api/challenges', async (_req, res) => {
    try {
      const challenges = await db.select().from(churchChallenges)
        .where(eq(churchChallenges.isActive, true))
        .orderBy(desc(churchChallenges.createdAt));

      res.json({ challenges });
    } catch (err) {
      console.error('[challenges] list error:', err);
      res.status(500).json({ error: 'فشل تحميل التحديات' });
    }
  });

  app.get('/api/challenges/all', async (_req, res) => {
    try {
      const challenges = await db.select().from(churchChallenges)
        .orderBy(desc(churchChallenges.createdAt));
      res.json({ challenges });
    } catch (err) {
      console.error('[challenges] list all error:', err);
      res.status(500).json({ error: 'فشل تحميل التحديات' });
    }
  });

  app.get('/api/challenges/:id', async (req, res) => {
    try {
      const challengeId = parseInt(req.params.id);
      const [challenge] = await db.select().from(churchChallenges)
        .where(eq(churchChallenges.id, challengeId));

      if (!challenge) return res.status(404).json({ error: 'التحدي غير موجود' });

      const participants = await db.select().from(challengeParticipants)
        .where(eq(challengeParticipants.challengeId, challengeId));

      const groupIds = participants.map(p => p.groupId);

      const groups = groupIds.length > 0
        ? await db.select().from(readingGroups)
            .where(sql`${readingGroups.id} IN (${sql.join(groupIds.map(id => sql`${id}`), sql`, `)})`)
        : [];

      const totalChapters = challenge.endChapter - challenge.startChapter + 1;

      const leaderboard = participants.map(p => {
        const group = groups.find(g => g.id === p.groupId);
        return {
          groupId: p.groupId,
          groupName: group?.name || 'مجموعة غير معروفة',
          churchName: group?.churchName || '',
          totalChaptersRead: p.totalChaptersRead || 0,
          progress: totalChapters > 0 ? Math.min(Math.round(((p.totalChaptersRead || 0) / totalChapters) * 100), 100) : 0,
          memberCount: 0,
        };
      }).sort((a, b) => b.totalChaptersRead - a.totalChaptersRead);

      for (const entry of leaderboard) {
        const members = await db.select().from(groupMembers)
          .where(eq(groupMembers.groupId, entry.groupId));
        entry.memberCount = members.length;
      }

      res.json({
        challenge,
        totalChapters,
        leaderboard,
        participantCount: participants.length,
      });
    } catch (err) {
      console.error('[challenges] get error:', err);
      res.status(500).json({ error: 'فشل تحميل التحدي' });
    }
  });

  app.post('/api/challenges', async (req, res) => {
    try {
      const { adminPhone, title, bookName, startChapter, endChapter, startDate, endDate } = req.body;

      if (adminPhone !== ADMIN_PHONE) {
        return res.status(403).json({ error: 'غير مسموح' });
      }

      if (!title || !bookName || !startChapter || !endChapter || !startDate || !endDate) {
        return res.status(400).json({ error: 'جميع الحقول مطلوبة' });
      }

      const [challenge] = await db.insert(churchChallenges).values({
        title,
        bookName,
        startChapter: parseInt(startChapter),
        endChapter: parseInt(endChapter),
        startDate,
        endDate,
      }).returning();

      res.json({ challenge });
    } catch (err) {
      console.error('[challenges] create error:', err);
      res.status(500).json({ error: 'فشل إنشاء التحدي' });
    }
  });

  app.post('/api/challenges/:id/join', async (req, res) => {
    try {
      const challengeId = parseInt(req.params.id);
      const { groupCode } = req.body;

      const [challenge] = await db.select().from(churchChallenges)
        .where(eq(churchChallenges.id, challengeId));
      if (!challenge) return res.status(404).json({ error: 'التحدي غير موجود' });

      const [group] = await db.select().from(readingGroups)
        .where(eq(readingGroups.groupCode, groupCode.toUpperCase()));
      if (!group) return res.status(404).json({ error: 'المجموعة غير موجودة' });

      const existing = await db.select().from(challengeParticipants)
        .where(and(
          eq(challengeParticipants.challengeId, challengeId),
          eq(challengeParticipants.groupId, group.id)
        ));

      if (existing.length > 0) {
        return res.status(400).json({ error: 'المجموعة مشتركة بالفعل في هذا التحدي' });
      }

      const logs = await db.select().from(groupReadingLogs)
        .where(eq(groupReadingLogs.groupId, group.id));

      let chaptersRead = 0;
      const uniqueChapters = new Set<string>();
      for (const log of logs) {
        if (log.book === challenge.bookName) {
          const ch = log.chapter;
          if (ch >= challenge.startChapter && ch <= challenge.endChapter) {
            const key = `${log.userName}-${ch}`;
            if (!uniqueChapters.has(key)) {
              uniqueChapters.add(key);
              chaptersRead++;
            }
          }
        }
      }

      const [participant] = await db.insert(challengeParticipants).values({
        challengeId,
        groupId: group.id,
        totalChaptersRead: chaptersRead,
      }).returning();

      res.json({ participant, groupName: group.name });
    } catch (err) {
      console.error('[challenges] join error:', err);
      res.status(500).json({ error: 'فشل الانضمام للتحدي' });
    }
  });

  app.post('/api/challenges/update-progress', async (req, res) => {
    try {
      const { groupId, book, chapter } = req.body;
      if (!groupId || !book || !chapter) return res.status(400).json({ error: 'بيانات ناقصة' });

      const participants = await db.select().from(challengeParticipants)
        .where(eq(challengeParticipants.groupId, groupId));

      for (const p of participants) {
        const [challenge] = await db.select().from(churchChallenges)
          .where(eq(churchChallenges.id, p.challengeId));

        if (challenge && challenge.bookName === book && chapter >= challenge.startChapter && chapter <= challenge.endChapter) {
          await db.update(challengeParticipants)
            .set({ totalChaptersRead: (p.totalChaptersRead || 0) + 1 })
            .where(eq(challengeParticipants.id, p.id));
        }
      }

      res.json({ ok: true });
    } catch (err) {
      console.error('[challenges] update-progress error:', err);
      res.status(500).json({ error: 'فشل تحديث التقدم' });
    }
  });

  app.get('/api/challenges/group/:groupCode', async (req, res) => {
    try {
      const [group] = await db.select().from(readingGroups)
        .where(eq(readingGroups.groupCode, req.params.groupCode.toUpperCase()));
      if (!group) return res.status(404).json({ error: 'المجموعة غير موجودة' });

      const participants = await db.select().from(challengeParticipants)
        .where(eq(challengeParticipants.groupId, group.id));

      const challengeIds = participants.map(p => p.challengeId);
      const challenges = challengeIds.length > 0
        ? await db.select().from(churchChallenges)
            .where(sql`${churchChallenges.id} IN (${sql.join(challengeIds.map(id => sql`${id}`), sql`, `)})`)
        : [];

      const result = participants.map(p => {
        const ch = challenges.find(c => c.id === p.challengeId);
        return {
          ...p,
          challenge: ch || null,
        };
      });

      res.json({ participations: result });
    } catch (err) {
      console.error('[challenges] group challenges error:', err);
      res.status(500).json({ error: 'فشل تحميل التحديات' });
    }
  });

  app.delete('/api/challenges/:id', async (req, res) => {
    try {
      const { adminPhone } = req.body;
      if (adminPhone !== ADMIN_PHONE) return res.status(403).json({ error: 'غير مسموح' });

      await db.update(churchChallenges)
        .set({ isActive: false })
        .where(eq(churchChallenges.id, parseInt(req.params.id)));

      res.json({ ok: true });
    } catch (err) {
      console.error('[challenges] delete error:', err);
      res.status(500).json({ error: 'فشل حذف التحدي' });
    }
  });
}
