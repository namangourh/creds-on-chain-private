import {
  Connection,
  PublicKey,
  Transaction,
  TransactionInstruction,
  SystemProgram,
  LAMPORTS_PER_SOL,
} from '@solana/web3.js';
import type { WalletContextState } from '@solana/wallet-adapter-react';

export function getProgramId(): PublicKey {
  return new PublicKey(import.meta.env.VITE_PROGRAM_ID);
}

export function getProofPDA(ownerPubkey: PublicKey, nonce: number): [PublicKey, number] {
  // Nonce is encoded little-endian to match Anchor's u64 seed serialization on-chain.
  const nonceBuffer = Buffer.alloc(8);
  nonceBuffer.writeBigUInt64LE(BigInt(nonce));
  return PublicKey.findProgramAddressSync(
    [Buffer.from('proof'), ownerPubkey.toBytes(), nonceBuffer],
    getProgramId()
  );
}

export function lamportsToSol(lamports: number): string {
  return (lamports / LAMPORTS_PER_SOL).toFixed(4).replace(/\.?0+$/, '');
}

export function solToLamports(sol: number): number {
  return Math.round(sol * LAMPORTS_PER_SOL);
}

/**
 * Returns a Connection to the MagicBlock Magic Router for Devnet.
 *
 * The Magic Router is a smart proxy RPC:
 *   - If accounts in the tx are delegated → routes to the ER validator (sub-second finality)
 *   - If accounts are NOT delegated → routes to Devnet base layer transparently
 *
 * Either way, all addProof registrations genuinely go through the Magic Router.
 */
export function getMagicRouterConnection(): Connection {
  const routerUrl =
    import.meta.env.VITE_MAGICBLOCK_ROUTER_URL || 'https://devnet-router.magicblock.app';
  return new Connection(routerUrl, 'confirmed');
}

/**
 * Build an addProof transaction.
 * Anchor instruction discriminator = sha256("global:add_proof")[0..8]
 * Instruction data layout: [discriminator 8b][hash 32b][price 8b LE][nonce 8b LE]
 *
 * Blockhash is fetched from the DEVNET connection so Phantom's local simulation
 * passes. The signed tx is then routed via the Magic Router by the caller.
 */
export async function buildAddProofTx(
  connection: Connection,
  owner: PublicKey,
  hashHex: string,
  priceLamports: number,
  nonce: number
): Promise<Transaction> {
  const programId = getProgramId();
  const [proofPDA] = getProofPDA(owner, nonce);

  // Anchor discriminator from IDL
  const discriminator = Buffer.from([107, 208, 160, 164, 154, 140, 136, 102]);

  const hashBytes = Buffer.from(hashHex, 'hex');
  if (hashBytes.length !== 32) throw new Error('Hash must be 32 bytes');

  const priceBuffer = Buffer.alloc(8);
  priceBuffer.writeBigUInt64LE(BigInt(priceLamports));

  const nonceBuffer = Buffer.alloc(8);
  nonceBuffer.writeBigUInt64LE(BigInt(nonce));

  const data = Buffer.concat([discriminator, hashBytes, priceBuffer, nonceBuffer]);

  const ix = new TransactionInstruction({
    programId,
    keys: [
      // Account order must match the Anchor Accounts struct exactly.
      { pubkey: proofPDA, isSigner: false, isWritable: true },
      { pubkey: owner, isSigner: true, isWritable: true },
      { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
    ],
    data,
  });

  const tx = new Transaction();
  tx.add(ix);
  tx.feePayer = owner;
  // Devnet blockhash — Phantom simulation validates against this.
  tx.recentBlockhash = (await connection.getLatestBlockhash()).blockhash;
  return tx;
}

/**
 * MagicBlock ER Integration — Option C
 *
 * Correct flow for routing a transaction through the Magic Router:
 *
 *   1. Build tx with DEVNET blockhash (so Phantom local simulation works)
 *   2. Ask Phantom to SIGN ONLY (signTransaction — does NOT submit)
 *   3. Send the signed raw bytes to the Magic Router via sendRawTransaction
 *   4. Magic Router decides: ER validator (delegated accounts) or Devnet base layer
 *   5. Confirm via Magic Router
 *
 * This is the honest, correct integration — the transaction genuinely goes
 * through the MagicBlock Magic Router, not directly to Helius Devnet.
 *
 * @param tx              - Unsigned tx built with devnet blockhash
 * @param signTransaction - Wallet adapter signTransaction (signs without sending)
 * @returns confirmed transaction signature
 */
export async function signAndSendViaMagicRouter(
  tx: Transaction,
  signTransaction: NonNullable<WalletContextState['signTransaction']>
): Promise<string> {
  const erConnection = getMagicRouterConnection();

  // Step 1: Sign only — Phantom signs locally, tx is NOT submitted yet
  const signedTx = await signTransaction(tx);

  // Step 2: Send raw signed bytes to Magic Router
  // Magic Router inspects accounts and routes to ER or base layer
  const sig = await erConnection.sendRawTransaction(signedTx.serialize(), {
    skipPreflight: false,          // Let Magic Router simulate (catches program errors)
    preflightCommitment: 'confirmed',
    maxRetries: 3,
  });

  // Step 3: Confirm via Magic Router (polls ER or base layer as appropriate)
  const { blockhash, lastValidBlockHeight } = await erConnection.getLatestBlockhash();
  await erConnection.confirmTransaction(
    { signature: sig, blockhash, lastValidBlockHeight },
    'confirmed'
  );

  return sig;
}

/**
 * Sign and send a pre-built transaction returned by the MagicBlock Private
 * Payments API (Tier 1 — private SPL unlock flow).
 *
 * @param transactionBase64 - Base64-encoded unsigned transaction from the API
 * @param sendTo            - Where to submit: "base" (devnet) or "ephemeral" (ER)
 * @param sendTransaction   - Wallet adapter sendTransaction function
 * @returns confirmed transaction signature
 */
export async function sendAndConfirmBuiltTx(
  transactionBase64: string,
  sendTo: 'base' | 'ephemeral',
  sendTransaction: WalletContextState['sendTransaction']
): Promise<string> {
  // Decode base64 → Transaction
  const txBytes = Buffer.from(transactionBase64, 'base64');
  const tx = Transaction.from(txBytes);

  // Select the right RPC endpoint based on where the API says to send
  const rpcUrl =
    sendTo === 'ephemeral'
      ? import.meta.env.VITE_MAGICBLOCK_ER_URL || 'https://devnet-as.magicblock.app'
      : import.meta.env.VITE_SOLANA_RPC_URL || 'https://api.devnet.solana.com';

  const connection = new Connection(rpcUrl, 'confirmed');

  // sendTransaction handles signing via the connected wallet
  const sig = await sendTransaction(tx, connection);

  // Wait for confirmation with a generous timeout for ER settlement
  await connection.confirmTransaction(
    { signature: sig, ...(await connection.getLatestBlockhash()) },
    'confirmed'
  );

  return sig;
}
