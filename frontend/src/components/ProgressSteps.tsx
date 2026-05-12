import { motion, AnimatePresence } from 'framer-motion';
import { useTheme } from '../lib/theme';

const STEPS = [
  'Parsing input',
  'AI analysis',
  'Uploading to IPFS',
  'Awaiting wallet signature',
  'Confirming on Solana',
];

interface Props {
  currentStep: number; // 0 = none started, 1-5 = step active/completed
}

export default function ProgressSteps({ currentStep }: Props) {
  const { theme } = useTheme();
  const isDark = theme === 'dark';
  const primaryColor = isDark ? '#14f070' : '#0d4aa5';

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.875rem' }}>
      {STEPS.map((label, i) => {
        const stepNum = i + 1;
        const isCompleted = currentStep > stepNum;
        const isActive = currentStep === stepNum;

        return (
          <motion.div
            key={label}
            initial={{ opacity: 0, x: -12 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ duration: 0.35, delay: i * 0.06, ease: [0.22, 1, 0.36, 1] }}
            style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}
          >
            {/* Icon circle */}
            <div
              style={{
                width: '28px',
                height: '28px',
                borderRadius: '50%',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                flexShrink: 0,
                border: isCompleted
                  ? `2px solid ${primaryColor}`
                  : isActive
                  ? `2px solid ${primaryColor}`
                  : isDark ? '2px solid rgba(255,255,255,0.22)' : '2px solid rgba(0,0,0,0.18)',
                background: isCompleted ? primaryColor : 'transparent',
                transition: 'all 0.3s ease',
                position: 'relative',
              }}
            >
              {/* Halo ring for active step */}
              {isActive && (
                <motion.div
                  style={{
                    position: 'absolute',
                    inset: -6,
                    borderRadius: '50%',
                    border: `1px solid ${primaryColor}`,
                    pointerEvents: 'none',
                  }}
                  animate={{ scale: [1, 1.55], opacity: [0.55, 0] }}
                  transition={{ duration: 1.4, repeat: Infinity, ease: 'easeOut' }}
                />
              )}

              <AnimatePresence mode="wait">
                {isCompleted ? (
                  <motion.span
                    key="check"
                    initial={{ scale: 0, rotate: -90 }}
                    animate={{ scale: 1, rotate: 0 }}
                    exit={{ scale: 0 }}
                    transition={{ type: 'spring', stiffness: 400, damping: 18 }}
                    className="material-symbols-outlined"
                    style={{ fontSize: '14px', color: '#0D0E12', fontVariationSettings: '"FILL" 1', display: 'block' }}
                  >
                    check
                  </motion.span>
                ) : isActive ? (
                  <motion.span
                    key="active"
                    initial={{ scale: 0 }}
                    animate={{ scale: 1 }}
                    exit={{ scale: 0 }}
                    transition={{ type: 'spring', stiffness: 400, damping: 18 }}
                    style={{
                      width: '8px',
                      height: '8px',
                      borderRadius: '50%',
                      background: primaryColor,
                      display: 'block',
                      animation: 'pulse-dot 1.5s ease-in-out infinite',
                    }}
                  />
                ) : (
                  <motion.span
                    key="pending"
                    initial={{ scale: 0 }}
                    animate={{ scale: 1 }}
                    exit={{ scale: 0 }}
                    style={{
                      width: '8px',
                      height: '8px',
                      borderRadius: '50%',
                      background: isDark ? 'rgba(255,255,255,0.28)' : 'rgba(0,0,0,0.22)',
                      display: 'block',
                    }}
                  />
                )}
              </AnimatePresence>
            </div>

            {/* Label */}
            <span
              style={{
                fontSize: '0.9375rem',
                fontWeight: isActive ? 600 : 400,
                color: isCompleted
                  ? primaryColor
                  : isActive
                  ? 'var(--text-heading)'
                  : 'var(--text-muted)',
                transition: 'color 0.3s ease',
              }}
            >
              {label}
            </span>
          </motion.div>
        );
      })}

      <style>{`
        @keyframes pulse-dot {
          0%, 100% { opacity: 1; transform: scale(1); }
          50% { opacity: 0.5; transform: scale(0.8); }
        }
      `}</style>
    </div>
  );
}
