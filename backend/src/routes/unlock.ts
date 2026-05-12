import { Router, Request, Response } from "express";
import jwt from "jsonwebtoken";
import { fetchProofAccount, verifyPayToUnlockTx } from "../services/solanaVerifier";
import { getLatestProof } from "../services/cidStore";

const router = Router();

router.post("/", async (req: Request, res: Response) => {
  const { txSignature, viewerWallet, ownerWallet } = req.body;

  if (!txSignature || !viewerWallet || !ownerWallet) {
    res.status(400).json({ error: "txSignature, viewerWallet, and ownerWallet are required." });
    return;
  }

  try {
    const programId = process.env.PROGRAM_ID!;

    const latestProof = await getLatestProof(ownerWallet);
    if (!latestProof) {
      res.status(404).json({ error: "No registered proof found for this owner." });
      return;
    }

    // Fetch price from on-chain proof using the stored nonce to derive the correct PDA.
    const proof = await fetchProofAccount(ownerWallet, programId, latestProof.nonce);
    if (!proof) {
      res.status(404).json({ error: "Proof account not found on-chain." });
      return;
    }

    // Verification checks both counterparties and expected lamports to limit spoofed unlock calls.
    const valid = await verifyPayToUnlockTx(
      txSignature,
      viewerWallet,
      ownerWallet,
      proof.price
    );

    if (!valid) {
      res.status(400).json({ error: "Payment transaction could not be verified." });
      return;
    }

    const secret = process.env.JWT_SECRET!;
    const expiresIn = parseInt(process.env.JWT_EXPIRES_IN || "3600", 10);

    // Token is CID-bound so it cannot be replayed to fetch a different owner's report.
    const token = jwt.sign({ sub: viewerWallet, cid: latestProof.cid }, secret, { expiresIn });
    res.json({ token });
  } catch (err: any) {
    console.error("[unlock] error:", err.message);
    res.status(500).json({ error: "Failed to process unlock." });
  }
});

export default router;
