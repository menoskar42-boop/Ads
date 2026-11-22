import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  createEmotionMappings,
  createTopicMappings,
  type ImportedVerse,
} from './import-bible';
import { DatabaseStorage } from './storage';
import * as schema from '../shared/schema';
import type { EmotionVerse, TopicVerse } from '../shared/schema';

type ImportDatabase = NonNullable<Parameters<typeof createEmotionMappings>[1]>;
type StorageDatabase = NonNullable<ConstructorParameters<typeof DatabaseStorage>[0]>;

describe('emotion and topic verse mappings', () => {
  it('stores complete verse fields during the import mapping path', async () => {
    const inserts: Record<string, unknown>[] = [];
    const emotionVerse: ImportedVerse = {
      id: 101,
      bookName: 'المزامير',
      chapter: 34,
      verse: 18,
      text: 'قَرِيبٌ هُوَ الرَّبُّ مِنَ الْمُنْكَسِرِي الْقُلُوبِ.',
    };
    const topicVerse: ImportedVerse = {
      id: 102,
      bookName: 'كولوسي',
      chapter: 3,
      verse: 23,
      text: 'وَكُلُّ مَا فَعَلْتُمْ فَاعْمَلُوا مِنَ الْقَلْبِ كَمَا لِلرَّبِّ.',
    };
    const fakeDatabase = {
      select: () => ({
        from: async (table: unknown) => (
          table === schema.emotions
            ? [{ id: 1, name: 'حزن' }]
            : [{ id: 2, name: 'العمل' }]
        ),
      }),
      insert: () => ({
        values: async (payload: Record<string, unknown>) => {
          inserts.push(payload);
        },
      }),
    } as unknown as ImportDatabase;

    await createEmotionMappings(new Map([['19:34:18', emotionVerse]]), fakeDatabase);
    await createTopicMappings(new Map([['51:3:23', topicVerse]]), fakeDatabase);

    assert.deepEqual(inserts, [
      {
        emotionId: 1,
        bookName: 'المزامير',
        chapter: 34,
        verse: 18,
        verseText: emotionVerse.text,
      },
      {
        topicId: 2,
        bookName: 'كولوسي',
        chapter: 3,
        verse: 23,
        verseText: topicVerse.text,
      },
    ]);
    assert.equal('verseId' in inserts[0], false);
    assert.equal('verseId' in inserts[1], false);
    assert.equal('verseId' in schema.emotionVerses, false);
    assert.equal('verseId' in schema.topicVerses, false);
  });

  it('returns complete stored fields when reading emotion and topic verses', async () => {
    const savedEmotion: EmotionVerse = {
      id: 1,
      emotionId: 1,
      bookName: 'المزامير',
      chapter: 34,
      verse: 18,
      verseText: 'قَرِيبٌ هُوَ الرَّبُّ مِنَ الْمُنْكَسِرِي الْقُلُوبِ.',
    };
    const savedTopic: TopicVerse = {
      id: 2,
      topicId: 2,
      bookName: 'كولوسي',
      chapter: 3,
      verse: 23,
      verseText: 'وَكُلُّ مَا فَعَلْتُمْ فَاعْمَلُوا مِنَ الْقَلْبِ كَمَا لِلرَّبِّ.',
    };
    const fakeDatabase = {
      select: () => ({
        from: (table: unknown) => ({
          where: async () => table === schema.emotionVerses ? [savedEmotion] : [savedTopic],
        }),
      }),
    } as unknown as StorageDatabase;
    const storage = new DatabaseStorage(fakeDatabase);

    assert.deepEqual(await storage.getVersesByEmotion(1), [savedEmotion]);
    assert.deepEqual(await storage.getVersesByTopic(2), [savedTopic]);
  });
});