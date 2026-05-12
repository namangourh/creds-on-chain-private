import { WalletMultiButton } from '@solana/wallet-adapter-react-ui';
import { useWallet } from '@solana/wallet-adapter-react';
import { useTheme } from '../lib/theme';
import { Link } from 'react-router-dom';
import { motion } from 'framer-motion';

function LogoSVG() {
  return (
    <svg width="32" height="32" viewBox="0 0 32 32" fill="none" xmlns="http://www.w3.org/2000/svg">
      <defs>
        <linearGradient id="logoGrad" x1="0" y1="0" x2="32" y2="32" gradientUnits="userSpaceOnUse">
          <stop stopColor="#14f070" />
          <stop offset="1" stopColor="#9945FF" />
        </linearGradient>
      </defs>
      {/* Geometric 3D passport-like shape */}
      <polygon points="16,2 30,10 30,22 16,30 2,22 2,10" fill="url(#logoGrad)" opacity="0.15" />
      <polygon points="16,2 30,10 30,22 16,30 2,22 2,10" fill="none" stroke="url(#logoGrad)" strokeWidth="1.5" />
      <polygon points="16,8 24,13 24,20 16,25 8,20 8,13" fill="none" stroke="url(#logoGrad)" strokeWidth="1" opacity="0.6" />
      <circle cx="16" cy="16" r="3" fill="url(#logoGrad)" />
    </svg>
  );
}

function ThemeToggle() {
  const { theme, toggle } = useTheme();
  const isDark = theme === 'dark';

  return (
    <button
      onClick={toggle}
      aria-label="Toggle theme"
      style={{
        width: '48px',
        height: '26px',
        borderRadius: '9999px',
        border: isDark ? '1px solid rgba(20,241,112,0.3)' : '1px solid rgba(13,74,165,0.3)',
        background: isDark ? 'rgba(20,241,112,0.08)' : 'rgba(13,74,165,0.08)',
        cursor: 'pointer',
        transition: 'all 0.3s ease',
        display: 'flex',
        alignItems: 'center',
        padding: '3px',
        flexShrink: 0,
        justifyContent: isDark ? 'flex-start' : 'flex-end',
      }}
    >
      <span
        style={{
          width: '18px',
          height: '18px',
          borderRadius: '50%',
          background: isDark ? '#14f070' : '#0d4aa5',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          transition: 'transform 0.3s ease',
          flexShrink: 0,
        }}
      >
        <span
          className="material-symbols-outlined"
          style={{ fontSize: '12px', color: '#ffffff', lineHeight: 1 }}
        >
          {isDark ? 'dark_mode' : 'sunny'}
        </span>
      </span>
    </button>
  );
}

export default function Header() {
  const { publicKey } = useWallet();
  const { theme } = useTheme();
  const isDark = theme === 'dark';

  return (
    <motion.header
      className="glass"
      initial={{ y: -72, opacity: 0 }}
      animate={{ y: 0, opacity: 1 }}
      transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        zIndex: 50,
        height: '72px',
        boxShadow: isDark ? 'none' : '0 1px 16px rgba(13,74,165,0.06)',
      }}
    >
      <div className="header-inner" style={{ height: '100%' }}>
        {/* Logo */}
        <Link
          to="/"
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '0.625rem',
            textDecoration: 'none',
          }}
        >
          <LogoSVG />
          <span
            className={isDark ? 'gradient-text' : undefined}
            style={{
              fontFamily: isDark ? '"Space Grotesk", sans-serif' : '"Inter", sans-serif',
              fontWeight: 700,
              fontSize: '1.0625rem',
              letterSpacing: isDark ? '-0.02em' : '-0.01em',
              color: isDark ? undefined : '#0d4aa5',
            }}
          >
            CredChain
          </span>
        </Link>

        {/* Right side */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
          <Link
            to="/browse"
            style={{
              fontSize: '0.875rem',
              fontWeight: 600,
              color: isDark ? 'rgba(255,255,255,0.7)' : '#475569',
              textDecoration: 'none',
              letterSpacing: isDark ? '0.01em' : '0',
              transition: 'color 0.2s',
            }}
            onMouseEnter={e => (e.currentTarget.style.color = isDark ? '#14f070' : '#0d4aa5')}
            onMouseLeave={e => (e.currentTarget.style.color = isDark ? 'rgba(255,255,255,0.7)' : '#475569')}
          >
            Browse
          </Link>
          <ThemeToggle />
          {publicKey ? (
            <WalletMultiButton />
          ) : (
            <WalletMultiButton>Connect Wallet</WalletMultiButton>
          )}
        </div>
      </div>
    </motion.header>
  );
}
