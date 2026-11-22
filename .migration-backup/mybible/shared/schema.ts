import { sql } from "drizzle-orm";
import { 
  pgTable, 
  text, 
  varchar, 
  serial, 
  integer, 
  timestamp, 
  boolean,
  jsonb,
  index,
  uniqueIndex
} from "drizzle-orm/pg-core";
import { createInsertSchema, createSelectSchema } from "drizzle-zod";
import { z } from "zod";

// Users table - anonymous users with session IDs
export const users = pgTable("users", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  sessionId: text("session_id").unique(),
  isPremium: boolean("is_premium").notNull().default(false),
  subscriptionExpiry: timestamp("subscription_expiry"),
  aiUsageCount: integer("ai_usage_count").notNull().default(0),
  aiUsageResetDate: timestamp("ai_usage_reset_date").notNull().defaultNow(),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  churchNum: integer("church_num"),
});

// Bible books
export const bibleBooks = pgTable("bible_books", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  testament: text("testament").notNull(), // 'old' or 'new'
  bookOrder: integer("book_order").notNull(),
  chaptersCount: integer("chapters_count").notNull(),
});

// Bible verses
export const bibleVerses = pgTable("bible_verses", {
  id: serial("id").primaryKey(),
  bookId: integer("book_id").notNull().references(() => bibleBooks.id),
  chapter: integer("chapter").notNull(),
  verse: integer("verse").notNull(),
  text: text("text").notNull(),
}, (table) => ({
  bookChapterVerseIdx: index("book_chapter_verse_idx").on(table.bookId, table.chapter, table.verse),
}));

// Daily verses pool
export const dailyVerses = pgTable("daily_verses", {
  id: serial("id").primaryKey(),
  verseId: integer("verse_id").notNull().references(() => bibleVerses.id),
  date: timestamp("date").notNull().unique(),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

// Reading plans templates
export const readingPlans = pgTable("reading_plans", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  duration: text("duration").notNull(),
  daysTotal: integer("days_total").notNull(),
  description: text("description").notNull(),
  planData: jsonb("plan_data").notNull(), // Array of daily readings
});

// User reading progress
export const userReadingProgress = pgTable("user_reading_progress", {
  id: serial("id").primaryKey(),
  userId: varchar("user_id").notNull().references(() => users.id, { onDelete: 'cascade' }),
  memberKey: text("member_key"), // nullable — يربط التقدّم بعضو مجموعة لاسترجاعه من جهاز آخر
  planId: integer("plan_id").notNull().references(() => readingPlans.id),
  currentDay: integer("current_day").notNull().default(0),
  completedDays: jsonb("completed_days").notNull().default([]), // Array of completed day numbers
  startedAt: timestamp("started_at").notNull().defaultNow(),
  lastReadAt: timestamp("last_read_at"),
}, (table) => ({
  userPlanIdx: index("user_plan_idx").on(table.userId, table.planId),
  memberKeyIdx: index("urp_member_key_idx").on(table.memberKey),
}));

// Highlighted verses
export const highlightedVerses = pgTable("highlighted_verses", {
  id: serial("id").primaryKey(),
  userId: varchar("user_id").notNull().references(() => users.id, { onDelete: 'cascade' }),
  memberKey: text("member_key"), // nullable — لاسترجاع تظليلات عضو المجموعة من جهاز آخر
  verseId: integer("verse_id").notNull().references(() => bibleVerses.id),
  color: text("color").notNull(), // 'yellow', 'green', 'blue', 'pink', 'orange'
  note: text("note"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
}, (table) => ({
  userVerseIdx: index("user_verse_idx").on(table.userId, table.verseId),
  hvMemberKeyIdx: index("hv_member_key_idx").on(table.memberKey),
}));

// Emotions catalog
export const emotions = pgTable("emotions", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  icon: text("icon").notNull(),
  color: text("color").notNull(),
});

// Topics catalog
export const topics = pgTable("topics", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  icon: text("icon").notNull(),
});

// Emotion-Verse mappings - contains full verse text (independent from bible_verses)
export const emotionVerses = pgTable("emotion_verses", {
  id: serial("id").primaryKey(),
  emotionId: integer("emotion_id").notNull().references(() => emotions.id),
  bookName: text("book_name").notNull(),
  chapter: integer("chapter").notNull(),
  verse: integer("verse").notNull(),
  verseText: text("verse_text").notNull(),
}, (table) => ({
  emotionIdx: index("emotion_idx").on(table.emotionId),
}));

// Topic-Verse mappings - contains full verse text (independent from bible_verses)
export const topicVerses = pgTable("topic_verses", {
  id: serial("id").primaryKey(),
  topicId: integer("topic_id").notNull().references(() => topics.id),
  bookName: text("book_name").notNull(),
  chapter: integer("chapter").notNull(),
  verse: integer("verse").notNull(),
  verseText: text("verse_text").notNull(),
}, (table) => ({
  topicIdx: index("topic_idx").on(table.topicId),
}));

// Children's stories
export const childStories = pgTable("child_stories", {
  id: serial("id").primaryKey(),
  title: text("title").notNull(),
  summary: text("summary").notNull(),
  ageGroup: text("age_group").notNull(),
  imageEmoji: text("image_emoji"),
  content: text("content").notNull(),
  orderIndex: integer("order_index").notNull(),
});

// Calendar Daily Verses - One verse per day of the year (367 days)
// Uses month + day to determine the verse, NOT linked to bible_verses table
export const calendarDailyVerses = pgTable("calendar_daily_verses", {
  id: serial("id").primaryKey(),
  dayIndex: integer("day_index").notNull().unique(),
  month: integer("month").notNull(),
  day: integer("day").notNull(),
  verseText: text("verse_text").notNull(),
  verseReference: text("verse_reference").notNull(),
  theme: text("theme"),
}, (table) => ({
  monthDayIdx: index("month_day_idx").on(table.month, table.day),
}));

// AI Emotion Verses - OLD table (deprecated, kept for backward compatibility)
// This is SEPARATE from the UI emotions table (8 emotions)
export const aiEmotionVerses = pgTable("ai_emotion_verses", {
  id: serial("id").primaryKey(),
  emotionName: text("emotion_name").notNull(),
  emotionGroup: text("emotion_group").notNull(),
  verseText: text("verse_text").notNull(),
  verseReference: text("verse_reference").notNull(),
  tone: text("tone").notNull(),
  isActive: boolean("is_active").notNull().default(true),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
}, (table) => ({
  emotionNameIdx: index("ai_emotion_name_idx").on(table.emotionName),
  emotionGroupIdx: index("ai_emotion_group_idx").on(table.emotionGroup),
}));

// NEW AI Emotions table - Two-level emotion system (core_emotion → sub_emotion)
// This is the PRIMARY table for AI emotion detection and verse selection
// Contains 1000 rows with 10 core emotions and ~100 sub-emotions
export const aiEmotions = pgTable("ai_emotions", {
  id: serial("id").primaryKey(),
  coreEmotion: text("core_emotion").notNull(),
  subEmotion: text("sub_emotion").notNull(),
  verseText: text("verse_text").notNull(),
  verseReference: text("verse_reference").notNull(),
  tone: text("tone").notNull().default("تعزية"),
  active: boolean("active").notNull().default(true),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
}, (table) => ({
  coreEmotionIdx: index("ai_emotions_core_idx").on(table.coreEmotion),
  subEmotionIdx: index("ai_emotions_sub_idx").on(table.subEmotion),
}));

// AI Emotion Examples - Reference phrases for semantic emotion classification
// Used as context examples for GPT, NOT as exact lookup table
export const aiEmotionExamples = pgTable("ai_emotion_examples", {
  id: serial("id").primaryKey(),
  userPhrase: text("user_phrase").notNull(),
  primaryEmotion: text("primary_emotion").notNull(),
  secondaryEmotions: text("secondary_emotions"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
}, (table) => ({
  emotionIdx: index("ai_example_emotion_idx").on(table.primaryEmotion),
}));

// AI User Phrases - Common user expressions mapped to core emotions
// This is a SUPPORTING table for semantic phrase matching
// It does NOT contain verses - only maps phrases to emotions
// Verses come from ai_emotions table only
export const aiUserPhrases = pgTable("ai_user_phrases", {
  id: serial("id").primaryKey(),
  phrase: text("phrase").notNull(),
  emotionKey: text("emotion_key").notNull(), // Maps to core_emotion in ai_emotions
  createdAt: timestamp("created_at").notNull().defaultNow(),
}, (table) => ({
  phraseIdx: index("ai_user_phrases_phrase_idx").on(table.phrase),
  emotionKeyIdx: index("ai_user_phrases_emotion_idx").on(table.emotionKey),
}));

// AI usage log
export const aiUsageLog = pgTable("ai_usage_log", {
  id: serial("id").primaryKey(),
  userId: varchar("user_id").notNull().references(() => users.id, { onDelete: 'cascade' }),
  modelType: text("model_type").notNull(), // 'free' or 'paid'
  query: text("query").notNull(),
  response: text("response"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
}, (table) => ({
  userCreatedIdx: index("user_created_idx").on(table.userId, table.createdAt),
}));

// Reading Groups
export const readingGroups = pgTable("reading_groups", {
  id: serial("id").primaryKey(),
  groupCode: varchar("group_code", { length: 10 }).notNull().unique(),
  name: text("name").notNull(),
  churchName: text("church_name"),
  churchId: integer("church_id"),
  ageGroup: text("age_group"),
  description: text("description"),
  leaderName: text("leader_name").notNull(),
  leaderKey: text("leader_key").notNull(),
  todayBook: text("today_book"),
  todayChapter: integer("today_chapter"),
  challengeTotal: integer("challenge_total").default(0),
  linkJoinMode: text("link_join_mode").default('approval'), // 'approval' | 'auto'
  messagingMode: text("messaging_mode").default('all'), // 'all' | 'admin_only'
  autoReadingConfig: jsonb("auto_reading_config").$type<{
    enabled: boolean;
    otChaptersPerDay: number;
    ntChaptersPerDay: number;
    baseDate: string;      // YYYY-MM-DD — تاريخ نقطة البداية
    otStartIndex: number;  // index in flat OT chapter list
    ntStartIndex: number;  // index in flat NT chapter list
  } | null>().default(null),
  guestAccessEnabled: boolean("guest_access_enabled").default(false),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const groupMembers = pgTable("group_members", {
  id: serial("id").primaryKey(),
  groupId: integer("group_id").notNull(),
  userName: text("user_name").notNull(),
  memberKey: text("member_key").notNull(),
  phone: text("phone"),
  isAdmin: boolean("is_admin").default(false),
  isMuted: boolean("is_muted").default(false),
  joinedAt: timestamp("joined_at").notNull().defaultNow(),
}, (t) => ({
  gmGroupIdx: index("idx_group_members_group_id").on(t.groupId),
  gmGroupPhoneUniqueIdx: uniqueIndex("gm_group_phone_unique_idx").on(t.groupId, t.phone).where(sql`${t.phone} IS NOT NULL`),
}));

export const groupGuestTokens = pgTable("group_guest_tokens", {
  id: serial("id").primaryKey(),
  token: text("token").notNull(),
  groupId: integer("group_id").notNull(),
  groupCode: text("group_code").notNull(),
  memberNumber: integer("member_number").notNull(),
  memberKey: text("member_key").notNull(),
  phone: text("phone"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
}, (table) => ({
  tokenGroupIdx: uniqueIndex("ggt_token_group_idx").on(table.token, table.groupCode),
}));

export const groupReadingLogs = pgTable("group_reading_logs", {
  id: serial("id").primaryKey(),
  groupId: integer("group_id").notNull(),
  userName: text("user_name").notNull(),
  book: text("book").notNull(),
  chapter: integer("chapter").notNull(),
  date: text("date").notNull(),
  timeSpent: integer("time_spent").default(0),
  scrollPercent: integer("scroll_percent").default(0),
  quality: text("quality").default("unknown"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
}, (t) => ({
  grlGroupIdx: index("idx_group_reading_logs_group_id").on(t.groupId),
  grlGroupDateIdx: index("idx_group_reading_logs_group_date").on(t.groupId, t.date),
}));

export const groupMessages = pgTable("group_messages", {
  id: serial("id").primaryKey(),
  groupId: integer("group_id").notNull(),
  userName: text("user_name").notNull(),
  message: text("message").notNull(),
  imageUrl: text("image_url"),
  replyToId: integer("reply_to_id"),
  replyToText: text("reply_to_text"),
  replyToUserName: text("reply_to_user_name"),
  reactions: jsonb("reactions").$type<{ emoji: string; users: string[] }[]>().default([]),
  isPinned: boolean("is_pinned").default(false),
  createdAt: timestamp("created_at").notNull().defaultNow(),
}, (t) => ({
  gmsgGroupIdx: index("idx_group_messages_group_id").on(t.groupId),
}));

// Group Missions (weekly reading missions)
export const groupMissions = pgTable("group_missions", {
  id: serial("id").primaryKey(),
  groupId: integer("group_id").notNull(),
  title: text("title").notNull(),
  bookName: text("book_name").notNull(),
  startChapter: integer("start_chapter").notNull(),
  endChapter: integer("end_chapter").notNull(),
  deadline: text("deadline").notNull(),
  createdBy: text("created_by").notNull(),
  isActive: boolean("is_active").default(true),
  createdAt: timestamp("created_at").notNull().defaultNow(),
}, (t) => ({
  gmisGroupIdx: index("idx_group_missions_group_id").on(t.groupId),
}));

// Church Reading Challenges
export const churchChallenges = pgTable("church_challenges", {
  id: serial("id").primaryKey(),
  title: text("title").notNull(),
  bookName: text("book_name").notNull(),
  startChapter: integer("start_chapter").notNull(),
  endChapter: integer("end_chapter").notNull(),
  startDate: text("start_date").notNull(),
  endDate: text("end_date").notNull(),
  isActive: boolean("is_active").default(true),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const challengeParticipants = pgTable("challenge_participants", {
  id: serial("id").primaryKey(),
  challengeId: integer("challenge_id").notNull(),
  groupId: integer("group_id").notNull(),
  totalChaptersRead: integer("total_chapters_read").default(0),
  joinedAt: timestamp("joined_at").notNull().defaultNow(),
});

// Churches
export const churches = pgTable("churches", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  governorate: text("governorate").notNull(),
  adminName: text("admin_name").notNull(),
  adminPhone: text("admin_phone").notNull(),
  notes: text("notes"),
  status: text("status").notNull().default("pending"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const churchAdmins = pgTable("church_admins", {
  id: serial("id").primaryKey(),
  churchId: integer("church_id").notNull(),
  phone: text("phone").notNull(),
  name: text("name").notNull(),
  role: text("role").notNull().default('admin'), // 'admin' | 'servant'
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

// Zod schemas
export const insertUserSchema = createInsertSchema(users).omit({ id: true, createdAt: true });
export const selectUserSchema = createSelectSchema(users);

export const insertBibleBookSchema = createInsertSchema(bibleBooks).omit({ id: true });
export const selectBibleBookSchema = createSelectSchema(bibleBooks);

export const insertBibleVerseSchema = createInsertSchema(bibleVerses).omit({ id: true });
export const selectBibleVerseSchema = createSelectSchema(bibleVerses);

export const insertDailyVerseSchema = createInsertSchema(dailyVerses).omit({ id: true, createdAt: true });
export const selectDailyVerseSchema = createSelectSchema(dailyVerses);

export const insertReadingPlanSchema = createInsertSchema(readingPlans).omit({ id: true });
export const selectReadingPlanSchema = createSelectSchema(readingPlans);

export const insertUserReadingProgressSchema = createInsertSchema(userReadingProgress).omit({ id: true, startedAt: true });
export const selectUserReadingProgressSchema = createSelectSchema(userReadingProgress);

export const insertHighlightedVerseSchema = createInsertSchema(highlightedVerses).omit({ id: true, createdAt: true });
export const selectHighlightedVerseSchema = createSelectSchema(highlightedVerses);

export const insertEmotionSchema = createInsertSchema(emotions).omit({ id: true });
export const selectEmotionSchema = createSelectSchema(emotions);

export const insertTopicSchema = createInsertSchema(topics).omit({ id: true });
export const selectTopicSchema = createSelectSchema(topics);

export const insertEmotionVerseSchema = createInsertSchema(emotionVerses).omit({ id: true });
export const selectEmotionVerseSchema = createSelectSchema(emotionVerses);

export const insertTopicVerseSchema = createInsertSchema(topicVerses).omit({ id: true });
export const selectTopicVerseSchema = createSelectSchema(topicVerses);

export const insertChildStorySchema = createInsertSchema(childStories).omit({ id: true });
export const selectChildStorySchema = createSelectSchema(childStories);

export const insertAiEmotionVerseSchema = createInsertSchema(aiEmotionVerses).omit({ id: true, createdAt: true, updatedAt: true });
export const selectAiEmotionVerseSchema = createSelectSchema(aiEmotionVerses);

export const insertAiEmotionsSchema = createInsertSchema(aiEmotions).omit({ id: true, createdAt: true, updatedAt: true });
export const selectAiEmotionsSchema = createSelectSchema(aiEmotions);

export const insertAiEmotionExampleSchema = createInsertSchema(aiEmotionExamples).omit({ id: true, createdAt: true });
export const selectAiEmotionExampleSchema = createSelectSchema(aiEmotionExamples);

export const insertAiUsageLogSchema = createInsertSchema(aiUsageLog).omit({ id: true, createdAt: true });
export const selectAiUsageLogSchema = createSelectSchema(aiUsageLog);

export const insertAiUserPhraseSchema = createInsertSchema(aiUserPhrases).omit({ id: true, createdAt: true });
export const selectAiUserPhraseSchema = createSelectSchema(aiUserPhrases);

export const insertCalendarDailyVerseSchema = createInsertSchema(calendarDailyVerses).omit({ id: true });
export const selectCalendarDailyVerseSchema = createSelectSchema(calendarDailyVerses);

// TypeScript types
export type User = typeof users.$inferSelect;
export type InsertUser = z.infer<typeof insertUserSchema>;

export type BibleBook = typeof bibleBooks.$inferSelect;
export type InsertBibleBook = z.infer<typeof insertBibleBookSchema>;

export type BibleVerse = typeof bibleVerses.$inferSelect;
export type InsertBibleVerse = z.infer<typeof insertBibleVerseSchema>;

export type DailyVerse = typeof dailyVerses.$inferSelect;
export type InsertDailyVerse = z.infer<typeof insertDailyVerseSchema>;

export type ReadingPlan = typeof readingPlans.$inferSelect;
export type InsertReadingPlan = z.infer<typeof insertReadingPlanSchema>;

export type UserReadingProgress = typeof userReadingProgress.$inferSelect;
export type InsertUserReadingProgress = z.infer<typeof insertUserReadingProgressSchema>;

export type HighlightedVerse = typeof highlightedVerses.$inferSelect;
export type InsertHighlightedVerse = z.infer<typeof insertHighlightedVerseSchema>;

export type Emotion = typeof emotions.$inferSelect;
export type InsertEmotion = z.infer<typeof insertEmotionSchema>;

export type Topic = typeof topics.$inferSelect;
export type InsertTopic = z.infer<typeof insertTopicSchema>;

export type EmotionVerse = typeof emotionVerses.$inferSelect;
export type InsertEmotionVerse = z.infer<typeof insertEmotionVerseSchema>;

export type TopicVerse = typeof topicVerses.$inferSelect;
export type InsertTopicVerse = z.infer<typeof insertTopicVerseSchema>;

export type ChildStory = typeof childStories.$inferSelect;
export type InsertChildStory = z.infer<typeof insertChildStorySchema>;

export type AiEmotionVerse = typeof aiEmotionVerses.$inferSelect;
export type InsertAiEmotionVerse = z.infer<typeof insertAiEmotionVerseSchema>;

export type AiEmotion = typeof aiEmotions.$inferSelect;
export type InsertAiEmotion = z.infer<typeof insertAiEmotionsSchema>;

export type AiEmotionExample = typeof aiEmotionExamples.$inferSelect;
export type InsertAiEmotionExample = z.infer<typeof insertAiEmotionExampleSchema>;

export type AiUsageLog = typeof aiUsageLog.$inferSelect;
export type InsertAiUsageLog = z.infer<typeof insertAiUsageLogSchema>;

export type AiUserPhrase = typeof aiUserPhrases.$inferSelect;
export type InsertAiUserPhrase = z.infer<typeof insertAiUserPhraseSchema>;

export type CalendarDailyVerse = typeof calendarDailyVerses.$inferSelect;
export type InsertCalendarDailyVerse = z.infer<typeof insertCalendarDailyVerseSchema>;

export const insertReadingGroupSchema = createInsertSchema(readingGroups).omit({ id: true, createdAt: true });
export const insertGroupMemberSchema = createInsertSchema(groupMembers).omit({ id: true, joinedAt: true });
export const insertGroupReadingLogSchema = createInsertSchema(groupReadingLogs).omit({ id: true, createdAt: true });
export const insertGroupMessageSchema = createInsertSchema(groupMessages).omit({ id: true, createdAt: true, isPinned: true });

export type ReadingGroup = typeof readingGroups.$inferSelect;
export type InsertReadingGroup = z.infer<typeof insertReadingGroupSchema>;
export type GroupMember = typeof groupMembers.$inferSelect;
export type InsertGroupMember = z.infer<typeof insertGroupMemberSchema>;
export type GroupReadingLog = typeof groupReadingLogs.$inferSelect;
export type InsertGroupReadingLog = z.infer<typeof insertGroupReadingLogSchema>;
export type GroupMessage = typeof groupMessages.$inferSelect;
export type InsertGroupMessage = z.infer<typeof insertGroupMessageSchema>;

export const insertGroupMissionSchema = createInsertSchema(groupMissions).omit({ id: true, createdAt: true });
export type GroupMission = typeof groupMissions.$inferSelect;
export type InsertGroupMission = z.infer<typeof insertGroupMissionSchema>;

export const insertChurchSchema = createInsertSchema(churches).omit({ id: true, createdAt: true, status: true });
export const insertChurchAdminSchema = createInsertSchema(churchAdmins).omit({ id: true, createdAt: true });
export type Church = typeof churches.$inferSelect;
export type InsertChurch = z.infer<typeof insertChurchSchema>;
export type ChurchAdmin = typeof churchAdmins.$inferSelect;
export type InsertChurchAdmin = z.infer<typeof insertChurchAdminSchema>;

export const groupJoinRequests = pgTable("group_join_requests", {
  id: serial("id").primaryKey(),
  groupId: integer("group_id").notNull(),
  userName: text("user_name").notNull(),
  phone: text("phone"),
  status: text("status").notNull().default("pending"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const insertGroupJoinRequestSchema = createInsertSchema(groupJoinRequests).omit({ id: true, createdAt: true });
export type GroupJoinRequest = typeof groupJoinRequests.$inferSelect;
export type InsertGroupJoinRequest = z.infer<typeof insertGroupJoinRequestSchema>;

export const groupAssignments = pgTable("group_assignments", {
  id: serial("id").primaryKey(),
  groupId: integer("group_id").notNull(),
  type: text("type").notNull(),
  title: text("title"),
  bookName: text("book_name").notNull(),
  chapters: jsonb("chapters").notNull(),
  assignedBy: text("assigned_by").notNull(),
  assignedDate: text("assigned_date").notNull(),
  deadline: text("deadline"),
  isActive: boolean("is_active").default(true),
  createdAt: timestamp("created_at").notNull().defaultNow(),
}, (t) => ({
  gaGroupIdx: index("idx_group_assignments_group_id").on(t.groupId),
}));

export const assignmentReadings = pgTable("assignment_readings", {
  id: serial("id").primaryKey(),
  assignmentId: integer("assignment_id").notNull(),
  groupId: integer("group_id").notNull(),
  userName: text("user_name").notNull(),
  bookName: text("book_name").notNull(),
  chapter: integer("chapter").notNull(),
  timeSpent: integer("time_spent").default(0),
  scrollCount: integer("scroll_count").default(0),
  scrollDepth: integer("scroll_depth").default(0),
  completed: boolean("completed").default(false),
  openedAt: timestamp("opened_at"),
  completedAt: timestamp("completed_at"),
  completedDate: text("completed_date"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
}, (t) => ({
  arGroupIdx: index("idx_assignment_readings_group_id").on(t.groupId),
  arAssignmentUserIdx: index("idx_assignment_readings_assignment_user").on(t.assignmentId, t.userName),
}));

export const insertGroupAssignmentSchema = createInsertSchema(groupAssignments).omit({ id: true, createdAt: true });
export const insertAssignmentReadingSchema = createInsertSchema(assignmentReadings).omit({ id: true, createdAt: true });
export type GroupAssignment = typeof groupAssignments.$inferSelect;
export type InsertGroupAssignment = z.infer<typeof insertGroupAssignmentSchema>;
export type AssignmentReading = typeof assignmentReadings.$inferSelect;
export type InsertAssignmentReading = z.infer<typeof insertAssignmentReadingSchema>;

export const insertChurchChallengeSchema = createInsertSchema(churchChallenges).omit({ id: true, createdAt: true });
export const insertChallengeParticipantSchema = createInsertSchema(challengeParticipants).omit({ id: true, joinedAt: true });
export type ChurchChallenge = typeof churchChallenges.$inferSelect;
export type InsertChurchChallenge = z.infer<typeof insertChurchChallengeSchema>;
export type ChallengeParticipant = typeof challengeParticipants.$inferSelect;
export type InsertChallengeParticipant = z.infer<typeof insertChallengeParticipantSchema>;

// SEO Auto-Generated Topic Pages
export const seoTopics = pgTable("seo_topics", {
  id: serial("id").primaryKey(),
  title: text("title").notNull(),
  slug: text("slug").notNull(),
  keywords: text("keywords").array().notNull().default(sql`'{}'::text[]`),
  visitCount: integer("visit_count").notNull().default(0),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const insertSeoTopicSchema = createInsertSchema(seoTopics).omit({ id: true, createdAt: true, updatedAt: true, visitCount: true });
export type SeoTopic = typeof seoTopics.$inferSelect;
export type InsertSeoTopic = z.infer<typeof insertSeoTopicSchema>;

// ── Behavioral SEO: raw per-session metrics ──────────────────────────────────
export const pageMetrics = pgTable("page_metrics", {
  id: serial("id").primaryKey(),
  pageUrl: text("page_url").notNull(),
  sessionId: text("session_id").notNull(),
  timeSpent: integer("time_spent").notNull().default(0),      // seconds
  scrollPercent: integer("scroll_percent").notNull().default(0), // 0-100
  verseClicks: integer("verse_clicks").notNull().default(0),
  videoClicks: integer("video_clicks").notNull().default(0),
  shareClicks: integer("share_clicks").notNull().default(0),
  timestamp: timestamp("timestamp").notNull().defaultNow(),
}, (t) => ({
  pageUrlIdx: index("page_metrics_url_idx").on(t.pageUrl),
  tsIdx: index("page_metrics_ts_idx").on(t.timestamp),
}));

export const insertPageMetricSchema = createInsertSchema(pageMetrics).omit({ id: true, timestamp: true });
export type PageMetric = typeof pageMetrics.$inferSelect;
export type InsertPageMetric = z.infer<typeof insertPageMetricSchema>;

// ── Behavioral SEO: aggregated score per page ─────────────────────────────────
export const pageScores = pgTable("page_scores", {
  pageUrl: text("page_url").primaryKey(),
  score: integer("score").notNull().default(0),
  totalSessions: integer("total_sessions").notNull().default(0),
  avgTimeSpent: integer("avg_time_spent").notNull().default(0),
  avgScrollPercent: integer("avg_scroll_percent").notNull().default(0),
  totalClicks: integer("total_clicks").notNull().default(0),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export type PageScore = typeof pageScores.$inferSelect;

// ── Exit Intelligence: raw exit events ───────────────────────────────────────
export const exitEvents = pgTable("exit_events", {
  id: serial("id").primaryKey(),
  pageUrl: text("page_url").notNull(),
  timeSpent: integer("time_spent").notNull().default(0),      // seconds
  scrollDepth: integer("scroll_depth").notNull().default(0),  // 0-100
  lastClickedElement: text("last_clicked_element"),           // e.g. "verse", "video", "share", null
  exitReason: text("exit_reason").notNull(),                  // weak_intro | boring_content | missing_target | normal_exit
  exitTimestamp: timestamp("exit_timestamp").notNull().defaultNow(),
}, (t) => ({
  pageUrlIdx: index("exit_events_url_idx").on(t.pageUrl),
  tsIdx: index("exit_events_ts_idx").on(t.exitTimestamp),
}));

export const insertExitEventSchema = createInsertSchema(exitEvents).omit({ id: true, exitTimestamp: true });
export type ExitEvent = typeof exitEvents.$inferSelect;
export type InsertExitEvent = z.infer<typeof insertExitEventSchema>;

// ── Exit Intelligence: aggregated issues per page ────────────────────────────
export const pageIssues = pgTable("page_issues", {
  id: serial("id").primaryKey(),
  pageUrl: text("page_url").notNull(),
  issueType: text("issue_type").notNull(),   // weak_intro | boring_content | missing_target
  count: integer("count").notNull().default(1),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
}, (t) => ({
  pageIssueUniq: uniqueIndex("page_issues_url_type_idx").on(t.pageUrl, t.issueType),
}));

export type PageIssue = typeof pageIssues.$inferSelect;

// SEO Engagement Tracking
export const pageEngagement = pgTable("page_engagement", {
  id: serial("id").primaryKey(),
  sessionId: text("session_id").notNull(),
  page: text("page").notNull(),
  query: text("query"),
  scrollDepth: integer("scroll_depth").notNull().default(0),
  timeOnPage: integer("time_on_page").notNull().default(0),
  verseClicks: integer("verse_clicks").notNull().default(0),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const insertPageEngagementSchema = createInsertSchema(pageEngagement).omit({ id: true, createdAt: true });
export type PageEngagement = typeof pageEngagement.$inferSelect;
export type InsertPageEngagement = z.infer<typeof insertPageEngagementSchema>;

// Web Push Subscriptions
export const pushSubscriptions = pgTable("push_subscriptions", {
  id: serial("id").primaryKey(),
  endpoint: text("endpoint").notNull().unique(),
  p256dh: text("p256dh").notNull(),
  auth: text("auth").notNull(),
  createdAt: timestamp("created_at").defaultNow(),
});

export type PushSubscription = typeof pushSubscriptions.$inferSelect;

// Group-level push subscriptions for chat notifications
export const groupPushSubscriptions = pgTable('group_push_subscriptions', {
  id: serial('id').primaryKey(),
  groupId: integer('group_id').notNull(),
  groupCode: text('group_code').notNull(),
  userName: text('user_name').notNull(),
  memberKey: text('member_key').notNull(),
  endpoint: text('endpoint').notNull(),
  p256dh: text('p256dh').notNull(),
  auth: text('auth').notNull(),
  createdAt: timestamp('created_at').defaultNow(),
  updatedAt: timestamp('updated_at').defaultNow(),
}, t => ({ uniq: uniqueIndex('gps_group_endpoint_idx').on(t.groupId, t.endpoint) }));

// App-level key/value settings (e.g. last_daily_notif_date)
export const appSettings = pgTable("app_settings", {
  key: text("key").primaryKey(),
  value: text("value").notNull(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

// ─── طبقة مزامنة بيانات المستخدم (شفافة) ──────────────────────────────────────
// كل الجداول: userId مطلوب (يوجد صف users لكل زائر)، memberKey اختياري لاسترجاع
// أعضاء المجموعة من جهاز آخر. كل الأعمدة nullable/آمنة لـ db:push.

// الآيات المحفوظة + المظلّلة (المعتمدة على المرجع النصي) — من saved-verses.ts
export const savedVerses = pgTable("saved_verses", {
  id: serial("id").primaryKey(),
  userId: varchar("user_id").notNull().references(() => users.id, { onDelete: 'cascade' }),
  memberKey: text("member_key"),
  verseRef: text("verse_ref").notNull(),
  verseText: text("verse_text"),
  kind: text("kind").notNull().default("saved"), // 'saved' | 'highlight'
  color: text("color"),                          // للمظلّلة فقط
  createdAt: timestamp("created_at").notNull().defaultNow(),
}, (t) => ({
  svUniq: uniqueIndex("saved_verses_uniq").on(t.userId, t.verseRef, t.kind),
  svMemberIdx: index("saved_verses_member_idx").on(t.memberKey),
}));

// آيات الحفظ (للأطفال) — من Kids.tsx memorized-verses
export const memorizedVerses = pgTable("memorized_verses", {
  id: serial("id").primaryKey(),
  userId: varchar("user_id").notNull().references(() => users.id, { onDelete: 'cascade' }),
  memberKey: text("member_key"),
  verseRef: text("verse_ref").notNull(),
  createdAt: timestamp("created_at").notNull().defaultNow(),
}, (t) => ({
  mvUniq: uniqueIndex("memorized_verses_uniq").on(t.userId, t.verseRef),
  mvMemberIdx: index("memorized_verses_member_idx").on(t.memberKey),
}));

// الترانيم المفضّلة — من Kids.tsx favorite-hymns
export const favoriteHymns = pgTable("favorite_hymns", {
  id: serial("id").primaryKey(),
  userId: varchar("user_id").notNull().references(() => users.id, { onDelete: 'cascade' }),
  memberKey: text("member_key"),
  hymnId: text("hymn_id").notNull(),
  title: text("title"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
}, (t) => ({
  fhUniq: uniqueIndex("favorite_hymns_uniq").on(t.userId, t.hymnId),
  fhMemberIdx: index("favorite_hymns_member_idx").on(t.memberKey),
}));

// قراءاتي اليومية المخصّصة — من Plans.tsx my-daily-readings (JSON كامل)
export const userDailyReadings = pgTable("user_daily_readings", {
  id: serial("id").primaryKey(),
  userId: varchar("user_id").notNull().references(() => users.id, { onDelete: 'cascade' }).unique(),
  memberKey: text("member_key"),
  data: jsonb("data").notNull().default([]),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
}, (t) => ({
  udrMemberIdx: index("udr_member_idx").on(t.memberKey),
}));

// تقدّم خطط القراءة — JSON كامل (planId في الواجهة نصّي، ليس FK) — من reading-plan-progress
export const userPlanProgress = pgTable("user_plan_progress", {
  id: serial("id").primaryKey(),
  userId: varchar("user_id").notNull().references(() => users.id, { onDelete: 'cascade' }).unique(),
  memberKey: text("member_key"),
  data: jsonb("data").notNull().default([]),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
}, (t) => ({
  uppMemberIdx: index("upp_member_idx").on(t.memberKey),
}));

export type SavedVerseRow = typeof savedVerses.$inferSelect;
export type MemorizedVerseRow = typeof memorizedVerses.$inferSelect;
export type FavoriteHymnRow = typeof favoriteHymns.$inferSelect;
export type UserDailyReadingsRow = typeof userDailyReadings.$inferSelect;
export type UserPlanProgressRow = typeof userPlanProgress.$inferSelect;

// ─── كاش ردود Groq (مشترك بين كل المستخدمين) ─────────────────────────────────
export const aiResponseCache = pgTable("ai_response_cache", {
  id: serial("id").primaryKey(),
  kind: text("kind").notNull(),        // اسم الـendpoint، مثلاً 'service/outline'
  ckey: text("ckey").notNull(),        // SHA-256 لِـ (kind + المدخل المطبَّع + الموديل)
  response: jsonb("response").notNull(),
  hits: integer("hits").notNull().default(0),
  createdAt: timestamp("created_at").notNull().defaultNow(),
}, (t) => ({
  aiCacheUniq: uniqueIndex("ai_response_cache_uniq").on(t.kind, t.ckey),
}));

export type AiResponseCacheRow = typeof aiResponseCache.$inferSelect;
