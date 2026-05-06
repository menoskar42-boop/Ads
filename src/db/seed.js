require('dotenv').config();
const { Pool } = require('pg');

const pool = new Pool({ connectionString: process.env.DATABASE_URL });

async function seed() {
  const client = await pool.connect();
  try {
    await client.query(`
      INSERT INTO companies (slug, company_name, description, theme_color)
      VALUES
        ('petra', 'Petra Company', 'Petra Company is a leading provider of innovative solutions in the Middle East, dedicated to excellence and growth.', '#c2410c'),
        ('delta', 'Delta Company', 'Delta Company delivers cutting-edge technology products and services to businesses across the region.', '#2563eb')
      ON CONFLICT (slug) DO NOTHING;
    `);
    console.log('Seed data inserted successfully.');
  } finally {
    client.release();
    await pool.end();
  }
}

seed().catch(err => {
  console.error('Seed failed:', err);
  process.exit(1);
});
