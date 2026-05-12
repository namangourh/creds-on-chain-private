import { Router, Request, Response } from "express";
import { searchProfiles } from "../services/embeddings";

const router = Router();

/**
 * GET /api/search?q=<query>&limit=<n>
 *
 * Runs semantic similarity search over the in-memory vector store.
 * The store is pre-seeded at startup and updated on every /api/register call,
 * so this route never fetches from IPFS or Solana — it's pure in-memory math.
 *
 * All inference (QVAC or TF-IDF fallback) is on-device.
 */
router.get("/", async (req: Request, res: Response) => {
  const query = (req.query.q as string | undefined)?.trim();
  const limit = Math.min(parseInt((req.query.limit as string) || "10", 10), 50);

  if (!query) {
    res.status(400).json({ error: "Missing query parameter: q" });
    return;
  }

  try {
    const ranked = await searchProfiles(query, limit);
    res.json(ranked);
  } catch (err: any) {
    console.error("[search] error:", err.message);
    res.status(500).json({ error: "Search failed." });
  }
});

export default router;
