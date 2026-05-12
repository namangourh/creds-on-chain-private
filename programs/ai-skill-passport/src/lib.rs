use anchor_lang::prelude::*;
use anchor_lang::system_program;
use ephemeral_rollups_sdk::anchor::ephemeral;
use ephemeral_rollups_sdk::cpi::delegate_account;
use ephemeral_rollups_sdk::ephem::{commit_accounts, undelegate_accounts};

declare_id!("2SysoLkkPBto76Yq8NmSgwr5nMsZNpAXWeGRFBY4E8JJ");

// ─── MagicBlock ER validator address (devnet) ─────────────────────────────────
// Used in delegate_account to bind the Proof PDA to the ER validator.
const ER_VALIDATOR: &str = "vALiD8nwEovnfqDWwJ2DaEHFMQFcwwNMrLEKgRHfhDz";

#[program]
pub mod ai_skill_passport {
    use super::*;

    /// Called by the owner after uploading their report to IPFS.
    /// Each call creates a new Proof PDA keyed by nonce (timestamp),
    /// allowing multiple skill passports per wallet.
    pub fn add_proof(ctx: Context<AddProof>, hash: [u8; 32], price: u64, nonce: u64) -> Result<()> {
        let proof = &mut ctx.accounts.proof;
        proof.owner = ctx.accounts.owner.key();
        proof.hash = hash;
        proof.price = price;
        proof.nonce = nonce;
        Ok(())
    }

    /// Called by a viewer to pay SOL and unlock the full report.
    /// Kept for backward-compatibility; private SPL payments go via the
    /// MagicBlock Private Payments API (off-program route).
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

    // ─── Ephemeral Rollup lifecycle ─────────────────────────────────────────

    /// Delegate the Proof PDA to the MagicBlock Ephemeral Rollup.
    /// After this call the account is managed by the ER validator until
    /// `undelegate_proof` is called or the ER session ends.
    #[ephemeral]
    pub fn delegate_proof(ctx: Context<DelegateProof>) -> Result<()> {
        let pda_seeds: &[&[u8]] = &[
            b"proof",
            ctx.accounts.proof.owner.as_ref(),
            &ctx.accounts.proof.nonce.to_le_bytes(),
        ];

        delegate_account(
            &ctx.accounts.owner,
            &ctx.accounts.proof.to_account_info(),
            &ctx.accounts.owner,
            &ctx.accounts.buffer,
            &ctx.accounts.delegation_record,
            &ctx.accounts.delegation_metadata,
            &ctx.accounts.delegation_program,
            &ctx.accounts.system_program,
            pda_seeds,
            ctx.bumps["proof"],
            0,      // valid_until = 0 → no expiry
            30_000, // commit_frequency_ms = 30 s
        )?;
        Ok(())
    }

    /// Commit the current ER state to base-layer Devnet.
    /// Can be called permissionlessly; settles any in-flight ER changes.
    pub fn commit_proof(ctx: Context<CommitProof>) -> Result<()> {
        commit_accounts(
            &ctx.accounts.owner,
            vec![&ctx.accounts.proof.to_account_info()],
            &ctx.accounts.magic_context,
            &ctx.accounts.magic_program,
        )?;
        Ok(())
    }

    /// Undelegate the Proof PDA back to base-layer Devnet.
    /// Restores full on-chain access after an ER session.
    pub fn undelegate_proof(ctx: Context<UndelegateProof>) -> Result<()> {
        undelegate_accounts(
            &ctx.accounts.owner,
            vec![&ctx.accounts.proof.to_account_info()],
            &ctx.accounts.magic_context,
            &ctx.accounts.magic_program,
        )?;
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

#[derive(Accounts)]
pub struct DelegateProof<'info> {
    #[account(
        mut,
        seeds = [b"proof", proof.owner.as_ref(), &proof.nonce.to_le_bytes()],
        bump
    )]
    pub proof: Account<'info, Proof>,
    #[account(mut)]
    pub owner: Signer<'info>,
    /// CHECK: delegation buffer PDA (owned by delegation program)
    #[account(mut)]
    pub buffer: UncheckedAccount<'info>,
    /// CHECK: delegation record PDA
    #[account(mut)]
    pub delegation_record: UncheckedAccount<'info>,
    /// CHECK: delegation metadata PDA
    #[account(mut)]
    pub delegation_metadata: UncheckedAccount<'info>,
    /// CHECK: MagicBlock delegation program
    pub delegation_program: UncheckedAccount<'info>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct CommitProof<'info> {
    #[account(
        mut,
        seeds = [b"proof", proof.owner.as_ref(), &proof.nonce.to_le_bytes()],
        bump
    )]
    pub proof: Account<'info, Proof>,
    #[account(mut)]
    pub owner: Signer<'info>,
    /// CHECK: MagicBlock magic context
    #[account(mut)]
    pub magic_context: UncheckedAccount<'info>,
    /// CHECK: MagicBlock magic program
    pub magic_program: UncheckedAccount<'info>,
}

#[derive(Accounts)]
pub struct UndelegateProof<'info> {
    #[account(
        mut,
        seeds = [b"proof", proof.owner.as_ref(), &proof.nonce.to_le_bytes()],
        bump
    )]
    pub proof: Account<'info, Proof>,
    #[account(mut)]
    pub owner: Signer<'info>,
    /// CHECK: MagicBlock magic context
    #[account(mut)]
    pub magic_context: UncheckedAccount<'info>,
    /// CHECK: MagicBlock magic program
    pub magic_program: UncheckedAccount<'info>,
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
