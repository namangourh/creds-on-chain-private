import { useState, useRef, useCallback, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useWallet, useConnection } from '@solana/wallet-adapter-react';
import toast from 'react-hot-toast';
import { motion, AnimatePresence } from 'framer-motion';
import { uploadResume, uploadGithub, registerProof } from '../lib/api';
import { buildAddProofTx, solToLamports } from '../lib/solana';
import ProgressSteps from '../components/ProgressSteps';
import ExplorerLink from '../components/ExplorerLink';
import ShareButton from '../components/ShareButton';
import SkillTag from '../components/SkillTag';
import { useTheme } from '../lib/theme';
import type { SkillReport } from '../types';

type View = 'form' | 'processing' | 'success';
type InputTab = 'resume' | 'github';


interface SuccessData {
  skillReport: SkillReport;
  txSignature: string;
  walletAddress: string;
}

// Deterministic pseudo-random for confetti positions
function seededRand(seed: number): number {
  const x = Math.sin(seed + 1) * 10000;
  return x - Math.floor(x);
}

// Cycling typewriter phrases shown during processing
function TypewriterText() {
  const phrases = ['Extracting skills…', 'Building your profile…', 'Almost there…', 'Anchoring to Solana…'];
  const [phraseIndex, setPhraseIndex] = useState(0);
  const [visible, setVisible] = useState(true);

  useEffect(() => {
    const interval = setInterval(() => {
      setVisible(false);
      setTimeout(() => {
        setPhraseIndex(i => (i + 1) % phrases.length);
        setVisible(true);
      }, 380);
    }, 2600);
    return () => clearInterval(interval);
  }, []);

  return (
    <AnimatePresence mode="wait">
      {visible && (
        <motion.p
          key={phraseIndex}
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -8 }}
          transition={{ duration: 0.3 }}
          style={{ fontSize: '0.875rem', color: 'var(--text-body)', fontFamily: '"Space Grotesk", sans-serif', textAlign: 'center', marginTop: '0.5rem' }}
        >
          {phrases[phraseIndex]}
        </motion.p>
      )}
    </AnimatePresence>
  );
}

// Confetti burst of colored dots on success
function ConfettiBurst() {
  const colors = ['#14f070', '#9945FF', '#f59e0b', '#3b82f6', '#ec4899', '#10b981'];
  return (
    <div style={{ position: 'absolute', top: '10%', left: '50%', pointerEvents: 'none', zIndex: 10 }}>
      {Array.from({ length: 22 }, (_, i) => {
        const angle = (i / 22) * Math.PI * 2;
        const dist = 55 + seededRand(i * 7) * 65;
        const color = colors[i % colors.length];
        const size = 5 + seededRand(i * 5) * 5;
        const isRound = seededRand(i * 9) > 0.5;
        return (
          <motion.div
            key={i}
            initial={{ x: 0, y: 0, opacity: 1, scale: 1 }}
            animate={{
              x: Math.cos(angle) * dist,
              y: Math.sin(angle) * dist,
              opacity: 0,
              scale: 0,
            }}
            transition={{ duration: 0.75, ease: 'easeOut', delay: seededRand(i * 3) * 0.25 }}
            style={{
              position: 'absolute',
              width: size,
              height: size,
              borderRadius: isRound ? '50%' : '2px',
              background: color,
            }}
          />
        );
      })}
    </div>
  );
}

const skillTagContainerVariants = {
  hidden: {},
  visible: { transition: { staggerChildren: 0.05, delayChildren: 0.15 } },
};

const skillTagVariant = {
  hidden: { scale: 0, opacity: 0 },
  visible: { scale: 1, opacity: 1, transition: { type: 'spring' as const, stiffness: 380, damping: 18 } },
};

export default function UploadPage() {
  const navigate = useNavigate();
  const { publicKey, sendTransaction } = useWallet();
  const { connection } = useConnection();
  const { theme } = useTheme();
  const isDark = theme === 'dark';

  const [view, setView] = useState<View>('form');
  const [tab, setTab] = useState<InputTab>('resume');
  const [file, setFile] = useState<File | null>(null);
  const [dragging, setDragging] = useState(false);
  const [justDropped, setJustDropped] = useState(false);
  const [githubUsername, setGithubUsername] = useState('');
  const [priceSOL, setPriceSOL] = useState('0.01');
  const [step, setStep] = useState(0);
  const [successData, setSuccessData] = useState<SuccessData | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const primaryColor = isDark ? '#14f070' : '#0d4aa5';

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setDragging(false);
    const dropped = e.dataTransfer.files[0];
    const accepted = dropped?.type === 'application/pdf' || dropped?.type?.startsWith('image/');
    if (accepted) {
      setFile(dropped);
      setJustDropped(true);
      setTimeout(() => setJustDropped(false), 500);
    } else {
      toast.error('Please upload a PDF or image file (JPEG, PNG, etc.)');
    }
  }, []);

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (f) {
      if (f.size > 10 * 1024 * 1024) {
        toast.error('File must be under 10 MB');
        return;
      }
      setFile(f);
      setJustDropped(true);
      setTimeout(() => setJustDropped(false), 500);
    }
  };

  const handleSubmit = async () => {
    if (!publicKey) {
      toast.error('Connect your wallet first');
      return;
    }

    if (tab === 'resume' && !file) {
      toast.error('Please select a PDF file');
      return;
    }
    if (tab === 'github' && !githubUsername.trim()) {
      toast.error('Please enter a GitHub username');
      return;
    }

    // Convert once and carry lamports end-to-end so tx and UI use the same value source.
    const price = parseFloat(priceSOL);
    if (isNaN(price) || price < 0) {
      toast.error('Invalid price');
      return;
    }
    const priceLamports = solToLamports(price);

    setView('processing');
    setStep(1);

    try {
      // Step 1: Parsing
      await new Promise(r => setTimeout(r, 300));
      setStep(2);

      // Steps 1-3: Upload to backend
      let result: { skillReport: SkillReport; cid: string; hash: string };
      if (tab === 'resume') {
        result = await uploadResume(file!, priceLamports);
      } else {
        result = await uploadGithub(githubUsername.trim(), priceLamports);
      }
      setStep(3);
      await new Promise(r => setTimeout(r, 300));
      setStep(4);

      // Step 4: Wallet signature
      // Date.now nonce gives practical uniqueness for PDA derivation in a hackathon context.
      const nonce = Date.now();
      const tx = await buildAddProofTx(connection, publicKey, result.hash, priceLamports, nonce);
      let sig: string;
      try {
        sig = await sendTransaction(tx, connection);
      } catch (err: any) {
        const msg: string = err?.message ?? '';
        if (msg.includes('User rejected') || msg.includes('cancelled')) {
          toast.error('Transaction cancelled');
        } else if (msg.toLowerCase().includes('not enough') || msg.toLowerCase().includes('insufficient') || msg.toLowerCase().includes('0x1')) {
          toast.error('Not enough SOL. Make sure Phantom is set to Devnet and your wallet has SOL. Visit faucet.solana.com to airdrop.', { duration: 10000 });
        } else {
          const logs: string[] = err?.logs ?? err?.transactionError?.logs ?? [];
          const logSummary = logs.length ? '\n' + logs.slice(-3).join('\n') : '';
          console.error('[sendTransaction] error:', msg, logs);
          toast.error('Transaction failed: ' + msg + logSummary, { duration: 8000 });
        }
        setView('form');
        setStep(0);
        return;
      }

      setStep(5);

      // Step 5: Confirm on-chain
      // Wait for confirmation before register call so backend only records finalized intents.
      await connection.confirmTransaction(sig, 'confirmed');

      // Register with backend
      // Backend persists cid+nonce so profile endpoint can find the matching proof account.
      await registerProof(publicKey.toBase58(), result.cid, sig, nonce);

      setSuccessData({
        skillReport: result.skillReport,
        txSignature: sig,
        walletAddress: publicKey.toBase58(),
      });
      setView('success');
    } catch (err: any) {
      toast.error(err?.response?.data?.error || err?.message || 'Something went wrong');
      setView('form');
      setStep(0);
    }
  };

  // ─── Form View ─────────────────────────────────────────────────────────────
  if (view === 'form') {
    return (
      <main className="page-x-pad" style={{ minHeight: '100vh', paddingTop: '88px', paddingBottom: '4rem' }}>
        <div style={{ maxWidth: '900px', margin: '0 auto' }}>
          <motion.div
            initial={{ opacity: 0, y: 18 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.4, ease: [0.22, 1, 0.36, 1] }}
          >
            <h1
              style={{
                fontFamily: isDark ? '"Space Grotesk", sans-serif' : '"Inter", sans-serif',
                fontSize: 'clamp(1.75rem, 4vw, 2.5rem)',
                fontWeight: 700,
                letterSpacing: isDark ? '-0.03em' : '-0.02em',
                marginBottom: '0.5rem',
              }}
            >
              Create Your <span className="gradient-text">Creds</span>
            </h1>
            <p style={{ color: 'var(--text-muted)', marginBottom: '2.5rem', fontSize: '1rem' }}>
              Upload a PDF, scanned image, or GitHub username — analyzed locally by QVAC AI, anchored on Solana.
            </p>
          </motion.div>

          <div className="upload-grid">
            {/* Left panel */}
            <motion.div
              className="glass upload-form-panel"
              initial={{ opacity: 0, x: -24 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ duration: 0.45, delay: 0.1, ease: [0.22, 1, 0.36, 1] }}
            >
              {/* Tabs with layoutId indicator */}
              <div
                style={{
                  display: 'flex',
                  gap: '1.5rem',
                  borderBottom: isDark ? '1px solid rgba(255,255,255,0.08)' : '1px solid rgba(0,0,0,0.08)',
                  marginBottom: '1.75rem',
                  position: 'relative',
                }}
              >
                {(['resume', 'github'] as InputTab[]).map(t => (
                  <button
                    key={t}
                    onClick={() => setTab(t)}
                    style={{
                      background: 'none',
                      border: 'none',
                      cursor: 'pointer',
                      paddingBottom: '0.75rem',
                      fontSize: '0.9375rem',
                      fontFamily: '"Space Grotesk", sans-serif',
                      fontWeight: tab === t ? 600 : 400,
                      color:
                        tab === t
                          ? primaryColor
                          : isDark
                          ? 'rgba(255,255,255,0.7)'
                          : 'rgba(0,0,0,0.4)',
                      transition: 'color 0.2s',
                      position: 'relative',
                    }}
                  >
                    <span className="material-symbols-outlined" style={{ fontSize: '16px', verticalAlign: 'middle', marginRight: '0.375rem' }}>
                      {t === 'resume' ? 'description' : 'code'}
                    </span>
                    {t === 'resume' ? 'Resume PDF' : 'GitHub'}
                    {tab === t && (
                      <motion.div
                        layoutId="tab-indicator"
                        style={{
                          position: 'absolute',
                          bottom: -1,
                          left: 0,
                          right: 0,
                          height: '2px',
                          background: primaryColor,
                          borderRadius: '1px',
                        }}
                        transition={{ type: 'spring', stiffness: 500, damping: 30 }}
                      />
                    )}
                  </button>
                ))}
              </div>

              <AnimatePresence mode="wait">
                {tab === 'resume' ? (
                  <motion.div
                    key="resume"
                    initial={{ opacity: 0, x: -10 }}
                    animate={{ opacity: 1, x: 0 }}
                    exit={{ opacity: 0, x: 10 }}
                    transition={{ duration: 0.2 }}
                  >
                    {/* Animated drag zone */}
                    <motion.div
                      onDragOver={e => { e.preventDefault(); setDragging(true); }}
                      onDragLeave={() => setDragging(false)}
                      onDrop={handleDrop}
                      onClick={() => fileInputRef.current?.click()}
                      animate={{
                        borderColor: dragging
                          ? primaryColor
                          : file
                          ? primaryColor
                          : isDark ? 'rgba(255,255,255,0.15)' : 'rgba(0,0,0,0.15)',
                        boxShadow: dragging
                          ? `0 0 24px ${isDark ? 'rgba(20,241,112,0.18)' : 'rgba(13,74,165,0.14)'}`
                          : 'none',
                        backgroundColor: dragging
                          ? isDark ? 'rgba(20,241,112,0.05)' : 'rgba(13,74,165,0.04)'
                          : 'transparent',
                      }}
                      transition={{ duration: 0.2 }}
                      style={{
                        border: `2px dashed ${isDark ? 'rgba(255,255,255,0.15)' : 'rgba(0,0,0,0.15)'}`,
                        borderRadius: '1rem',
                        padding: '2.5rem 1.5rem',
                        textAlign: 'center',
                        cursor: 'pointer',
                        marginBottom: '1rem',
                      }}
                    >
                      <motion.span
                        className="material-symbols-outlined"
                        animate={justDropped ? { scale: [1, 1.35, 1] } : { scale: 1 }}
                        transition={{ duration: 0.4, ease: 'easeOut' }}
                        style={{
                          fontSize: '40px',
                          color: file ? primaryColor : isDark ? 'rgba(255,255,255,0.6)' : 'rgba(0,0,0,0.55)',
                          fontVariationSettings: '"FILL" 1',
                          display: 'block',
                          marginBottom: '0.75rem',
                        }}
                      >
                        {file ? 'check_circle' : 'cloud_upload'}
                      </motion.span>
                      {file ? (
                        <p style={{ fontWeight: 600, color: primaryColor }}>
                          {file.type.startsWith('image/') ? `📷 ${file.name}` : file.name}
                        </p>
                      ) : (
                        <>
                          <p style={{ fontWeight: 500, marginBottom: '0.25rem' }}>Drop PDF or image here or click to browse</p>
                          <p style={{ fontSize: '0.8125rem', color: 'var(--text-muted)' }}>PDF or image (JPEG, PNG) · Max 10 MB</p>
                        </>
                      )}
                    </motion.div>
                    <input
                      ref={fileInputRef}
                      type="file"
                      accept="application/pdf,image/jpeg,image/jpg,image/png,image/tiff,image/bmp,image/webp"
                      onChange={handleFileSelect}
                      style={{ display: 'none' }}
                    />
                  </motion.div>
                ) : (
                  <motion.div
                    key="github"
                    initial={{ opacity: 0, x: 10 }}
                    animate={{ opacity: 1, x: 0 }}
                    exit={{ opacity: 0, x: -10 }}
                    transition={{ duration: 0.2 }}
                    style={{ marginBottom: '1rem' }}
                  >
                    <label style={{ display: 'block', fontSize: '0.875rem', fontWeight: 500, marginBottom: '0.5rem', color: 'var(--text-body)' }}>
                      GitHub Username
                    </label>
                    <div style={{ position: 'relative' }}>
                      <span
                        style={{
                          position: 'absolute',
                          left: '1rem',
                          top: '50%',
                          transform: 'translateY(-50%)',
                          opacity: 0.65,
                          fontWeight: 600,
                          fontSize: '1rem',
                        }}
                      >
                        @
                      </span>
                      <input
                        className="glass-input"
                        style={{ paddingLeft: '2.25rem' }}
                        placeholder="your-username"
                        value={githubUsername}
                        onChange={e => setGithubUsername(e.target.value)}
                      />
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>

              {/* Price input */}
              <div style={{ marginBottom: '1.75rem' }}>
                <label style={{ display: 'block', fontSize: '0.875rem', fontWeight: 500, marginBottom: '0.5rem', color: 'var(--text-muted)' }}>
                  Unlock Price (SOL)
                </label>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                  {/* Decrement */}
                  <motion.button
                    type="button"
                    onClick={() => setPriceSOL(v => Math.max(0, parseFloat(v || '0') - 0.01).toFixed(3))}
                    whileHover={{ scale: 1.08 }}
                    whileTap={{ scale: 0.93 }}
                    transition={{ type: 'spring', stiffness: 400, damping: 18 }}
                    style={{
                      flexShrink: 0,
                      width: '2.25rem',
                      height: '2.25rem',
                      borderRadius: '0.625rem',
                      border: isDark ? '1px solid rgba(255,255,255,0.12)' : '1px solid rgba(0,0,0,0.1)',
                      background: isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.04)',
                      color: 'var(--text-body)',
                      cursor: 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      fontSize: '1.1rem',
                      fontWeight: 500,
                      lineHeight: 1,
                    }}
                  >
                    −
                  </motion.button>

                  {/* Value input */}
                  <div style={{ position: 'relative', flex: 1 }}>
                    <input
                      className="glass-input"
                      style={{ paddingRight: '3.25rem', textAlign: 'center' }}
                      type="number"
                      min="0"
                      step="0.001"
                      value={priceSOL}
                      onChange={e => setPriceSOL(e.target.value)}
                    />
                    <span
                      style={{
                        position: 'absolute',
                        right: '0.875rem',
                        top: '50%',
                        transform: 'translateY(-50%)',
                        fontSize: '0.75rem',
                        fontWeight: 600,
                        letterSpacing: '0.04em',
                        opacity: 0.55,
                        pointerEvents: 'none',
                      }}
                    >
                      SOL
                    </span>
                  </div>

                  {/* Increment */}
                  <motion.button
                    type="button"
                    onClick={() => setPriceSOL(v => (parseFloat(v || '0') + 0.01).toFixed(3))}
                    whileHover={{ scale: 1.08 }}
                    whileTap={{ scale: 0.93 }}
                    transition={{ type: 'spring', stiffness: 400, damping: 18 }}
                    style={{
                      flexShrink: 0,
                      width: '2.25rem',
                      height: '2.25rem',
                      borderRadius: '0.625rem',
                      border: `1px solid ${isDark ? 'rgba(20,241,112,0.3)' : 'rgba(13,74,165,0.25)'}`,
                      background: isDark ? 'rgba(20,241,112,0.08)' : 'rgba(13,74,165,0.06)',
                      color: primaryColor,
                      cursor: 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      fontSize: '1.1rem',
                      fontWeight: 500,
                      lineHeight: 1,
                    }}
                  >
                    +
                  </motion.button>
                </div>
                <p style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: '0.375rem' }}>
                  Viewers will pay this amount to unlock your full report
                </p>
              </div>

              <motion.button
                className="neon-btn"
                onClick={handleSubmit}
                whileHover={{ scale: 1.02 }}
                whileTap={{ scale: 0.97 }}
                transition={{ type: 'spring', stiffness: 400, damping: 17 }}
                style={{ width: '100%', justifyContent: 'center', position: 'relative', overflow: 'hidden' }}
              >
                <motion.span
                  aria-hidden
                  animate={{ x: ['-120%', '220%'] }}
                  transition={{ duration: 2.8, repeat: Infinity, repeatDelay: 1.5, ease: 'easeInOut' }}
                  style={{
                    position: 'absolute',
                    inset: 0,
                    background: 'linear-gradient(90deg, transparent, rgba(255,255,255,0.22), transparent)',
                    pointerEvents: 'none',
                  }}
                />
                <span className="material-symbols-outlined" style={{ fontSize: '18px', position: 'relative' }}>auto_awesome</span>
                <span style={{ position: 'relative' }}>Analyze & Publish</span>
              </motion.button>
            </motion.div>

            {/* Right panel — info cards */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
              {[
                { icon: 'psychology', title: 'Local LLM Analysis', desc: 'QVAC runs Mistral-7B on-device to extract skills, write a summary, and score your profile 0–100. No data leaves your machine.' },
                { icon: 'document_scanner', title: 'OCR for Scanned Resumes', desc: 'Upload a scanned PDF or image — QVAC OCR extracts text on-device before analysis. Supports JPEG, PNG, TIFF, and more.' },
                { icon: 'travel_explore', title: 'Semantic Search', desc: 'QVAC embeds every profile locally. The Browse page ranks results by cosine similarity — not keyword matching.' },
                { icon: 'translate', title: 'Multilingual Reports', desc: 'Unlocked reports can be translated into 15 languages on the profile page — powered by QVAC local NMT, on-device.' },
                { icon: 'cloud_upload', title: 'IPFS Storage', desc: 'Your skill report is pinned to IPFS via Pinata. Permanent and censorship-resistant.' },
                { icon: 'link', title: 'On-Chain Proof', desc: 'The SHA-256 hash is anchored on Solana. Anyone can verify your report hasn\'t been tampered with.' },
              ].map((item, i) => (
                <motion.div
                  key={item.title}
                  className="glass"
                  initial={{ opacity: 0, x: 24 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ duration: 0.4, delay: 0.1 + i * 0.08, ease: [0.22, 1, 0.36, 1] }}
                  whileHover={{ x: 4, boxShadow: isDark ? '0 0 20px rgba(20,241,112,0.1)' : '0 4px 20px rgba(13,74,165,0.1)' }}
                  style={{ borderRadius: '1.25rem', padding: '1.25rem', display: 'flex', gap: '1rem', alignItems: 'flex-start' }}
                >
                  <span
                    className="material-symbols-outlined"
                    style={{ fontSize: '24px', color: primaryColor, fontVariationSettings: '"FILL" 1', flexShrink: 0 }}
                  >
                    {item.icon}
                  </span>
                  <div>
                    <p style={{ fontWeight: 600, marginBottom: '0.25rem', fontFamily: isDark ? '"Space Grotesk", sans-serif' : '"Inter", sans-serif' }}>{item.title}</p>
                    <p style={{ fontSize: '0.875rem', color: 'var(--text-muted)', lineHeight: 1.5 }}>{item.desc}</p>
                  </div>
                </motion.div>
              ))}
            </div>
          </div>
        </div>
      </main>
    );
  }

  // ─── Processing View ────────────────────────────────────────────────────────
  if (view === 'processing') {
    return (
      <main
        className="page-x-pad"
        style={{
          minHeight: '100vh',
          paddingTop: '88px',
          paddingBottom: '4rem',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <motion.div
          className="processing-grid"
          initial={{ opacity: 0, scale: 0.96 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 0.4, ease: [0.22, 1, 0.36, 1] }}
        >
          {/* Spinner */}
          <div style={{ display: 'flex', flexDirection: 'column', justifyContent: 'center', alignItems: 'center', position: 'relative', height: '200px' }}>
            {/* Outer ring */}
            <div
              style={{
                position: 'absolute',
                width: '160px',
                height: '160px',
                borderRadius: '50%',
                border: `3px solid transparent`,
                borderTopColor: '#14f070',
                borderRightColor: '#14f070',
                animation: 'spin 1.2s linear infinite',
              }}
            />
            {/* Inner ring */}
            <div
              style={{
                position: 'absolute',
                width: '120px',
                height: '120px',
                borderRadius: '50%',
                border: `3px solid transparent`,
                borderBottomColor: '#9945FF',
                borderLeftColor: '#9945FF',
                animation: 'spin 3s linear infinite reverse',
              }}
            />
            {/* Center text */}
            <div style={{ textAlign: 'center' }}>
              <p style={{ fontSize: '0.8125rem', color: 'var(--text-body)', fontFamily: '"Space Grotesk", sans-serif' }}>
                Step {Math.min(step, 5)}/5
              </p>
            </div>
            <div style={{ marginTop: '100px', display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
              <TypewriterText />
            </div>
          </div>

          {/* Steps */}
          <div>
            <h2
              style={{
                fontFamily: isDark ? '"Space Grotesk", sans-serif' : '"Inter", sans-serif',
                fontSize: '1.25rem',
                fontWeight: 700,
                marginBottom: '1.5rem',
              }}
            >
              Building your creds…
            </h2>
            <ProgressSteps currentStep={step} />
          </div>
        </motion.div>

        <style>{`
          @keyframes spin {
            from { transform: rotate(0deg); }
            to { transform: rotate(360deg); }
          }
        `}</style>
      </main>
    );
  }

  // ─── Success View ───────────────────────────────────────────────────────────
  const data = successData!;
  return (
    <main className="page-x-pad" style={{ minHeight: '100vh', paddingTop: '88px', paddingBottom: '4rem', position: 'relative' }}>
      <ConfettiBurst />
      <motion.div
        initial={{ opacity: 0, y: 40 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
        style={{ maxWidth: '640px', margin: '0 auto', textAlign: 'center' }}
      >
        {/* Success icon */}
        <motion.div
          initial={{ scale: 0, rotate: -20 }}
          animate={{ scale: 1, rotate: 0 }}
          transition={{ type: 'spring', stiffness: 260, damping: 18, delay: 0.1 }}
          style={{
            width: '72px',
            height: '72px',
            borderRadius: '50%',
            background: isDark ? 'rgba(20,241,112,0.12)' : 'rgba(13,74,165,0.1)',
            border: `2px solid ${primaryColor}`,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            margin: '0 auto 1.5rem',
          }}
        >
          <span
            className="material-symbols-outlined"
            style={{ fontSize: '36px', color: primaryColor, fontVariationSettings: '"FILL" 1' }}
          >
            verified
          </span>
        </motion.div>

        <motion.h1
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4, delay: 0.15 }}
          style={{
            fontFamily: isDark ? '"Space Grotesk", sans-serif' : '"Inter", sans-serif',
            fontSize: '2rem',
            fontWeight: 700,
            letterSpacing: isDark ? '-0.02em' : '-0.015em',
            marginBottom: '0.5rem',
          }}
        >
          Creds Created!
        </motion.h1>
        <motion.p
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.4, delay: 0.22 }}
          style={{ color: 'var(--text-muted)', marginBottom: '2rem' }}
        >
          Your skill report is on IPFS and verified on Solana.
        </motion.p>

        {/* Skills card */}
        <motion.div
          className="glass"
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.45, delay: 0.28, ease: [0.22, 1, 0.36, 1] }}
          style={{ borderRadius: '1.25rem', padding: '1.5rem', marginBottom: '1.5rem', textAlign: 'left' }}
        >
          <p style={{ fontSize: '0.8125rem', fontWeight: 600, color: 'var(--text-muted)', marginBottom: '0.75rem', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
            Skills Detected
          </p>
          <motion.div
            variants={skillTagContainerVariants}
            initial="hidden"
            animate="visible"
            style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem', marginBottom: '1rem' }}
          >
            {data.skillReport.skills.map(s => (
              <motion.div key={s} variants={skillTagVariant}>
                <SkillTag skill={s} />
              </motion.div>
            ))}
          </motion.div>
          <p style={{ fontSize: '0.9375rem', lineHeight: 1.6, color: 'var(--text-body)' }}>{data.skillReport.summary}</p>
        </motion.div>

        {/* Explorer link */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.5 }}
          style={{ marginBottom: '1.5rem' }}
        >
          <ExplorerLink txSignature={data.txSignature} />
        </motion.div>

        {/* Actions */}
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.55, duration: 0.4 }}
          style={{ display: 'flex', gap: '1rem', justifyContent: 'center', flexWrap: 'wrap' }}
        >
          <motion.button
            className="neon-btn"
            onClick={() => navigate(`/profile/${data.walletAddress}`)}
            whileHover={{ scale: 1.04 }}
            whileTap={{ scale: 0.97 }}
            transition={{ type: 'spring', stiffness: 400, damping: 17 }}
          >
            <span className="material-symbols-outlined" style={{ fontSize: '18px' }}>person</span>
            View My Profile
          </motion.button>
          <ShareButton url={`${window.location.origin}/profile/${data.walletAddress}`} />
        </motion.div>
      </motion.div>
    </main>
  );
}
