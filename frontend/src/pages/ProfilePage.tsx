import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { useWallet, useConnection } from '@solana/wallet-adapter-react';
import toast from 'react-hot-toast';
import { motion, AnimatePresence } from 'framer-motion';
import { getProfile, buildUnlockTx, verifyUnlock, fetchReport, getSupportedLanguages, translateSummary } from '../lib/api';
import { sendAndConfirmBuiltTx } from '../lib/solana';
import { sha256Hex } from '../lib/hash';
import SkillTag from '../components/SkillTag';
import ScoreRing from '../components/ScoreRing';
import SkillRadar from '../components/SkillRadar';
import ExplorerLink from '../components/ExplorerLink';
import ShareButton from '../components/ShareButton';
import { useTheme } from '../lib/theme';
import type { SkillReport } from '../types';

interface Profile {
  hash: string;
  price: number;
  cid: string;
  nonce: number;
  skillReport: SkillReport;
}

interface FullReport extends SkillReport {}

// Pulsing skeleton block
function SkeletonPulse({ style }: { style: React.CSSProperties }) {
  return (
    <motion.div
      animate={{ opacity: [0.35, 0.65, 0.35] }}
      transition={{ duration: 1.6, repeat: Infinity, ease: 'easeInOut' }}
      style={{
        background: 'rgba(255,255,255,0.08)',
        borderRadius: '0.5rem',
        ...style,
      }}
    />
  );
}

function SkeletonLoader() {
  return (
    <motion.div
      className="glass"
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4 }}
      style={{ borderRadius: '1.5rem', padding: '2rem', maxWidth: '640px', margin: '0 auto' }}
    >
      {/* Avatar */}
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', marginBottom: '2rem' }}>
        <SkeletonPulse style={{ width: 80, height: 80, borderRadius: '50%', marginBottom: '1rem' }} />
        <SkeletonPulse style={{ width: 110, height: 14, borderRadius: '4px', marginBottom: '0.625rem' }} />
        <SkeletonPulse style={{ width: 90, height: 24, borderRadius: '9999px' }} />
      </div>
      {/* Skill pills */}
      <SkeletonPulse style={{ width: 52, height: 11, borderRadius: '3px', marginBottom: '0.625rem' }} />
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem', marginBottom: '1.5rem' }}>
        {[88, 110, 72, 95, 68, 84].map((w, i) => (
          <SkeletonPulse key={i} style={{ width: w, height: 28, borderRadius: '9999px' }} />
        ))}
      </div>
      {/* Summary lines */}
      <SkeletonPulse style={{ width: '100%', height: 13, borderRadius: '4px', marginBottom: '0.5rem' }} />
      <SkeletonPulse style={{ width: '88%', height: 13, borderRadius: '4px', marginBottom: '0.5rem' }} />
      <SkeletonPulse style={{ width: '70%', height: 13, borderRadius: '4px', marginBottom: '1.75rem' }} />
      {/* Score + price row */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <SkeletonPulse style={{ width: 120, height: 120, borderRadius: '50%' }} />
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', alignItems: 'flex-end' }}>
          <SkeletonPulse style={{ width: 70, height: 12, borderRadius: '4px' }} />
          <SkeletonPulse style={{ width: 100, height: 32, borderRadius: '0.75rem' }} />
        </div>
      </div>
    </motion.div>
  );
}

// Shared profile header extracted outside ProfilePage to avoid remount on state changes
interface ProfileHeaderProps {
  walletAddress: string;
  isDark: boolean;
  primaryColor: string;
  truncate: (addr: string) => string;
}

function ProfileHeader({ walletAddress, isDark, primaryColor, truncate }: ProfileHeaderProps) {
  return (
    <div style={{ textAlign: 'center', marginBottom: '2rem' }}>
      {/* Avatar */}
      <motion.div
        initial={{ scale: 0 }}
        animate={{ scale: 1 }}
        transition={{ type: 'spring', stiffness: 200, damping: 20, delay: 0.05 }}
        style={{
          width: '80px',
          height: '80px',
          borderRadius: '50%',
          background: 'linear-gradient(135deg, #14f070, #9945FF)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          margin: '0 auto 1rem',
          fontSize: '1.5rem',
          fontWeight: 700,
          color: '#0D0E12',
          fontFamily: isDark ? '"Space Grotesk", sans-serif' : '"Inter", sans-serif',
          boxShadow: isDark ? '0 0 24px rgba(20,241,112,0.15)' : '0 4px 16px rgba(13,74,165,0.15)',
        }}
      >
        {walletAddress?.slice(0, 2).toUpperCase()}
      </motion.div>

      <motion.p
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.35, delay: 0.1 }}
        style={{
          fontSize: '0.875rem',
          fontFamily: 'monospace',
          color: isDark ? '#94a3b8' : '#64748b',
          marginBottom: '0.25rem',
        }}
      >
        {truncate(walletAddress)}
      </motion.p>

      {/* Verified badge */}
      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.35, delay: 0.18 }}
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: '0.375rem',
          padding: '0.25rem 0.75rem',
          borderRadius: '9999px',
          border: `1px solid ${primaryColor}33`,
          background: isDark ? `${primaryColor}0D` : `${primaryColor}12`,
          fontSize: '0.75rem',
          fontWeight: 600,
          color: primaryColor,
          marginTop: '0.5rem',
          boxShadow: isDark ? 'none' : '0 1px 4px rgba(13,74,165,0.08)',
        }}
      >
        <span className="material-symbols-outlined" style={{ fontSize: '13px', fontVariationSettings: '"FILL" 1' }}>verified</span>
        Verified On-Chain
      </motion.div>
    </div>
  );
}

const skillEntranceContainer = {
  hidden: {},
  visible: { transition: { staggerChildren: 0.04, delayChildren: 0.05 } },
};

const skillEntranceItem = {
  hidden: { opacity: 0, y: 10 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.3, ease: [0.22, 1, 0.36, 1] as [number, number, number, number] } },
};

const skillFromLeftContainer = {
  hidden: {},
  visible: { transition: { staggerChildren: 0.04, delayChildren: 0.1 } },
};

const skillFromLeftItem = {
  hidden: { opacity: 0, x: -18 },
  visible: { opacity: 1, x: 0, transition: { duration: 0.3, ease: [0.22, 1, 0.36, 1] as [number, number, number, number] } },
};

function unlockStorageKey(cid: string) {
  return `credchain_unlock_${cid}`;
}

function saveUnlockToken(cid: string, token: string) {
  try {
    const payload = JSON.parse(atob(token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/')));
    const exp: number = payload.exp ?? Math.floor(Date.now() / 1000) + 3600;
    localStorage.setItem(unlockStorageKey(cid), JSON.stringify({ token, exp }));
  } catch {
    // ignore storage errors
  }
}

function loadUnlockToken(cid: string): string | null {
  try {
    const raw = localStorage.getItem(unlockStorageKey(cid));
    if (!raw) return null;
    const { token, exp } = JSON.parse(raw) as { token: string; exp: number };
    if (Math.floor(Date.now() / 1000) >= exp) {
      localStorage.removeItem(unlockStorageKey(cid));
      return null;
    }
    return token;
  } catch {
    return null;
  }
}

export default function ProfilePage() {
  const { walletAddress } = useParams<{ walletAddress: string }>();
  const { publicKey, sendTransaction } = useWallet();
  const { connection } = useConnection();
  const { theme } = useTheme();
  const isDark = theme === 'dark';
  // Suppress unused connection warning — kept for wallet adapter compatibility
  void connection;

  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [unlocked, setUnlocked] = useState(false);
  const [fullReport, setFullReport] = useState<FullReport | null>(null);
  const [unlockTxSig, setUnlockTxSig] = useState<string | null>(null);
  const [unlocking, setUnlocking] = useState(false);
  const [hashWarning, setHashWarning] = useState(false);

  // Translation state
  const [languages, setLanguages] = useState<Record<string, string>>({ en: 'English' });
  const [qvacTranslateAvailable, setQvacTranslateAvailable] = useState(false);
  const [selectedLang, setSelectedLang] = useState('en');
  const [translatedSummary, setTranslatedSummary] = useState<string | null>(null);
  const [translating, setTranslating] = useState(false);

  const primaryColor = isDark ? '#14f070' : '#0d4aa5';
  const isOwner = publicKey?.toBase58().toLowerCase() === walletAddress?.toLowerCase();

  useEffect(() => {
    getSupportedLanguages()
      .then(({ languages: langs, qvacAvailable }) => {
        setLanguages(langs);
        setQvacTranslateAvailable(qvacAvailable);
      })
      .catch(() => {/* silently ignore — feature degrades gracefully */});
  }, []);

  const handleLangChange = async (lang: string) => {
    setSelectedLang(lang);
    if (lang === 'en') { setTranslatedSummary(null); return; }
    const summary = (unlocked ? fullReport?.summary : profile?.skillReport.summary) ?? '';
    if (!summary) return;
    setTranslating(true);
    try {
      const { translated } = await translateSummary(summary, lang);
      setTranslatedSummary(translated);
    } catch { setTranslatedSummary(null); }
    finally { setTranslating(false); }
  };

  useEffect(() => {
    if (!walletAddress) return;
    getProfile(walletAddress)
      .then(async p => {
        setProfile(p);
        // Auto-unlock if a valid token is cached for this report
        const cached = loadUnlockToken(p.cid);
        if (cached) {
          try {
            const report = await fetchReport(p.cid, cached);
            setFullReport(report);
            setUnlocked(true);
          } catch {
            // Token rejected by backend (expired/invalid) — clear it silently
            localStorage.removeItem(unlockStorageKey(p.cid));
          }
        }
      })
      .catch(err => {
        if (err?.response?.status === 404) setNotFound(true);
        else toast.error('Failed to load profile');
      })
      .finally(() => setLoading(false));
  }, [walletAddress]);

  const handleOwnerUnlock = async () => {
    if (!profile) return;
    setUnlocking(true);
    try {
      const r = await fetch(`https://gateway.pinata.cloud/ipfs/${profile.cid}`);
      const report: FullReport = await r.json();
      const computed = await sha256Hex(JSON.stringify(report));
      if (computed !== profile.hash) {
        // Warn instead of blocking so users can still inspect data while seeing integrity risk.
        setHashWarning(true);
        toast.error('⚠️ Hash mismatch — report may have been tampered with!', { duration: 8000 });
      }
      setFullReport(report);
      setUnlocked(true);
    } catch {
      toast.error('Failed to load your report');
    } finally {
      setUnlocking(false);
    }
  };

  const handleUnlock = async () => {
    if (!publicKey) {
      toast.error('Connect your wallet to unlock');
      return;
    }
    if (!profile || !walletAddress) return;

    setUnlocking(true);
    try {
      // ── Step 1: Build unsigned private SPL transfer tx via MagicBlock ────────
      toast.loading('Building private payment…', { id: 'unlock' });
      let txPayload;
      try {
        txPayload = await buildUnlockTx(publicKey.toBase58(), walletAddress);
      } catch (err: any) {
        toast.error(err?.response?.data?.error || 'Failed to build transaction', { id: 'unlock' });
        setUnlocking(false);
        return;
      }

      // ── Step 2: Wallet signs and submits the transaction ──────────────────
      toast.loading('Sign the transaction in your wallet…', { id: 'unlock' });
      let sig: string;
      try {
        sig = await sendAndConfirmBuiltTx(
          txPayload.transactionBase64,
          txPayload.sendTo,
          sendTransaction
        );
      } catch (err: any) {
        toast.dismiss('unlock');
        if (err?.message?.includes('User rejected') || err?.message?.includes('cancelled')) {
          toast.error('Transaction cancelled');
        } else {
          toast.error('Transaction failed: ' + err?.message);
        }
        setUnlocking(false);
        return;
      }

      setUnlockTxSig(sig);
      toast.loading('Verifying private payment…', { id: 'unlock' });

      // ── Step 3: Backend verifies SPL transfer and returns JWT ─────────────
      const { token } = await verifyUnlock(
        sig,
        publicKey.toBase58(),
        walletAddress,
        txPayload.sendTo,
        txPayload.amountUnits
      );

      toast.dismiss('unlock');
      saveUnlockToken(profile.cid, token);
      const report = await fetchReport(profile.cid, token);

      const computed = await sha256Hex(JSON.stringify(report));
      if (computed !== profile.hash) {
        setHashWarning(true);
        toast.error('⚠️ Hash mismatch — report may have been tampered with!', { duration: 8000 });
      }

      setFullReport(report);
      setUnlocked(true);
      toast.success('🔒 Report unlocked via private payment!');
    } catch (err: any) {
      toast.dismiss('unlock');
      toast.error(err?.response?.data?.error || err?.message || 'Unlock failed');
    } finally {
      setUnlocking(false);
    }
  };

  const truncate = (addr: string) => `${addr.slice(0, 4)}...${addr.slice(-4)}`;

  // ─── Loading ────────────────────────────────────────────────────────────────
  if (loading) {
    return (
      <main className="page-x-pad" style={{ minHeight: '100vh', paddingTop: '88px', paddingBottom: '4rem' }}>
        <SkeletonLoader />
      </main>
    );
  }

  // ─── Not Found ──────────────────────────────────────────────────────────────
  if (notFound || !profile) {
    return (
      <main className="page-x-pad" style={{ minHeight: '100vh', paddingTop: '88px', paddingBottom: '4rem', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <motion.div
          className="glass"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1, x: [0, -8, 8, -4, 4, 0] }}
          transition={{
            opacity: { duration: 0.3 },
            x: { duration: 0.5, delay: 0.25 },
          }}
          style={{ borderRadius: '1.5rem', padding: '3rem', textAlign: 'center', maxWidth: '420px' }}
        >
          <span className="material-symbols-outlined" style={{ fontSize: '48px', opacity: 0.55, display: 'block', marginBottom: '1rem' }}>
            person_off
          </span>
          <h2 style={{ fontFamily: '"Space Grotesk", sans-serif', fontWeight: 700, marginBottom: '0.5rem' }}>Profile Not Found</h2>
          <p style={{ color: 'var(--text-muted)', fontSize: '0.9375rem' }}>
            No on-chain proof found for {walletAddress ? truncate(walletAddress) : 'this wallet'}.
          </p>
        </motion.div>
      </main>
    );
  }

  const report = unlocked ? fullReport! : profile.skillReport;

  return (
    <main className="page-x-pad" style={{ minHeight: '100vh', paddingTop: '88px', paddingBottom: '4rem' }}>
      <div style={{ maxWidth: unlocked ? '780px' : '640px', margin: '0 auto' }}>
        {/* Hash warning — slides down from above */}
        <AnimatePresence>
          {hashWarning && (
            <motion.div
              initial={{ opacity: 0, y: -16 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -16 }}
              transition={{ type: 'spring', stiffness: 380, damping: 30 }}
              style={{
                padding: '0.875rem 1.25rem',
                borderRadius: '0.75rem',
                background: 'rgba(239,68,68,0.1)',
                border: '1px solid rgba(239,68,68,0.3)',
                color: '#f87171',
                marginBottom: '1.5rem',
                fontSize: '0.875rem',
                display: 'flex',
                alignItems: 'center',
                gap: '0.5rem',
              }}
            >
              <span className="material-symbols-outlined" style={{ fontSize: '18px' }}>warning</span>
              Hash mismatch — this report may have been tampered with. Verify independently before trusting.
            </motion.div>
          )}
        </AnimatePresence>

        <AnimatePresence mode="wait">
          {!unlocked ? (
            /* ─── Locked View ─────────────────────────────────────────────── */
            <motion.div
              key="locked"
              initial={{ opacity: 0, y: 24 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, x: -24 }}
              transition={{ duration: 0.4, ease: [0.22, 1, 0.36, 1] }}
            >
              <div className="glass" style={{ borderRadius: '1.5rem', padding: '2rem' }}>
                <ProfileHeader
                  walletAddress={walletAddress!}
                  isDark={isDark}
                  primaryColor={primaryColor}
                  truncate={truncate}
                />

                {/* Skills */}
                <div style={{ marginBottom: '1.5rem' }}>
                  <p style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: '0.75rem' }}>
                    Skills
                  </p>
                  <motion.div
                    variants={skillEntranceContainer}
                    initial="hidden"
                    animate="visible"
                    style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem' }}
                  >
                    {report.skills.map(s => (
                      <motion.div key={s} variants={skillEntranceItem}>
                        <SkillTag skill={s} />
                      </motion.div>
                    ))}
                  </motion.div>
                </div>

                {/* Summary */}
                <motion.p
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  transition={{ duration: 0.5, delay: 0.3 }}
                  style={{ fontSize: '0.9375rem', lineHeight: 1.6, marginBottom: '1.5rem', color: 'var(--text-body)' }}
                >
                  {report.summary}
                </motion.p>

                {/* Score ring (locked) + price */}
                <motion.div
                  initial={{ opacity: 0, y: 12 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.4, delay: 0.35 }}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    padding: '1.25rem',
                    borderRadius: '1rem',
                    background: isDark ? 'rgba(255,255,255,0.03)' : 'rgba(255,255,255,0.6)',
                    border: isDark ? '1px solid rgba(255,255,255,0.06)' : '1px solid rgba(226,232,240,0.8)',
                    boxShadow: isDark ? 'none' : '0 2px 10px rgba(13,74,165,0.05)',
                    marginBottom: '1.5rem',
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
                    {/* Locked score ring with pulsing lock */}
                    <div style={{ position: 'relative' }}>
                      <ScoreRing score={0} locked={true} />
                    </div>
                    <div>
                      <p style={{ fontWeight: 600, fontFamily: isDark ? '"Space Grotesk", sans-serif' : '"Inter", sans-serif', marginBottom: '0.25rem' }}>Score Hidden</p>
                      <p style={{ fontSize: '0.8125rem', color: 'var(--text-muted)' }}>Unlock to reveal</p>
                    </div>
                  </div>
                  <div style={{ textAlign: 'right' }}>
                    <p style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginBottom: '0.25rem' }}>Unlock Price</p>
                    <p style={{ fontFamily: isDark ? '"Space Grotesk", sans-serif' : '"Inter", sans-serif', fontWeight: 700, fontSize: '1.25rem', color: primaryColor }}>
                      {(profile.price / 1_000_000).toFixed(2)} USDC
                    </p>
                    {/* MagicBlock Private Payment badge */}
                    <div style={{
                      display: 'inline-flex', alignItems: 'center', gap: '0.3rem',
                      fontSize: '0.6875rem', fontWeight: 700,
                      color: '#9945FF',
                      border: '1px solid rgba(153,69,255,0.35)',
                      borderRadius: '9999px',
                      padding: '0.15rem 0.55rem',
                      background: 'rgba(153,69,255,0.08)',
                      marginTop: '0.375rem',
                      letterSpacing: '0.03em',
                    }}>
                      <span style={{ fontSize: '11px' }}>🔒</span> Private · MagicBlock PER
                    </div>
                  </div>
                </motion.div>

                {/* Unlock button */}
                <motion.div
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.35, delay: 0.42 }}
                >
                  {isOwner ? (
                    <motion.button
                      className="gradient-btn"
                      onClick={handleOwnerUnlock}
                      disabled={unlocking}
                      whileHover={!unlocking ? {
                        boxShadow: isDark
                          ? '0 0 0 2px rgba(20,241,112,0.5), 0 0 28px rgba(20,241,112,0.25)'
                          : '0 0 0 2px rgba(13,74,165,0.5), 0 0 28px rgba(13,74,165,0.2)',
                      } : {}}
                      whileTap={!unlocking ? { scale: 0.97 } : {}}
                      style={{ width: '100%', justifyContent: 'center', opacity: unlocking ? 0.7 : 1 }}
                    >
                      {unlocking ? (
                        <>
                          <span style={{ width: '16px', height: '16px', borderRadius: '50%', border: '2px solid rgba(0,0,0,0.3)', borderTopColor: '#0D0E12', animation: 'spin 0.8s linear infinite', display: 'inline-block' }} />
                          Loading…
                        </>
                      ) : (
                        <>
                          <span className="material-symbols-outlined" style={{ fontSize: '18px' }}>lock_open</span>
                          View My Full Report (Free)
                        </>
                      )}
                    </motion.button>
                  ) : (
                    <motion.button
                      className="gradient-btn"
                      onClick={handleUnlock}
                      disabled={unlocking}
                      whileHover={!unlocking ? {
                        boxShadow: isDark
                          ? '0 0 0 2px rgba(20,241,112,0.5), 0 0 28px rgba(20,241,112,0.25)'
                          : '0 0 0 2px rgba(13,74,165,0.5), 0 0 28px rgba(13,74,165,0.2)',
                      } : {}}
                      whileTap={!unlocking ? { scale: 0.97 } : {}}
                      style={{ width: '100%', justifyContent: 'center', opacity: unlocking ? 0.7 : 1 }}
                    >
                      {unlocking ? (
                        <>
                          <span style={{ width: '16px', height: '16px', borderRadius: '50%', border: '2px solid rgba(0,0,0,0.3)', borderTopColor: '#0D0E12', animation: 'spin 0.8s linear infinite', display: 'inline-block' }} />
                          Confirming…
                        </>
                      ) : (
                        <>
                          <span className="material-symbols-outlined" style={{ fontSize: '18px' }}>lock_open</span>
                          Unlock Full Report ({(profile.price / 1_000_000).toFixed(2)} USDC)
                        </>
                      )}
                    </motion.button>
                  )}
                </motion.div>
              </div>

              {isOwner && (
                <motion.div
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  transition={{ delay: 0.5 }}
                  style={{ display: 'flex', justifyContent: 'center', marginTop: '1.5rem' }}
                >
                  <ShareButton />
                </motion.div>
              )}
            </motion.div>
          ) : (
            /* ─── Unlocked View ───────────────────────────────────────────── */
            <motion.div
              key="unlocked"
              initial={{ opacity: 0, x: 24 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ duration: 0.45, ease: [0.22, 1, 0.36, 1] }}
            >
              <motion.div
                className="glass"
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.45, ease: [0.22, 1, 0.36, 1] }}
                style={{ borderRadius: '1.5rem', padding: '2rem', marginBottom: '1.5rem' }}
              >
                <ProfileHeader
                  walletAddress={walletAddress!}
                  isDark={isDark}
                  primaryColor={primaryColor}
                  truncate={truncate}
                />

                {/* Score ring + summary */}
                <motion.div
                  className="profile-score-row"
                  initial={{ opacity: 0, y: 16 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.4, delay: 0.15 }}
                >
                  <ScoreRing score={fullReport!.score} locked={false} />
                  <div style={{ flex: 1 }}>
                    {/* ── Language selector row ── */}
                    <div style={{
                      display: 'flex', alignItems: 'center', gap: '0.625rem',
                      marginBottom: '0.875rem', flexWrap: 'wrap',
                      padding: '0.625rem 0.875rem',
                      borderRadius: '0.875rem',
                      background: isDark ? 'rgba(255,255,255,0.04)' : 'rgba(0,0,0,0.03)',
                      border: isDark ? '1px solid rgba(255,255,255,0.08)' : '1px solid rgba(0,0,0,0.07)',
                    }}>
                      <span className="material-symbols-outlined" style={{ fontSize: '18px', color: primaryColor, fontVariationSettings: '"FILL" 1', flexShrink: 0 }}>
                        translate
                      </span>
                      <span style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em', flexShrink: 0 }}>
                        Language
                      </span>
                      <select
                        value={selectedLang}
                        onChange={e => handleLangChange(e.target.value)}
                        disabled={translating}
                        style={{
                          fontSize: '0.875rem',
                          fontWeight: 500,
                          padding: '0.35rem 0.75rem',
                          borderRadius: '0.625rem',
                          border: `1px solid ${primaryColor}44`,
                          background: isDark ? '#0D0E12' : '#fff',
                          color: isDark ? '#e2e8f0' : '#0f172a',
                          cursor: 'pointer',
                          outline: 'none',
                          flex: 1,
                          minWidth: '140px',
                          appearance: 'auto',
                        }}
                      >
                        {Object.entries(languages).map(([code, name]) => (
                          <option key={code} value={code} style={{ background: isDark ? '#0D0E12' : '#fff', color: isDark ? '#e2e8f0' : '#0f172a' }}>
                            {name}
                          </option>
                        ))}
                      </select>
                      {translating ? (
                        <motion.span
                          className="material-symbols-outlined"
                          style={{ fontSize: '16px', color: primaryColor, flexShrink: 0 }}
                          animate={{ rotate: 360 }}
                          transition={{ duration: 1, repeat: Infinity, ease: 'linear' }}
                        >
                          progress_activity
                        </motion.span>
                      ) : selectedLang !== 'en' ? (
                        <span style={{
                          fontSize: '0.6875rem', fontWeight: 700,
                          color: primaryColor,
                          border: `1px solid ${primaryColor}44`,
                          borderRadius: '9999px',
                          padding: '0.15rem 0.55rem',
                          background: isDark ? 'rgba(20,241,112,0.07)' : 'rgba(13,74,165,0.07)',
                          letterSpacing: '0.04em',
                          flexShrink: 0,
                        }}>
                          {qvacTranslateAvailable ? 'QVAC local' : 'AI translated'}
                        </span>
                      ) : null}
                    </div>

                    {/* Summary */}
                    <p style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: '0.5rem' }}>
                      Summary
                    </p>
                    <p style={{ fontSize: '0.9375rem', lineHeight: 1.6, color: 'var(--text-body)' }}>
                      {translatedSummary ?? fullReport!.summary}
                    </p>
                  </div>
                </motion.div>

                {/* Skills — stagger from left */}
                <motion.div
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  transition={{ duration: 0.3, delay: 0.2 }}
                  style={{ marginBottom: '1.75rem' }}
                >
                  <p style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: '0.75rem' }}>
                    Skills
                  </p>
                  <motion.div
                    variants={skillFromLeftContainer}
                    initial="hidden"
                    animate="visible"
                    style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem' }}
                  >
                    {fullReport!.skills.map(s => (
                      <motion.div key={s} variants={skillFromLeftItem}>
                        <SkillTag skill={s} />
                      </motion.div>
                    ))}
                  </motion.div>
                </motion.div>

                {/* Radar */}
                {fullReport!.skills.length >= 3 && (
                  <motion.div
                    className="skill-radar-wrap"
                    initial={{ opacity: 0, scale: 0.9 }}
                    animate={{ opacity: 1, scale: 1 }}
                    transition={{ duration: 0.6, delay: 0.3, ease: [0.22, 1, 0.36, 1] }}
                    style={{ marginBottom: '1.75rem' }}
                  >
                    <SkillRadar skills={fullReport!.skills.slice(0, 5)} />
                  </motion.div>
                )}

                {/* Footer */}
                <motion.div
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  transition={{ duration: 0.4, delay: 0.5 }}
                  style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '1rem' }}
                >
                  {unlockTxSig && (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.375rem' }}>
                      <ExplorerLink txSignature={unlockTxSig} label="View unlock tx →" />
                      {/* Privacy badge shown after unlock */}
                      <div style={{
                        display: 'inline-flex', alignItems: 'center', gap: '0.3rem',
                        fontSize: '0.6875rem', fontWeight: 700,
                        color: '#9945FF',
                        border: '1px solid rgba(153,69,255,0.35)',
                        borderRadius: '9999px',
                        padding: '0.2rem 0.65rem',
                        background: 'rgba(153,69,255,0.08)',
                        width: 'fit-content',
                      }}>
                        🔒 Paid via MagicBlock Private Ephemeral Rollup
                      </div>
                    </div>
                  )}
                  {isOwner && <ShareButton />}
                </motion.div>
              </motion.div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </main>
  );
}
