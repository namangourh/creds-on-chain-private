import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import toast from 'react-hot-toast';
import { useTheme } from '../lib/theme';

interface Props {
  url?: string;
}

export default function ShareButton({ url }: Props) {
  const { theme } = useTheme();
  const isDark = theme === 'dark';
  const [copied, setCopied] = useState(false);

  const handleCopy = () => {
    const target = url || window.location.href;
    navigator.clipboard.writeText(target).then(() => {
      toast.success('Profile URL copied!', { duration: 2000 });
      setCopied(true);
      setTimeout(() => setCopied(false), 2200);
    });
  };

  return (
    <motion.button
      onClick={handleCopy}
      whileHover={{ scale: 1.05 }}
      whileTap={{ scale: 0.88 }}
      transition={{ type: 'spring', stiffness: 400, damping: 17 }}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: '0.5rem',
        borderRadius: '9999px',
        padding: '0.5rem 1.25rem',
        border: isDark
          ? copied ? '1px solid rgba(20,241,112,0.5)' : '1px solid rgba(20,241,112,0.3)'
          : copied ? '1px solid rgba(13,74,165,0.5)' : '1px solid rgba(13,74,165,0.3)',
        background: isDark
          ? copied ? 'rgba(20,241,112,0.15)' : 'rgba(20,241,112,0.08)'
          : copied ? 'rgba(13,74,165,0.12)' : 'rgba(13,74,165,0.06)',
        color: isDark ? '#14f070' : '#0d4aa5',
        fontSize: '0.875rem',
        fontWeight: 600,
        fontFamily: '"Space Grotesk", sans-serif',
        cursor: 'pointer',
        transition: 'background 0.25s, border 0.25s',
      }}
    >
      <AnimatePresence mode="wait">
        {copied ? (
          <motion.span
            key="check"
            initial={{ scale: 0, rotate: -90 }}
            animate={{ scale: 1, rotate: 0 }}
            exit={{ scale: 0 }}
            transition={{ type: 'spring', stiffness: 400, damping: 18 }}
            className="material-symbols-outlined"
            style={{ fontSize: '16px', fontVariationSettings: '"FILL" 1' }}
          >
            check_circle
          </motion.span>
        ) : (
          <motion.span
            key="share"
            initial={{ scale: 0 }}
            animate={{ scale: 1 }}
            exit={{ scale: 0 }}
            transition={{ type: 'spring', stiffness: 400, damping: 18 }}
            className="material-symbols-outlined"
            style={{ fontSize: '16px' }}
          >
            share
          </motion.span>
        )}
      </AnimatePresence>
      <AnimatePresence mode="wait">
        {copied ? (
          <motion.span
            key="copied-text"
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -6 }}
            transition={{ duration: 0.2 }}
          >
            Copied!
          </motion.span>
        ) : (
          <motion.span
            key="share-text"
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -6 }}
            transition={{ duration: 0.2 }}
          >
            Share Profile
          </motion.span>
        )}
      </AnimatePresence>
    </motion.button>
  );
}
