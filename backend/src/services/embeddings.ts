import { SkillReport } from "../types";
import { getAllProofsByWallet } from "./cidStore";
import { fetchProofAccount } from "./solanaVerifier";
import { fetchReport } from "./ipfsClient";

// ─── In-memory vector store ───────────────────────────────────────────────────
// Maps wallet address → { vector, skillReport, cid, price }
// Populated at server startup and on every /api/register call.
// Search itself is pure in-memory cosine math — no DB or IPFS calls during query.

interface EmbeddedProfile {
  wallet: string;
  cid: string;
  price: number | null;
  skillReport: SkillReport;
  vector: number[];
}

const store = new Map<string, EmbeddedProfile>();

// Cache the global vocab so it isn't rebuilt on every search
let cachedVocab: string[] | null = null;
let vocabDirty = true;

// ─── QVAC Embeddings client ───────────────────────────────────────────────────
let embedder: any | null = null;
let embedderInitAttempted = false;

async function getEmbedder() {
  if (embedderInitAttempted) return embedder;
  embedderInitAttempted = true;
  try {
    const { Embedder } = await import("@qvac/embed-llamacpp");
    embedder = new Embedder({ model: "nomic-embed-text" });
    await embedder.init();
    console.log("[embeddings] QVAC embedder ready (local, on-device)");
  } catch (e: any) {
    console.warn(
      "[embeddings] QVAC embed package unavailable — falling back to TF-IDF cosine.",
      e?.message
    );
    embedder = null;
  }
  return embedder;
}

// ─── TF-IDF fallback ──────────────────────────────────────────────────────────

function buildVocab(texts: string[]): string[] {
  const set = new Set<string>();
  for (const t of texts) t.toLowerCase().split(/\W+/).forEach(w => w && set.add(w));
  return [...set];
}

function tfidfVector(text: string, vocab: string[]): number[] {
  const words = text.toLowerCase().split(/\W+/);
  return vocab.map(term => words.filter(w => w === term).length);
}

function dotProduct(a: number[], b: number[]): number {
  return a.reduce((s, v, i) => s + v * b[i], 0);
}

function magnitude(v: number[]): number {
  return Math.sqrt(v.reduce((s, x) => s + x * x, 0));
}

export function cosineSimilarity(a: number[], b: number[]): number {
  const mag = magnitude(a) * magnitude(b);
  return mag === 0 ? 0 : dotProduct(a, b) / mag;
}

/** Converts a SkillReport to a single text corpus for embedding. */
function reportToText(report: SkillReport): string {
  return `${report.skills.join(" ")} ${report.summary}`;
}

function getVocab(): string[] {
  if (!vocabDirty && cachedVocab) return cachedVocab;
  const allTexts = [...store.values()].map(p => reportToText(p.skillReport));
  cachedVocab = buildVocab(allTexts);
  vocabDirty = false;
  return cachedVocab;
}

async function embed(text: string): Promise<number[]> {
  const e = await getEmbedder();
  if (e) return e.embed(text) as Promise<number[]>;
  return tfidfVector(text, getVocab());
}

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Store (or update) a profile's embedding in the in-memory vector store.
 * Called from the upload/register pipeline and at server startup.
 */
export async function indexProfile(
  wallet: string,
  cid: string,
  price: number | null,
  skillReport: SkillReport
): Promise<void> {
  // Mark vocab dirty so it gets rebuilt to include the new profile
  vocabDirty = true;
  const vector = await embed(reportToText(skillReport));
  store.set(wallet, { wallet, cid, price, skillReport, vector });
  console.log(`[embeddings] Indexed profile for ${wallet.slice(0, 8)}…`);
}

/**
 * Semantic search: returns profiles ranked by cosine similarity.
 * Pure in-memory — no DB or IPFS calls. Fast even on free-tier hardware.
 */
export async function searchProfiles(
  query: string,
  topK = 10
): Promise<Array<{ wallet: string; cid: string; price: number | null; skillReport: SkillReport; score: number }>> {
  if (store.size === 0) return [];

  const queryVec = await embed(query);
  const e = await getEmbedder();

  // When using TF-IDF, re-embed stored profiles with the current vocab
  // (only after new profiles were added; otherwise use cached vectors)
  const results = [...store.values()].map(p => {
    const vec = e ? p.vector : tfidfVector(reportToText(p.skillReport), getVocab());
    const score = cosineSimilarity(queryVec, vec);
    return { wallet: p.wallet, cid: p.cid, price: p.price, skillReport: p.skillReport, score };
  });

  return results
    .sort((a, b) => b.score - a.score)
    .slice(0, topK)
    .filter(r => r.score > 0);
}

/** Bulk-seed from already-fetched profiles (called from register route). */
export async function seedFromProfiles(
  profiles: Array<{ wallet: string; cid: string; price: number | null; skillReport: SkillReport }>
): Promise<void> {
  for (const p of profiles) {
    if (!store.has(p.wallet)) {
      await indexProfile(p.wallet, p.cid, p.price, p.skillReport);
    }
  }
}

/**
 * Seed the store from the database at server startup.
 * Runs once in the background — server accepts requests immediately.
 * Subsequent searches hit the warm in-memory store with no latency.
 */
export async function seedStoreFromDB(): Promise<void> {
  const programId = process.env.PROGRAM_ID!;
  console.log("[embeddings] Seeding embedding store from DB…");

  const rows = await getAllProofsByWallet();
  const byWallet = new Map<string, { cid: string; nonce: number }[]>();
  for (const row of rows) {
    if (!byWallet.has(row.wallet)) byWallet.set(row.wallet, []);
    byWallet.get(row.wallet)!.push({ cid: row.cid, nonce: row.nonce });
  }

  const wallets = [...byWallet.keys()].slice(0, 100);
  let indexed = 0;

  // Process in small batches so we don't hammer IPFS/Solana all at once
  const BATCH = 5;
  for (let i = 0; i < wallets.length; i += BATCH) {
    const batch = wallets.slice(i, i + BATCH);
    await Promise.allSettled(
      batch.map(async wallet => {
        if (store.has(wallet)) return; // already indexed (e.g. from /register)
        const entries = byWallet.get(wallet)!;
        for (const { cid, nonce } of entries) {
          try {
            const onChain = await fetchProofAccount(wallet, programId, nonce);
            const skillReport = await fetchReport(cid);
            const price = onChain ? Number(onChain.price) : null;
            await indexProfile(wallet, cid, price, skillReport);
            indexed++;
            return;
          } catch {
            continue;
          }
        }
      })
    );
  }

  console.log(`[embeddings] Startup seed complete — ${indexed} profiles indexed.`);
}
