const { Client } = require('pg');

const client = new Client({
  connectionString: 'postgres://postgres:dgEicQDx6d91xrIi@db.yxmkrssxcazohhoijzbs.supabase.co:5432/postgres?sslmode=require',
  ssl: { rejectUnauthorized: false }
});

async function testConnection() {
  try {
    await client.connect();
    const res = await client.query('SELECT NOW(), version()');
    console.log('✅ Database connection successful!');
    console.log('Time:', res.rows[0].now);
    console.log('Version:', res.rows[0].version);
    await client.end();
  } catch (err) {
    console.error('❌ Connection failed:', err.message);
  }
}

testConnection();