import {
  Connection,
  PublicKey,
  Transaction,
  TransactionInstruction,
  SystemProgram,
  LAMPORTS_PER_SOL,
} from '@solana/web3.js';

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
 * Build an addProof transaction.
 * Anchor instruction discriminator = sha256("global:add_proof")[0..8]
 * Instruction data layout: [discriminator 8b][hash 32b][price 8b LE]
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
  tx.recentBlockhash = (await connection.getLatestBlockhash()).blockhash;
  return tx;
}

/**
 * Build a payToUnlock transaction.
 * Anchor instruction discriminator for "pay_to_unlock": sha256("global:pay_to_unlock")
 * Instruction data layout: [discriminator 8b] (no additional args)
 */
export async function buildPayToUnlockTx(
  connection: Connection,
  payer: PublicKey,
  ownerPubkey: PublicKey,
  nonce: number
): Promise<Transaction> {
  const programId = getProgramId();
  const [proofPDA] = getProofPDA(ownerPubkey, nonce);

  // Anchor discriminator from IDL
  const discriminator = Buffer.from([19, 181, 0, 146, 149, 96, 252, 254]);

  const ix = new TransactionInstruction({
    programId,
    keys: [
      // proof is read-only here because transfer only reads price/owner from stored state.
      { pubkey: proofPDA, isSigner: false, isWritable: false },
      { pubkey: payer, isSigner: true, isWritable: true },
      { pubkey: ownerPubkey, isSigner: false, isWritable: true },
      { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
    ],
    data: discriminator,
  });

  const tx = new Transaction();
  tx.add(ix);
  tx.feePayer = payer;
  tx.recentBlockhash = (await connection.getLatestBlockhash()).blockhash;
  return tx;
}
