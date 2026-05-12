import { Router, Request, Response } from "express";
import jwt from "jsonwebtoken";
import { fetchProofAccount } from "../services/solanaVerifier";
import {
  buildPrivateUnlockTx,
  verifyPrivateUnlockTx,
  DEVNET_USDC_MINT,
  USDC_DECIMALS,
} from "../services/magicblockPayments";
import { getLatestProof } from "../services/cidStore";

const router = Router();

// ─── POST /api/unlock/build-tx ───────────────────────────────────────────────
// Calls the MagicBlock Private Payments API and returns an unsigned transaction
// that the frontend will sign with the recruiter's wallet.
router.post("/build-tx", async (req: Request, res: Response) => {
  const { viewerWallet, ownerWallet } = req.body;

  if (!viewerWallet || !ownerWallet) {
    res.status(400).json({ error: "viewerWallet and ownerWallet are required." });
    return;
  }

  try {
    const programId = process.env.PROGRAM_ID!;

    // Fetch the latest registered proof to get the unlock price
    const latestProof = await getLatestProof(ownerWallet);
    if (!latestProof) {
      res.status(404).json({ error: "No registered proof found for this owner." });
      return;
    }

    const proof = await fetchProofAccount(ownerWallet, programId, latestProof.nonce);
    if (!proof) {
      res.status(404).json({ error: "Proof account not found on-chain." });
      return;
    }

    // Convert on-chain price (stored as lamport-equivalent u64) to USDC units.
    // We treat the stored price as micro-USDC (i.e. 1_000_000 = 1 USDC) for the hackathon demo.
    // Minimum 100_000 (0.1 USDC) to ensure the API accepts it.
    const amountUnits = Math.max(Number(proof.price), 100_000);

    const txPayload = await buildPrivateUnlockTx({
      fromWallet: viewerWallet,
      toWallet: ownerWallet,
      amountUnits,
      mint: DEVNET_USDC_MINT,
      refId: String(latestProof.nonce),
    });

    res.json({
      ...txPayload,
      amountUnits,
      mint: DEVNET_USDC_MINT,
      decimals: USDC_DECIMALS,
    });
  } catch (err: any) {
    console.error("[unlock/build-tx] error:", err?.response?.data || err.message);
    res.status(500).json({ error: "Failed to build unlock transaction." });
  }
});

// ─── POST /api/unlock/verify ─────────────────────────────────────────────────
// Verifies the signed + submitted private payment transaction and issues a JWT
// that the recruiter uses to fetch the full IPFS report.
router.post("/verify", async (req: Request, res: Response) => {
  const { txSignature, viewerWallet, ownerWallet, sendTo, amountUnits } = req.body;

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

    const proof = await fetchProofAccount(ownerWallet, programId, latestProof.nonce);
    if (!proof) {
      res.status(404).json({ error: "Proof account not found on-chain." });
      return;
    }

    // Expected amount: use what was agreed during build-tx, fallback to on-chain price
    const expectedAmount = amountUnits
      ? Number(amountUnits)
      : Math.max(Number(proof.price), 100_000);

    const valid = await verifyPrivateUnlockTx({
      txSignature,
      fromWallet: viewerWallet,
      toWallet: ownerWallet,
      mint: DEVNET_USDC_MINT,
      expectedAmountUnits: expectedAmount,
      sendTo: sendTo ?? "base",
    });

    if (!valid) {
      res.status(400).json({ error: "Private payment transaction could not be verified." });
      return;
    }

    const secret = process.env.JWT_SECRET!;
    const expiresIn = parseInt(process.env.JWT_EXPIRES_IN || "3600", 10);

    // Token is CID-bound so it cannot be replayed to fetch a different owner's report.
    const token = jwt.sign({ sub: viewerWallet, cid: latestProof.cid }, secret, { expiresIn });
    res.json({ token });
  } catch (err: any) {
    console.error("[unlock/verify] error:", err.message);
    res.status(500).json({ error: "Failed to process unlock." });
  }
});

export default router;
