import { Router, Request, Response } from "express";
import { verifyAddProofTx } from "../services/solanaVerifier";
import { addProof } from "../services/cidStore";
import { fetchReport } from "../services/ipfsClient";
import { indexProfile } from "../services/embeddings";

const router = Router();

router.post("/", async (req: Request, res: Response) => {
  const { walletAddress, cid, txSignature, nonce } = req.body;

  if (!walletAddress || !cid || !txSignature || nonce === undefined) {
    res.status(400).json({ error: "walletAddress, cid, txSignature, and nonce are required." });
    return;
  }

  try {
    // Registration is only accepted after an on-chain tx ties this action to walletAddress.
    const valid = await verifyAddProofTx(txSignature, walletAddress);
    if (!valid) {
      res.status(400).json({ error: "Could not verify on-chain transaction." });
      return;
    }

    // Store nonce with CID so profile lookup can derive the same nonce-scoped PDA later.
    await addProof(walletAddress, cid, Number(nonce));

    // Index the new profile in the QVAC embedding store so it's immediately searchable.
    // Fire-and-forget: IPFS fetch is slow and we don't want to delay the registration response.
    fetchReport(cid)
      .then(report => indexProfile(walletAddress, cid, null, report))
      .catch(e => console.warn("[register] embedding index failed:", e?.message));

    res.json({ success: true });
  } catch (err: any) {
    console.error("[register] error:", err.message);
    res.status(500).json({ error: "Failed to register proof." });
  }
});

export default router;
