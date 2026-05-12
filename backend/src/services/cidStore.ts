import { getPool } from "./db";

// Table name for this project (private-fork; old 'proofs' table is left untouched)
// Use explicit public schema prefix — Supabase pooler may override search_path
const TABLE = 'public."proofs-private"';

interface ProofEntry {
  cid: string;
  nonce: number;
}

export async function addProof(wallet: string, cid: string, nonce: number): Promise<void> {
  await getPool().query(
    `INSERT INTO ${TABLE} (wallet, cid, nonce) VALUES ($1, $2, $3)
     ON CONFLICT (wallet, nonce) DO NOTHING`,
    [wallet, cid, nonce]
  );
}

export async function getLatestProof(wallet: string): Promise<ProofEntry | undefined> {
  const result = await getPool().query<ProofEntry>(
    `SELECT cid, nonce FROM ${TABLE} WHERE LOWER(wallet) = LOWER($1) ORDER BY nonce DESC LIMIT 1`,
    [wallet]
  );
  return result.rows[0];
}

export async function getAllProofs(wallet: string): Promise<ProofEntry[]> {
  const result = await getPool().query<ProofEntry>(
    `SELECT cid, nonce FROM ${TABLE} WHERE LOWER(wallet) = LOWER($1) ORDER BY nonce DESC`,
    [wallet]
  );
  return result.rows;
}

export async function getAllProofsByWallet(): Promise<{ wallet: string; cid: string; nonce: number }[]> {
  // Returns all proofs grouped by wallet (newest first per wallet) so callers can
  // walk through nonces until they find one whose on-chain account still exists.
  const result = await getPool().query<{ wallet: string; cid: string; nonce: number }>(
    `SELECT wallet, cid, nonce
     FROM ${TABLE}
     ORDER BY wallet, nonce DESC
     LIMIT 500`
  );
  return result.rows;
}
