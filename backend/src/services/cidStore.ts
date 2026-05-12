import { getPool } from "./db";

interface ProofEntry {
  cid: string;
  nonce: number;
}

export async function addProof(wallet: string, cid: string, nonce: number): Promise<void> {
  await getPool().query(
    "INSERT INTO proofs (wallet, cid, nonce) VALUES ($1, $2, $3)",
    [wallet, cid, nonce]
  );
}

export async function getLatestProof(wallet: string): Promise<ProofEntry | undefined> {
  const result = await getPool().query<ProofEntry>(
    "SELECT cid, nonce FROM proofs WHERE LOWER(wallet) = LOWER($1) ORDER BY nonce DESC LIMIT 1",
    [wallet]
  );
  return result.rows[0];
}

export async function getAllProofs(wallet: string): Promise<ProofEntry[]> {
  const result = await getPool().query<ProofEntry>(
    "SELECT cid, nonce FROM proofs WHERE LOWER(wallet) = LOWER($1) ORDER BY nonce DESC",
    [wallet]
  );
  return result.rows;
}

export async function getAllProofsByWallet(): Promise<{ wallet: string; cid: string; nonce: number }[]> {
  // Returns all proofs grouped by wallet (newest first per wallet) so callers can
  // walk through nonces until they find one whose on-chain account still exists.
  const result = await getPool().query<{ wallet: string; cid: string; nonce: number }>(
    `SELECT wallet, cid, nonce
     FROM proofs
     ORDER BY wallet, nonce DESC
     LIMIT 500`
  );
  return result.rows;
}
