const { Pool } = require('pg');
const pool = new Pool({
  connectionString: "postgresql://postgres.iffwlbdijphhlkatlsif:hqnr2y6sCUwzzCkM@aws-1-us-east-1.pooler.supabase.com:6543/postgres",
  ssl: { rejectUnauthorized: false }
});

async function run() {
  // Verify table exists
  const exists = await pool.query(`
    SELECT EXISTS (
      SELECT FROM information_schema.tables 
      WHERE table_name = 'proofs-private'
    ) AS exists;
  `);
  console.log('Table exists:', exists.rows[0].exists);

  // Test insert
  await pool.query(`
    INSERT INTO "proofs-private" (wallet, cid, nonce) 
    VALUES ('test-wallet', 'test-cid', 999999999)
    ON CONFLICT (wallet, nonce) DO NOTHING
  `);
  console.log('Insert OK');

  // Test select
  const sel = await pool.query(`SELECT * FROM "proofs-private" LIMIT 5`);
  console.log('Rows:', sel.rows);

  // Clean up test row
  await pool.query(`DELETE FROM "proofs-private" WHERE wallet = 'test-wallet'`);
  console.log('Cleanup OK');
  
  process.exit(0);
}
run().catch(e => { console.error(e.message); process.exit(1); });
