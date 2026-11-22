import fs from 'fs';
import { db } from '../server/db';
import { sql } from 'drizzle-orm';

async function importCSV() {
  const csv = fs.readFileSync('attached_assets/ai_emotions_1000_rows_1768372789393.csv', 'utf8');
  const lines = csv.split('\n').slice(1).filter(line => line.trim());
  
  let inserted = 0;
  for (const line of lines) {
    const parts = line.split(',');
    if (parts.length >= 6) {
      const core_emotion = parts[1].trim();
      const sub_emotion = parts[2].trim();
      const verse_text = parts[3].trim();
      const verse_reference = parts[4].trim();
      const tone = parts[5].trim() || 'تعزية';
      const active = parts[6]?.trim().toLowerCase() === 'true';
      
      try {
        await db.execute(sql`
          INSERT INTO ai_emotions (core_emotion, sub_emotion, verse_text, verse_reference, tone, active)
          VALUES (${core_emotion}, ${sub_emotion}, ${verse_text}, ${verse_reference}, ${tone}, ${active})
        `);
        inserted++;
      } catch (e: any) {
        console.error('Error inserting:', core_emotion, sub_emotion, e.message);
      }
    }
  }
  console.log('Inserted', inserted, 'rows');
  process.exit(0);
}

importCSV().catch(console.error);
