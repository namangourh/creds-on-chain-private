import axios from "axios";

// MagicBlock Private Payments API — https://payments.magicblock.app
// Builds unsigned SPL token transactions; client signs and submits them.
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

/**
 * Calls MagicBlock Private Payments API to build an unsigned private SPL transfer.
 * The recruiter pays the owner privately — the on-chain record doesn't directly
 * link recruiter ↔ profile owner.
 *
 * @param fromWallet  - Recruiter's Solana public key (base58)
 * @param toWallet    - Profile owner's Solana public key (base58)
 * @param amountUnits - Amount in SPL base units (e.g. 1_000_000 = 1 USDC)
 * @param mint        - SPL mint address (defaults to devnet USDC)
 * @param refId       - Encrypted client reference ID for receipt matching (optional)
 */
export async function buildPrivateUnlockTx(params: {
  fromWallet: string;
  toWallet: string;
  amountUnits: number;
  mint?: string;
  refId?: string;
}): Promise<BuildUnlockTxResult> {
  const { fromWallet, toWallet, amountUnits, mint = DEVNET_USDC_MINT, refId } = params;

  const body: Record<string, unknown> = {
    from: fromWallet,
    to: toWallet,
    mint,
    amount: amountUnits,
    visibility: "private",       // Routes through Private Ephemeral Rollup
    fromBalance: "base",
    toBalance: "base",
    cluster: "devnet",
    initIfMissing: true,          // Initialize transfer queue if not yet set up
    initAtasIfMissing: true,      // Create ATA for owner if missing
    initVaultIfMissing: true,
    legacy: true,                 // Use legacy tx format for Phantom compatibility
    ...(refId ? { clientRefId: refId } : {}),
  };

  const { data } = await axios.post<BuildUnlockTxResult>(
    `${PAYMENTS_API}/v1/spl/transfer`,
    body,
    { headers: { "Content-Type": "application/json" } }
  );

  return data;
}

/**
 * Verify an SPL token transfer on-chain.
 * Checks that:
 *   - The transaction is confirmed with no error
 *   - The token mint matches
 *   - The owner's token balance increased by at least expectedAmountUnits
 *
 * NOTE: For private transfers routed through the PER the settlement tx may
 * appear on the ER RPC first; we try both the base and ER RPC.
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
  // Use JSON-RPC directly to avoid pulling @solana/web3.js Connection into this service
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

  // Walk postTokenBalances to find an entry for the recipient with the correct mint
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
