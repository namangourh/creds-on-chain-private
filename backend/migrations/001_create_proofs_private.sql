-- Migration: create proofs-private table
-- Run this in Supabase SQL Editor (Settings > SQL Editor > New query)
--
-- This is a fresh table for the creds-on-chain-private project.
-- It does NOT copy data from the old 'proofs' table — starts empty.

CREATE TABLE IF NOT EXISTS "proofs-private" (
  id        BIGSERIAL PRIMARY KEY,
  wallet    TEXT        NOT NULL,
  cid       TEXT        NOT NULL,
  nonce     BIGINT      NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Indexes matching query patterns in cidStore.ts
CREATE INDEX IF NOT EXISTS idx_proofs_private_wallet
  ON "proofs-private" (LOWER(wallet));

CREATE INDEX IF NOT EXISTS idx_proofs_private_wallet_nonce
  ON "proofs-private" (LOWER(wallet), nonce DESC);

-- Unique constraint: same wallet+nonce is idempotent (prevents double-register)
ALTER TABLE "proofs-private"
  ADD CONSTRAINT proofs_private_wallet_nonce_unique
  UNIQUE (wallet, nonce);

-- Grant access to the anon/service_role used by the pg connection string
-- (Supabase pooler authenticates via DATABASE_URL; row-level security not needed here)
GRANT ALL ON "proofs-private" TO postgres, anon, authenticated, service_role;
GRANT ALL ON SEQUENCE "proofs-private_id_seq" TO postgres, anon, authenticated, service_role;
