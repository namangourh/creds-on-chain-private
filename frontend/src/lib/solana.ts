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
 * Returns a connection to the MagicBlock Magic Router for Devnet.
 * Transactions routed through here are automatically forwarded to the ER
 * validator or base layer depending on account delegation status.
 * Falls back to plain devnet if the env var is not set.
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
 * Uses the Magic Router connection so the tx is processed via the Ephemeral Rollup
 * for near-instant confirmation (Tier 2 Core).
 */
export async function buildAddProofTx(
  connection: Connection,
  owner: PublicKey,
  hashHex: string,
  priceLamports: number,
  nonce: number
): Promise<Transaction> {
  // Use Magic Router for ER-accelerated registration
  const erConnection = getMagicRouterConnection();

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
  // Fetch blockhash from Magic Router so it's valid for the ER
  tx.recentBlockhash = (await erConnection.getLatestBlockhash()).blockhash;
  return tx;
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
