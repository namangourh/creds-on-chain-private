import { useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useWallet } from '@solana/wallet-adapter-react';
import { useWalletModal } from '@solana/wallet-adapter-react-ui';
import { useTheme } from '../lib/theme';
import {
  motion,
  useMotionValue,
  useTransform,
  useSpring,
} from 'framer-motion';

function TrustBadge({ label, icon, index }: { label: string; icon: string; index: number }) {
  const { theme } = useTheme();
  const isDark = theme === 'dark';
  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, delay: 0.7 + index * 0.06, ease: [0.22, 1, 0.36, 1] }}
      whileHover={{ scale: 1.06, y: -2 }}
      whileTap={{ scale: 0.97 }}
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: '0.5rem',
        padding: '0.5rem 1rem',
        borderRadius: '9999px',
        border: isDark ? '1px solid rgba(255,255,255,0.12)' : '1px solid rgba(13,74,165,0.18)',
        background: isDark ? 'rgba(255,255,255,0.07)' : 'rgba(255,255,255,0.97)',
        fontSize: '0.875rem',
        fontWeight: 500,
        color: isDark ? '#e2e8f0' : '#334155',
        backdropFilter: 'blur(8px)',
        WebkitBackdropFilter: 'blur(8px)',
        cursor: 'default',
      }}
    >
      <span style={{ fontSize: '16px' }}>{icon}</span>
      {label}
    </motion.div>
  );
}

const heroVariants = {
  hidden: {},
  visible: { transition: { staggerChildren: 0.11, delayChildren: 0.1 } },
};

const heroItemVariants = {
  hidden: { opacity: 0, y: 22 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.55, ease: [0.22, 1, 0.36, 1] as [number, number, number, number] } },
};

export default function LandingPage() {
  const navigate = useNavigate();
  const { connected } = useWallet();
  const { setVisible } = useWalletModal();
  const { theme } = useTheme();
  const isDark = theme === 'dark';

  // Mouse parallax for hero section
  const mouseX = useMotionValue(0);
  const mouseY = useMotionValue(0);
  const smoothX = useSpring(mouseX, { stiffness: 70, damping: 28 });
  const smoothY = useSpring(mouseY, { stiffness: 70, damping: 28 });
  const heroX = useTransform(smoothX, [-1, 1], [-7, 7]);
  const heroY = useTransform(smoothY, [-1, 1], [-4, 4]);

  const handleMouseMove = useCallback((e: React.MouseEvent) => {
    const x = (e.clientX / window.innerWidth - 0.5) * 2;
    const y = (e.clientY / window.innerHeight - 0.5) * 2;
    mouseX.set(x);
    mouseY.set(y);
  }, [mouseX, mouseY]);

  const handleGetStarted = () => {
    if (connected) {
      navigate('/upload');
    } else {
      setVisible(true);
    }
  };

  return (
    <main
      onMouseMove={handleMouseMove}
      className="page-x-pad"
      style={{
        minHeight: '100vh',
        paddingTop: '72px',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        paddingBottom: '4rem',
        position: 'relative',
        overflow: 'hidden',
      }}
    >
      {/* Hero content with mouse parallax */}
      <motion.div
        style={{
          maxWidth: '720px',
          textAlign: 'center',
          position: 'relative',
          zIndex: 1,
          x: heroX,
          y: heroY,
        }}
      >
        <motion.div
          variants={heroVariants}
          initial="hidden"
          animate="visible"
        >
          {/* Badge */}
          <motion.div variants={heroItemVariants}>
            <div
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '0.5rem',
                padding: '0.375rem 1rem',
                borderRadius: '9999px',
                border: isDark ? '1px solid rgba(20,241,112,0.25)' : '1px solid rgba(13,74,165,0.2)',
                background: isDark ? 'rgba(20,241,112,0.06)' : 'rgba(255,255,255,0.97)',
                fontSize: '0.8125rem',
                fontWeight: 600,
                color: isDark ? '#14f070' : '#0d4aa5',
                marginBottom: '2rem',
                fontFamily: isDark ? '"Space Grotesk", sans-serif' : '"Inter", sans-serif',
                letterSpacing: isDark ? '0.05em' : '0.04em',
                textTransform: 'uppercase',
                boxShadow: isDark ? 'none' : '0 1px 4px rgba(13,74,165,0.1)',
              }}
            >
              <span
                style={{
                  width: '6px',
                  height: '6px',
                  borderRadius: '50%',
                  background: isDark ? '#14f070' : '#0d4aa5',
                  animation: 'pulse 2s ease-in-out infinite',
                  flexShrink: 0,
                }}
              />
              Powered by Solana + AI
            </div>
          </motion.div>

          {/* Headline */}
          <motion.h1
            variants={heroItemVariants}
            style={{
              fontFamily: isDark ? '"Space Grotesk", sans-serif' : '"Inter", sans-serif',
              fontSize: 'clamp(2.5rem, 6vw, 4rem)',
              fontWeight: 700,
              lineHeight: 1.1,
              letterSpacing: isDark ? '-0.03em' : '-0.02em',
              marginBottom: '1.25rem',
              color: isDark ? '#f1f5f9' : '#0f172a',
              textShadow: isDark
                ? '0 2px 24px rgba(0,0,0,0.6)'
                : '0 0 20px rgba(255,255,255,1), 0 0 40px rgba(255,255,255,0.9), 0 0 60px rgba(255,255,255,0.6)',
            }}
          >
            Your Creds.{' '}
            <span className="gradient-text">Verified On-Chain.</span>
          </motion.h1>

          {/* Subheadline */}
          <motion.p
            variants={heroItemVariants}
            style={{
              fontSize: 'clamp(1rem, 2.5vw, 1.1875rem)',
              lineHeight: 1.6,
              color: isDark ? '#cbd5e1' : '#1e293b',
              marginBottom: '2.5rem',
              maxWidth: '540px',
              margin: '0 auto 2.5rem',
              textShadow: isDark
                ? '0 1px 12px rgba(0,0,0,0.5)'
                : '0 0 16px rgba(255,255,255,1), 0 0 32px rgba(255,255,255,0.9), 0 0 48px rgba(255,255,255,0.7)',
            }}
          >
            Upload your resume or GitHub profile. AI extracts your creds,
            anchors them permanently on Solana, and creates a shareable profile
            that anyone can verify — instantly.
          </motion.p>

          {/* CTA */}
          <motion.div variants={heroItemVariants} style={{ display: 'flex', gap: '0.875rem', justifyContent: 'center', flexWrap: 'wrap' }}>
            <motion.button
              className="neon-btn"
              onClick={handleGetStarted}
              whileHover={{ scale: 1.04 }}
              whileTap={{ scale: 0.97 }}
              transition={{ type: 'spring', stiffness: 400, damping: 17 }}
              style={{ fontSize: '1rem', padding: '0.875rem 2rem', position: 'relative', overflow: 'hidden' }}
            >
              {/* Shimmer sweep */}
              <motion.span
                aria-hidden
                animate={{ x: ['-120%', '220%'] }}
                transition={{ duration: 2.6, repeat: Infinity, repeatDelay: 1.2, ease: 'easeInOut' }}
                style={{
                  position: 'absolute',
                  top: 0,
                  left: 0,
                  right: 0,
                  bottom: 0,
                  background: 'linear-gradient(90deg, transparent, rgba(255,255,255,0.25), transparent)',
                  pointerEvents: 'none',
                }}
              />
              <span className="material-symbols-outlined" style={{ fontSize: '18px', position: 'relative' }}>
                {connected ? 'rocket_launch' : 'account_balance_wallet'}
              </span>
              <span style={{ position: 'relative' }}>
                {connected ? 'Create My Cred' : 'Connect Wallet & Get Started'}
              </span>
            </motion.button>

            <motion.button
              className="neon-btn"
              onClick={() => navigate('/browse')}
              whileHover={{ scale: 1.04 }}
              whileTap={{ scale: 0.97 }}
              transition={{ type: 'spring', stiffness: 400, damping: 17 }}
              style={{ fontSize: '1rem', padding: '0.875rem 2rem', position: 'relative', overflow: 'hidden' }}
            >
              <motion.span
                aria-hidden
                animate={{ x: ['-120%', '220%'] }}
                transition={{ duration: 2.6, repeat: Infinity, repeatDelay: 1.8, ease: 'easeInOut' }}
                style={{
                  position: 'absolute', top: 0, left: 0, right: 0, bottom: 0,
                  background: 'linear-gradient(90deg, transparent, rgba(255,255,255,0.25), transparent)',
                  pointerEvents: 'none',
                }}
              />
              <span className="material-symbols-outlined" style={{ fontSize: '18px', position: 'relative' }}>person_search</span>
              <span style={{ position: 'relative' }}>Browse Creds</span>
            </motion.button>
          </motion.div>
        </motion.div>

        {/* Trust row — staggered after hero */}
        <div
          style={{
            display: 'flex',
            flexWrap: 'wrap',
            justifyContent: 'center',
            gap: '0.75rem',
            marginTop: '3rem',
          }}
        >
          {[
            { label: 'Solana Devnet', icon: '⚡' },
            { label: 'IPFS via Pinata', icon: '📌' },
            { label: 'QVAC Local AI', icon: '🧠' },
            { label: 'Multilingual', icon: '🌐' },
            { label: 'Open Source', icon: '🔓' },
          ].map((badge, i) => (
            <TrustBadge key={badge.label} {...badge} index={i} />
          ))}
        </div>
      </motion.div>

      {/* Feature cards — scroll-triggered with stagger */}
      <div
        className="feature-cards-grid feature-section-gap"
        style={{
          position: 'relative',
          zIndex: 1,
        }}
      >
        {[
          {
            icon: 'description',
            title: 'Upload Resume or GitHub',
            desc: 'PDF, scanned image, or GitHub username — QVAC AI extracts your creds locally. No data leaves the server.',
          },
          {
            icon: 'verified',
            title: 'On-Chain Cred',
            desc: 'SHA-256 hash of your cred report anchored on Solana. Tamper-proof forever.',
          },
          {
            icon: 'lock_open',
            title: 'Pay-to-Unlock',
            desc: 'Recruiters pay SOL to unlock your full cred report. You earn directly to your wallet.',
          },
          {
            icon: 'translate',
            title: 'Multilingual Reports',
            desc: 'Unlock reports are readable in 15 languages — translated on-device by QVAC. No cloud translation API.',
          },
          {
            icon: 'travel_explore',
            title: 'Semantic Search',
            desc: 'Browse profiles by skill and expertise — not just keywords. QVAC embeddings rank results by true semantic similarity.',
          },
          {
            icon: 'shield_lock',
            title: 'Privacy-First AI',
            desc: 'Every AI operation — analysis, OCR, search, translation — runs locally on the server. Your data never touches a cloud API.',
          },
        ].map((card, index) => (
          <motion.div
            key={card.title}
            className="glass"
            initial={{ opacity: 0, y: 32 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, margin: '-60px' }}
            transition={{ duration: 0.5, delay: index * 0.09, ease: [0.22, 1, 0.36, 1] }}
            whileHover={{
              y: -6,
              scale: 1.02,
              boxShadow: isDark
                ? '0 0 32px rgba(20,241,112,0.16), 0 8px 32px rgba(0,0,0,0.3)'
                : '0 8px 32px rgba(13,74,165,0.14)',
            }}
            whileTap={{ scale: 0.98 }}
            style={{
              padding: '1.5rem',
              borderRadius: '1.25rem',
              cursor: 'default',
            }}
          >
            <motion.span
              className="material-symbols-outlined"
              initial={{ scale: 0, rotate: -20 }}
              whileInView={{ scale: 1, rotate: 0 }}
              viewport={{ once: true }}
              transition={{ type: 'spring', stiffness: 300, damping: 18, delay: 0.15 + index * 0.09 }}
              style={{
                fontSize: '28px',
                color: isDark ? '#14f070' : '#0d4aa5',
                fontVariationSettings: '"FILL" 1',
                marginBottom: '0.875rem',
                display: 'block',
              }}
            >
              {card.icon}
            </motion.span>
            <h3
              style={{
                fontFamily: isDark ? '"Space Grotesk", sans-serif' : '"Inter", sans-serif',
                fontWeight: 600,
                fontSize: '1rem',
                marginBottom: '0.5rem',
                letterSpacing: '-0.01em',
                color: isDark ? '#f1f5f9' : '#0f172a',
              }}
            >
              {card.title}
            </h3>
            <p style={{ fontSize: '0.875rem', color: isDark ? '#94a3b8' : '#475569', lineHeight: 1.55 }}>
              {card.desc}
            </p>
          </motion.div>
        ))}
      </div>

      <style>{`
        @keyframes pulse {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.4; }
        }
      `}</style>
    </main>
  );
}
