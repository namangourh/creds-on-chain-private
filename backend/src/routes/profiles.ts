import { Router, Request, Response } from "express";
import { getAllProofsByWallet } from "../services/cidStore";
import { fetchProofAccount } from "../services/solanaVerifier";
import { fetchReport } from "../services/ipfsClient";
import { SkillReport } from "../types";

const router = Router();

interface BrowseProfile {
  wallet: string;
  cid: string;
  price: number | null;
  skillReport: SkillReport;
}

router.get("/", async (_req: Request, res: Response) => {
  const programId = process.env.PROGRAM_ID!;

  try {
    const rows = await getAllProofsByWallet();

    // Group all nonces per wallet, preserving newest-first order
    const byWallet = new Map<string, { cid: string; nonce: number }[]>();
    for (const row of rows) {
      if (!byWallet.has(row.wallet)) byWallet.set(row.wallet, []);
      byWallet.get(row.wallet)!.push({ cid: row.cid, nonce: row.nonce });
    }

    const wallets = [...byWallet.keys()].slice(0, 50);

    const settled = await Promise.allSettled(
      wallets.map(async (wallet): Promise<BrowseProfile | null> => {
        const entries = byWallet.get(wallet)!;
        // Walk nonces newest-first until we find one with a live on-chain account
        for (const { cid, nonce } of entries) {
          const onChain = await fetchProofAccount(wallet, programId, nonce);
          if (!onChain) continue;
          const skillReport = await fetchReport(cid);
          return { wallet, cid, price: Number(onChain.price), skillReport };
        }
        // Fallback: on-chain lookup failed (e.g. wallet stored lowercase in DB).
        // Still surface the profile for discovery; price shown as unknown on the card.
        const { cid } = entries[0];
        try {
          const skillReport = await fetchReport(cid);
          return { wallet, cid, price: null, skillReport };
        } catch {
          return null;
        }
      })
    );

    const profiles: BrowseProfile[] = settled
      .filter((r): r is PromiseFulfilledResult<BrowseProfile> =>
        r.status === "fulfilled" && r.value !== null
      )
      .map(r => r.value);

    res.json(profiles);
  } catch (err: any) {
    console.error("[profiles] error:", err.message);
    res.status(500).json({ error: "Failed to load profiles." });
  }
});

export default router;
