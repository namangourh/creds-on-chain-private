import { Router, Request, Response } from "express";
import { fetchProofAccount } from "../services/solanaVerifier";
import { getLatestProof } from "../services/cidStore";
import { fetchReport } from "../services/ipfsClient";

const router = Router();

router.get("/:walletAddress", async (req: Request, res: Response) => {
  const { walletAddress } = req.params;
  const programId = process.env.PROGRAM_ID!;

  try {
    const latestProof = await getLatestProof(walletAddress);
    if (!latestProof) {
      res.status(404).json({ error: "Profile not registered." });
      return;
    }

    // Chain lookup uses the stored nonce because proof PDAs are nonce-derived.
    const proof = await fetchProofAccount(walletAddress, programId, latestProof.nonce);
    if (!proof) {
      res.status(404).json({ error: "Profile not found on-chain." });
      return;
    }

    // Teaser content still comes from IPFS so viewers can inspect skills/summary pre-payment.
    const skillReport = await fetchReport(latestProof.cid);
    res.json({
      hash: proof.hash,
      price: Number(proof.price),
      cid: latestProof.cid,
      nonce: latestProof.nonce,
      skillReport,
    });
  } catch (err: any) {
    console.error("[profile] error:", err.message);
    res.status(500).json({ error: err.message || "Failed to load profile." });
  }
});

export default router;
