use anchor_lang::prelude::*;
use anchor_lang::system_program;

declare_id!("2SysoLkkPBto76Yq8NmSgwr5nMsZNpAXWeGRFBY4E8JJ");

#[program]
pub mod ai_skill_passport {
    use super::*;

    /// Called by the owner after uploading their report to IPFS.
    /// Each call creates a new Proof PDA keyed by nonce (timestamp),
    /// allowing multiple skill passports per wallet.
    ///
    /// Tier 2 (ER): This transaction is routed via the MagicBlock Magic Router
    /// (ConnectionMagicRouter) so it benefits from near-instant ER confirmation
    /// before settling to Devnet base-layer. No program change needed for this.
    pub fn add_proof(ctx: Context<AddProof>, hash: [u8; 32], price: u64, nonce: u64) -> Result<()> {
        let proof = &mut ctx.accounts.proof;
        proof.owner = ctx.accounts.owner.key();
        proof.hash = hash;
        proof.price = price;
        proof.nonce = nonce;
        Ok(())
    }

    /// Called by a viewer to pay SOL and unlock the full report.
    /// Kept for backward-compatibility; all new unlock flows use the
    /// MagicBlock Private Payments API (shielded SPL transfer, off-program).
    pub fn pay_to_unlock(ctx: Context<PayToUnlock>) -> Result<()> {
        let price = ctx.accounts.proof.price;
        let cpi_ctx = CpiContext::new(
            ctx.accounts.system_program.to_account_info(),
            system_program::Transfer {
                from: ctx.accounts.payer.to_account_info(),
                to: ctx.accounts.owner_account.to_account_info(),
            },
        );
        system_program::transfer(cpi_ctx, price)?;
        Ok(())
    }
}

// ─── Accounts structs ────────────────────────────────────────────────────────

#[derive(Accounts)]
#[instruction(hash: [u8; 32], price: u64, nonce: u64)]
pub struct AddProof<'info> {
    #[account(
        init,
        payer = owner,
        // Keep this explicit so account layout remains easy to audit across Rust/TS code.
        space = 8 + 32 + 32 + 8 + 8,
        seeds = [b"proof", owner.key().as_ref(), &nonce.to_le_bytes()],
        bump
    )]
    pub proof: Account<'info, Proof>,
    #[account(mut)]
    pub owner: Signer<'info>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct PayToUnlock<'info> {
    #[account(
        // Re-derive PDA from stored owner+nonce to bind payment to an existing proof record.
        seeds = [b"proof", proof.owner.as_ref(), &proof.nonce.to_le_bytes()],
        bump
    )]
    pub proof: Account<'info, Proof>,
    #[account(mut)]
    pub payer: Signer<'info>,
    /// CHECK: address constraint validates this matches proof.owner
    #[account(mut, address = proof.owner)]
    pub owner_account: UncheckedAccount<'info>,
    pub system_program: Program<'info, System>,
}

// ─── Account data ────────────────────────────────────────────────────────────

#[account]
pub struct Proof {
    pub owner: Pubkey,   // 32 bytes
    pub hash: [u8; 32],  // 32 bytes — SHA-256 of SkillReport JSON
    pub price: u64,      // 8 bytes  — unlock cost in USDC micro-units
    pub nonce: u64,      // 8 bytes  — timestamp, for unique PDAs
}
// Total account space: 8 (discriminator) + 32 + 32 + 8 + 8 = 88 bytes
//
// MagicBlock ER Integration Note:
// The on-chain program itself does not need modification to benefit from the
// Ephemeral Rollup. The frontend routes addProof transactions through the
// Magic Router (getMagicRouterConnection) which transparently handles ER
// scheduling and base-layer settlement. The delegate/commit/undelegate
// lifecycle (Tier 2 Optional) requires upgrading to anchor-lang >=0.30 with
// solana-program v2.x to be compatible with ephemeral-rollups-sdk >= 0.6.
