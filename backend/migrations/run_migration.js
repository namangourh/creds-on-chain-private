const { Pool } = require('pg');

const connStr = "postgresql://postgres.iffwlbdijphhlkatlsif:hqnr2y6sCUwzzCkM@aws-1-us-east-1.pooler.supabase.com:6543/postgres";
const pool = new Pool({ connectionString: connStr, ssl: { rejectUnauthorized: false } });

const sql = `
CREATE TABLE IF NOT EXISTS "proofs-private" (
  id        BIGSERIAL PRIMARY KEY,
  wallet    TEXT        NOT NULL,
  cid       TEXT        NOT NULL,
  nonce     BIGINT      NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_proofs_private_wallet
  ON "proofs-private" (LOWER(wallet));

CREATE INDEX IF NOT EXISTS idx_proofs_private_wallet_nonce
  ON "proofs-private" (LOWER(wallet), nonce DESC);

ALTER TABLE "proofs-private"
  ADD CONSTRAINT proofs_private_wallet_nonce_unique
  UNIQUE (wallet, nonce);

GRANT ALL ON "proofs-private" TO postgres, anon, authenticated, service_role;
GRANT ALL ON SEQUENCE "proofs-private_id_seq" TO postgres, anon, authenticated, service_role;
`;

pool.query(sql)
  .then(() => { console.log('✅ Migration complete — proofs-private table created.'); process.exit(0); })
  .catch(e => { console.error('❌ Migration error:', e.message); process.exit(1); });
