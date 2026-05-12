import axios from "axios";
import {
  Connection,
  PublicKey,
  Transaction,
  TransactionInstruction,
} from "@solana/web3.js";

// MagicBlock Private Payments API — https://payments.magicblock.app
const PAYMENTS_API = process.env.MAGICBLOCK_PAYMENTS_URL || "https://payments.magicblock.app";

// Devnet USDC mint (standard devnet USDC used for testing)
export const DEVNET_USDC_MINT = process.env.SPL_UNLOCK_MINT || "4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU";

// 1 USDC = 1_000_000 base units (6 decimals)
export const USDC_DECIMALS = 6;

export interface BuildUnlockTxResult {
  kind: string;
  version: string;
  transactionBase64: string;
  sendTo: "base" | "ephemeral";
  recentBlockhash: string;
  lastValidBlockHeight: number;
  instructionCount: number;
  requiredSigners: string[];
  validator?: string;
}

// SPL Token program
const TOKEN_PROGRAM_ID = new PublicKey("TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA");
// Associated Token Account program
const ASSOCIATED_TOKEN_PROGRAM_ID = new PublicKey("ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJe1brs");

/**
 * Derive the Associated Token Account address for a given owner and mint.
 * This is deterministic — same inputs always produce the same ATA address.
 */
function getAssociatedTokenAddress(owner: PublicKey, mint: PublicKey): PublicKey {
  return PublicKey.findProgramAddressSync(
    [owner.toBytes(), TOKEN_PROGRAM_ID.toBytes(), mint.toBytes()],
    ASSOCIATED_TOKEN_PROGRAM_ID
  )[0];
}

/**
 * Build an unsigned SPL USDC transfer transaction directly.
 *
 * Strategy: Try MagicBlock Private Payments API first (private routing via PER).
 * If the API returns TRANSACTION_TOO_LARGE (their privacy overhead can exceed
 * Solana's 1232-byte limit on devnet), fall back to a standard SPL transfer
 * built locally. The verification logic is identical for both paths.
 *
 * @param fromWallet  - Recruiter's Solana public key (base58)
 * @param toWallet    - Profile owner's Solana public key (base58)
 * @param amountUnits - Amount in SPL base units (e.g. 1_000_000 = 1 USDC)
 * @param mint        - SPL mint address (defaults to devnet USDC)
 * @param refId       - Reference ID for receipt matching (optional)
 */
export async function buildPrivateUnlockTx(params: {
  fromWallet: string;
  toWallet: string;
  amountUnits: number;
  mint?: string;
  refId?: string;
}): Promise<BuildUnlockTxResult> {
  const { fromWallet, toWallet, amountUnits, mint = DEVNET_USDC_MINT, refId } = params;

  // ── Attempt 1: MagicBlock Private Payments API (private PER routing) ────────
  try {
    const body: Record<string, unknown> = {
      from: fromWallet,
      to: toWallet,
      mint,
      amount: amountUnits,
      visibility: "private",      // Private Ephemeral Rollup routing
      fromBalance: "base",
      toBalance: "base",
      cluster: "devnet",
      initAtasIfMissing: true,    // Create ATA for owner if missing
      legacy: true,               // Legacy format — try first
      ...(refId ? { clientRefId: refId } : {}),
    };

    const { data } = await axios.post<BuildUnlockTxResult>(
      `${PAYMENTS_API}/v1/spl/transfer`,
      body,
      { headers: { "Content-Type": "application/json" }, timeout: 8000 }
    );
    console.log("[unlock] MagicBlock private tx built successfully");
    return data;
  } catch (err: any) {
    const apiError = err?.response?.data?.error;
    const isTooLarge = apiError?.code === "TRANSACTION_TOO_LARGE";
    const isApiDown = !err?.response;

    if (isTooLarge) {
      console.warn("[unlock] MagicBlock tx too large — falling back to direct SPL transfer");
    } else if (isApiDown) {
      console.warn("[unlock] MagicBlock API unreachable — falling back to direct SPL transfer:", err.message);
    } else {
      // Unknown API error — re-throw to surface it
      console.error("[unlock] MagicBlock API error:", apiError || err.message);
      throw new Error(`MagicBlock API error: ${apiError?.message || err.message}`);
    }
  }

  // ── Fallback: Direct SPL USDC transfer built locally ────────────────────────
  // This is a standard, well-understood transaction < 300 bytes.
  // The verification path (checking postTokenBalances on-chain) is identical.
  const rpcUrl = process.env.SOLANA_RPC_URL || "https://api.devnet.solana.com";
  const connection = new Connection(rpcUrl, "confirmed");

  const fromPubkey = new PublicKey(fromWallet);
  const toPubkey = new PublicKey(toWallet);
  const mintPubkey = new PublicKey(mint);

  const fromAta = getAssociatedTokenAddress(fromPubkey, mintPubkey);
  const toAta = getAssociatedTokenAddress(toPubkey, mintPubkey);

  // Build create-ATA instruction for recipient (idempotent — safe to include always)
  const createToAtaIx = new TransactionInstruction({
    programId: ASSOCIATED_TOKEN_PROGRAM_ID,
    keys: [
      { pubkey: fromPubkey, isSigner: true, isWritable: true },
      { pubkey: toAta, isSigner: false, isWritable: true },
      { pubkey: toPubkey, isSigner: false, isWritable: false },
      { pubkey: mintPubkey, isSigner: false, isWritable: false },
      { pubkey: new PublicKey("11111111111111111111111111111111"), isSigner: false, isWritable: false },
      { pubkey: TOKEN_PROGRAM_ID, isSigner: false, isWritable: false },
    ],
    // Instruction discriminator 0 = create (idempotent variant of ATA program)
    data: Buffer.from([1]),
  });

  // SPL Token transfer instruction (9 bytes: discriminant + u64 amount)
  const transferData = Buffer.alloc(9);
  transferData.writeUInt8(3, 0); // instruction index 3 = transfer
  transferData.writeBigUInt64LE(BigInt(amountUnits), 1);

  const transferIx = new TransactionInstruction({
    programId: TOKEN_PROGRAM_ID,
    keys: [
      { pubkey: fromAta, isSigner: false, isWritable: true },  // source ATA
      { pubkey: toAta, isSigner: false, isWritable: true },    // destination ATA
      { pubkey: fromPubkey, isSigner: true, isWritable: false }, // owner/authority
    ],
    data: transferData,
  });

  const { blockhash, lastValidBlockHeight } = await connection.getLatestBlockhash();

  const tx = new Transaction();
  tx.add(createToAtaIx, transferIx);
  tx.recentBlockhash = blockhash;
  tx.feePayer = fromPubkey;

  const txBytes = tx.serialize({ requireAllSignatures: false, verifySignatures: false });
  const transactionBase64 = Buffer.from(txBytes).toString("base64");

  console.log(`[unlock] Direct SPL transfer tx built — ${txBytes.length} bytes`);

  return {
    kind: "splTransfer",
    version: "1.0",
    transactionBase64,
    sendTo: "base",
    recentBlockhash: blockhash,
    lastValidBlockHeight,
    instructionCount: 2,
    requiredSigners: [fromWallet],
  };
}

/**
 * Verify an SPL token transfer on-chain.
 * Checks that the owner's token balance increased by at least expectedAmountUnits.
 * Works for both MagicBlock private txs and direct SPL transfers.
 */
export async function verifyPrivateUnlockTx(params: {
  txSignature: string;
  fromWallet: string;
  toWallet: string;
  mint: string;
  expectedAmountUnits: number;
  sendTo?: "base" | "ephemeral";
}): Promise<boolean> {
  const { txSignature, toWallet, mint, expectedAmountUnits, sendTo } = params;

  const baseRpc = process.env.SOLANA_RPC_URL || "https://api.devnet.solana.com";
  const erRpc = process.env.MAGICBLOCK_ER_URL || "https://devnet-as.magicblock.app";

  // Try the RPC indicated by the payment API first, then fall back to the other
  const rpcs = sendTo === "ephemeral" ? [erRpc, baseRpc] : [baseRpc, erRpc];

  for (const rpc of rpcs) {
    try {
      const result = await fetchAndVerifyTx(rpc, txSignature, toWallet, mint, expectedAmountUnits);
      if (result) return true;
    } catch {
      // Try next RPC
    }
  }
  return false;
}

async function fetchAndVerifyTx(
  rpcUrl: string,
  txSignature: string,
  toWallet: string,
  mint: string,
  expectedAmountUnits: number
): Promise<boolean> {
  const body = {
    jsonrpc: "2.0",
    id: 1,
    method: "getTransaction",
    params: [txSignature, { encoding: "jsonParsed", maxSupportedTransactionVersion: 0 }],
  };

  const { data } = await axios.post(rpcUrl, body, {
    headers: { "Content-Type": "application/json" },
    timeout: 10_000,
  });

  const tx = data?.result;
  if (!tx || tx.meta?.err) return false;

  const postBalances: Array<{
    accountIndex: number;
    mint: string;
    owner: string;
    uiTokenAmount: { amount: string };
  }> = tx.meta?.postTokenBalances ?? [];

  const preBalances: Array<{
    accountIndex: number;
    mint: string;
    owner: string;
    uiTokenAmount: { amount: string };
  }> = tx.meta?.preTokenBalances ?? [];

  for (const post of postBalances) {
    if (post.owner !== toWallet || post.mint !== mint) continue;

    const pre = preBalances.find(
      (p) => p.accountIndex === post.accountIndex && p.mint === mint
    );

    const preAmount = pre ? parseInt(pre.uiTokenAmount.amount, 10) : 0;
    const postAmount = parseInt(post.uiTokenAmount.amount, 10);
    const delta = postAmount - preAmount;

    if (delta >= expectedAmountUnits) return true;
  }

  return false;
}
