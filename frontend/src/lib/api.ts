import axios from 'axios';
import type { SkillReport, BrowseProfile } from '../types';

const BASE = import.meta.env.VITE_BACKEND_URL || 'http://localhost:3001';

if (import.meta.env.PROD && BASE.includes('localhost')) {
  console.error(
    '[api] VITE_BACKEND_URL points to localhost in a production build — all API calls will fail. ' +
    'Set VITE_BACKEND_URL in your Vercel environment variables and redeploy.'
  );
}

// Single axios instance keeps base URL and interceptors (if added later) centralized.
const api = axios.create({ baseURL: BASE });

export async function uploadResume(
  file: File,
  priceUnits: number
): Promise<{ skillReport: SkillReport; cid: string; hash: string }> {
  const form = new FormData();
  form.append('file', file);
  // Price is now stored as USDC micro-units (1_000_000 = 1 USDC) in the proof PDA
  form.append('priceLamports', String(priceUnits));
  const { data } = await api.post('/api/upload', form);
  return data;
}

export async function uploadGithub(
  username: string,
  priceUnits: number
): Promise<{ skillReport: SkillReport; cid: string; hash: string }> {
  const { data } = await api.post('/api/upload', { githubUsername: username, priceLamports: priceUnits });
  return data;
}

export async function registerProof(
  walletAddress: string,
  cid: string,
  txSignature: string,
  nonce: number
): Promise<{ success: boolean }> {
  const { data } = await api.post('/api/register', { walletAddress, cid, txSignature, nonce });
  return data;
}

export async function getProfile(walletAddress: string): Promise<{
  hash: string;
  price: number;
  cid: string;
  nonce: number;
  skillReport: SkillReport;
}> {
  // Profile response mixes chain state (hash/price) with teaser data from IPFS.
  const { data } = await api.get(`/api/profile/${walletAddress}`);
  return data;
}

// ─── MagicBlock Private Unlock ───────────────────────────────────────────────

export interface BuildUnlockTxResponse {
  transactionBase64: string;
  sendTo: 'base' | 'ephemeral';
  recentBlockhash: string;
  lastValidBlockHeight: number;
  amountUnits: number;
  mint: string;
  decimals: number;
}

/**
 * Step 1 of the private unlock flow:
 * Backend calls MagicBlock Private Payments API and returns an unsigned SPL transfer tx.
 */
export async function buildUnlockTx(
  viewerWallet: string,
  ownerWallet: string
): Promise<BuildUnlockTxResponse> {
  const { data } = await api.post('/api/unlock/build-tx', { viewerWallet, ownerWallet });
  return data;
}

/**
 * Step 3 of the private unlock flow:
 * Backend verifies the signed + submitted tx and returns a CID-scoped JWT.
 */
export async function verifyUnlock(
  txSignature: string,
  viewerWallet: string,
  ownerWallet: string,
  sendTo: 'base' | 'ephemeral',
  amountUnits: number
): Promise<{ token: string }> {
  const { data } = await api.post('/api/unlock/verify', {
    txSignature,
    viewerWallet,
    ownerWallet,
    sendTo,
    amountUnits,
  });
  return data;
}

export async function fetchReport(cid: string, token: string): Promise<SkillReport> {
  // JWT is CID-scoped by backend and required for full report retrieval.
  const { data } = await api.get(`/api/report/${cid}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  return data;
}

export async function getBrowseProfiles(): Promise<BrowseProfile[]> {
  const { data } = await api.get('/api/profiles');
  return data;
}

export async function searchProfiles(query: string): Promise<Array<BrowseProfile & { score: number }>> {
  const { data } = await api.get('/api/search', { params: { q: query, limit: 20 } });
  return data;
}

export async function getSupportedLanguages(): Promise<{
  languages: Record<string, string>;
  qvacAvailable: boolean;
}> {
  const { data } = await api.get('/api/translate/languages');
  return data;
}

export async function translateSummary(
  text: string,
  targetLang: string
): Promise<{ translated: string; usedQVAC: boolean }> {
  const { data } = await api.post('/api/translate', { text, targetLang });
  return data;
}
