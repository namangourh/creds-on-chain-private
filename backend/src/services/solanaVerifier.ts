import { Connection, PublicKey } from "@solana/web3.js";

function getConnection(): Connection {
  // Centralized RPC creation keeps all verification paths on the same commitment policy.
  return new Connection(
    process.env.SOLANA_RPC_URL || "https://api.devnet.solana.com",
    "confirmed"
  );
}

/**
 * Verify that a transaction was confirmed and the fee payer matches walletAddress.
 * Used to confirm addProof was submitted by the correct owner.
 */
export async function verifyAddProofTx(
  txSig: string,
  walletAddress: string
): Promise<boolean> {
  try {
    const connection = getConnection();
    const tx = await connection.getTransaction(txSig, {
      maxSupportedTransactionVersion: 0,
    });

    if (!tx || tx.meta?.err) return false;

    const accounts = tx.transaction.message.getAccountKeys
      ? tx.transaction.message.getAccountKeys().staticAccountKeys
      : (tx.transaction.message as any).accountKeys;

    if (!accounts || accounts.length === 0) return false;

    // The fee payer (first account) should match the wallet
    const feePayer = accounts[0].toBase58();
    return feePayer.toLowerCase() === walletAddress.toLowerCase();
  } catch {
    return false;
  }
}

/**
 * Verify that a payToUnlock transaction was confirmed and transferred
 * funds from viewerWallet to ownerWallet.
 */
export async function verifyPayToUnlockTx(
  txSig: string,
  viewerWallet: string,
  ownerWallet: string,
  expectedLamports: bigint
): Promise<boolean> {
  try {
    const connection = getConnection();
    const tx = await connection.getTransaction(txSig, {
      maxSupportedTransactionVersion: 0,
    });

    if (!tx || tx.meta?.err) return false;

    const { preBalances, postBalances } = tx.meta!;
    const accounts = tx.transaction.message.getAccountKeys
      ? tx.transaction.message.getAccountKeys().staticAccountKeys
      : (tx.transaction.message as any).accountKeys;

    if (!accounts) return false;

    const accountAddresses = accounts.map((k: PublicKey) => k.toBase58().toLowerCase());

    const viewerIdx = accountAddresses.indexOf(viewerWallet.toLowerCase());
    const ownerIdx = accountAddresses.indexOf(ownerWallet.toLowerCase());

    if (viewerIdx === -1 || ownerIdx === -1) return false;

    const viewerDelta = BigInt(preBalances[viewerIdx]) - BigInt(postBalances[viewerIdx]);
    const ownerDelta = BigInt(postBalances[ownerIdx]) - BigInt(preBalances[ownerIdx]);

    // Owner received at least the expected amount
    // Viewer paid at least the expected amount (viewer also pays tx fee)
    // Use >= (not ==) because payer also spends network fees and balances can shift slightly.
    return ownerDelta >= expectedLamports && viewerDelta >= expectedLamports;
  } catch {
    return false;
  }
}

/**
 * Fetch the Proof account data from chain.
 * Returns raw deserialized fields or null if not found.
 */
export async function fetchProofAccount(
  ownerWallet: string,
  programId: string,
  nonce: number
): Promise<{ hash: string; price: bigint } | null> {
  try {
    const connection = getConnection();
    const ownerPubkey = new PublicKey(ownerWallet);
    const programPubkey = new PublicKey(programId);

    // Nonce is part of seeds, so backend must use the same nonce persisted at register time.
    const nonceBuffer = Buffer.alloc(8);
    nonceBuffer.writeBigUInt64LE(BigInt(nonce));

    const [proofPda] = PublicKey.findProgramAddressSync(
      [Buffer.from("proof"), ownerPubkey.toBytes(), nonceBuffer],
      programPubkey
    );

    const accountInfo = await connection.getAccountInfo(proofPda);
    if (!accountInfo) return null;

    // Manual deserialization: skip 8-byte Anchor discriminator
    // Layout: discriminator(8) + owner(32) + hash(32) + price(8) + nonce(8) = 88 bytes
    const data = accountInfo.data;
    if (data.length < 88) return null;

    const hashBytes = data.slice(40, 72); // bytes 8+32=40 to 40+32=72
    const priceBytes = data.slice(72, 80); // bytes 72 to 80

    const hash = Buffer.from(hashBytes).toString("hex");
    const price = new DataView(priceBytes.buffer, priceBytes.byteOffset).getBigUint64(0, true); // little-endian

    return { hash, price };
  } catch {
    return null;
  }
}
