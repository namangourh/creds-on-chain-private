import * as anchor from "@coral-xyz/anchor";
import { Program } from "@coral-xyz/anchor";
import { AiSkillPassport } from "../target/types/ai_skill_passport";
import { PublicKey, SystemProgram, LAMPORTS_PER_SOL } from "@solana/web3.js";
import assert from "assert";

describe("ai-skill-passport", () => {
  const provider = anchor.AnchorProvider.env();
  anchor.setProvider(provider);

  const program = anchor.workspace.AiSkillPassport as Program<AiSkillPassport>;
  const owner = provider.wallet;

  // Dummy 32-byte SHA-256 hash for testing
  const dummyHash = new Uint8Array(32).fill(1);
  const priceInLamports = new anchor.BN(10_000_000); // 0.01 SOL

  let proofPda: PublicKey;
  let proofBump: number;

  before(async () => {
    [proofPda, proofBump] = PublicKey.findProgramAddressSync(
      [Buffer.from("proof"), owner.publicKey.toBytes()],
      program.programId
    );
  });

  it("addProof: initializes a Proof account with correct data", async () => {
    await program.methods
      .addProof(Array.from(dummyHash), priceInLamports)
      .accounts({
        proof: proofPda,
        owner: owner.publicKey,
        systemProgram: SystemProgram.programId,
      })
      .rpc();

    const proofAccount = await program.account.proof.fetch(proofPda);

    assert.ok(
      proofAccount.owner.equals(owner.publicKey),
      "owner should match signer"
    );
    assert.deepStrictEqual(
      Array.from(proofAccount.hash),
      Array.from(dummyHash),
      "hash should match"
    );
    assert.ok(
      proofAccount.price.eq(priceInLamports),
      "price should match"
    );
  });

  it("payToUnlock: transfers lamports from payer to owner", async () => {
    // Create a separate payer keypair and fund it
    const payer = anchor.web3.Keypair.generate();
    const airdropSig = await provider.connection.requestAirdrop(
      payer.publicKey,
      LAMPORTS_PER_SOL
    );
    await provider.connection.confirmTransaction(airdropSig);

    const ownerBalanceBefore = await provider.connection.getBalance(
      owner.publicKey
    );
    const payerBalanceBefore = await provider.connection.getBalance(
      payer.publicKey
    );

    await program.methods
      .payToUnlock()
      .accounts({
        proof: proofPda,
        payer: payer.publicKey,
        ownerAccount: owner.publicKey,
        systemProgram: SystemProgram.programId,
      })
      .signers([payer])
      .rpc();

    const ownerBalanceAfter = await provider.connection.getBalance(
      owner.publicKey
    );
    const payerBalanceAfter = await provider.connection.getBalance(
      payer.publicKey
    );

    const priceNum = priceInLamports.toNumber();

    assert.ok(
      ownerBalanceAfter >= ownerBalanceBefore + priceNum,
      "owner should receive lamports"
    );
    assert.ok(
      payerBalanceAfter <= payerBalanceBefore - priceNum,
      "payer balance should decrease by at least price"
    );
  });

  it("payToUnlock: rejects wrong owner account", async () => {
    const payer = anchor.web3.Keypair.generate();
    const airdropSig = await provider.connection.requestAirdrop(
      payer.publicKey,
      LAMPORTS_PER_SOL
    );
    await provider.connection.confirmTransaction(airdropSig);

    const wrongOwner = anchor.web3.Keypair.generate();

    try {
      await program.methods
        .payToUnlock()
        .accounts({
          proof: proofPda,
          payer: payer.publicKey,
          ownerAccount: wrongOwner.publicKey, // wrong owner
          systemProgram: SystemProgram.programId,
        })
        .signers([payer])
        .rpc();
      assert.fail("should have thrown");
    } catch (e) {
      assert.ok(e, "expected error for wrong owner account");
    }
  });
});
