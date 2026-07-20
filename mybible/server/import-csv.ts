import fs from 'fs';
import readline from 'readline';
import { drizzle } from "drizzle-orm/node-postgres";
import pg from "pg";
import { aiEmotionExamples } from '@shared/schema';
import { sql } from 'drizzle-orm';

const { Pool } = pg;
const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const db = drizzle(pool);

const CSV_PATH = 'attached_assets/user_phrase_emotion_mapping_100k_1768325161846.csv';
const BATCH_SIZE = 400;

async function getExistingPhrases(): Promise<Set<string>> {
  const existing = await db.select({ phrase: aiEmotionExamples.userPhrase }).from(aiEmotionExamples);
  return new Set(existing.map((e: { phrase: string }) => e.phrase.trim()));
}

function parseCsvLine(line: string): { userPhrase: string; primaryEmotion: string; secondaryEmotions: string } | null {
  const parts: string[] = [];
  let current = '';
  let inQuotes = false;
  
  for (const char of line) {
    if (char === '"') {
      inQuotes = !inQuotes;
    } else if (char === ',' && !inQuotes) {
      parts.push(current.trim());
      current = '';
    } else {
      current += char;
    }
  }
  parts.push(current.trim());
  
  if (parts.length < 2) return null;
  
  const userPhrase = parts[0]?.replace(/^"|"$/g, '').trim();
  const primaryEmotion = parts[1]?.replace(/^"|"$/g, '').trim();
  const secondaryEmotions = parts[2]?.replace(/^"|"$/g, '').trim() || '';
  
  if (!userPhrase || !primaryEmotion) return null;
  
  return { userPhrase, primaryEmotion, secondaryEmotions };
}

async function importCsv() {
  console.log('Starting CSV import...');
  
  const existingPhrases = await getExistingPhrases();
  console.log(`Found ${existingPhrases.size} existing phrases in database`);
  
  const fileStream = fs.createReadStream(CSV_PATH, { encoding: 'utf8' });
  const rl = readline.createInterface({ input: fileStream, crlfDelay: Infinity });
  
  let batch: { userPhrase: string; primaryEmotion: string; secondaryEmotions: string | null }[] = [];
  let lineNum = 0;
  let inserted = 0;
  let skipped = 0;
  let duplicates = 0;
  
  for await (const line of rl) {
    lineNum++;
    
    if (lineNum === 1) continue;
    
    if (!line.trim()) {
      skipped++;
      continue;
    }
    
    const parsed = parseCsvLine(line);
    if (!parsed) {
      skipped++;
      continue;
    }
    
    if (existingPhrases.has(parsed.userPhrase)) {
      duplicates++;
      continue;
    }
    
    existingPhrases.add(parsed.userPhrase);
    
    batch.push({
      userPhrase: parsed.userPhrase,
      primaryEmotion: parsed.primaryEmotion,
      secondaryEmotions: parsed.secondaryEmotions || null,
    });
    
    if (batch.length >= BATCH_SIZE) {
      try {
        await db.insert(aiEmotionExamples).values(batch);
        inserted += batch.length;
        console.log(`Inserted batch: ${inserted} total rows (line ${lineNum})`);
      } catch (error) {
        console.error(`Error inserting batch at line ${lineNum}:`, error);
      }
      batch = [];
    }
  }
  
  if (batch.length > 0) {
    try {
      await db.insert(aiEmotionExamples).values(batch);
      inserted += batch.length;
      console.log(`Inserted final batch: ${inserted} total rows`);
    } catch (error) {
      console.error('Error inserting final batch:', error);
    }
  }
  
  console.log('\n=== Import Complete ===');
  console.log(`Total lines processed: ${lineNum}`);
  console.log(`Rows inserted: ${inserted}`);
  console.log(`Duplicates skipped: ${duplicates}`);
  console.log(`Invalid/empty lines skipped: ${skipped}`);
  
  const finalCount = await db.select({ count: sql<number>`count(*)` }).from(aiEmotionExamples);
  console.log(`Total rows in table: ${finalCount[0].count}`);
  
  process.exit(0);
}

importCsv().catch(err => {
  console.error('Import failed:', err);
  process.exit(1);
});
