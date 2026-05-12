import { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { CircularProgressbar, buildStyles } from 'react-circular-progressbar';
import 'react-circular-progressbar/dist/styles.css';
import { useTheme } from '../lib/theme';

interface Props {
  score: number;
  locked: boolean;
}

export default function ScoreRing({ score, locked }: Props) {
  const { theme } = useTheme();
  const isDark = theme === 'dark';
  const [displayScore, setDisplayScore] = useState(0);
  const [burst, setBurst] = useState(false);

  useEffect(() => {
    if (!locked && score > 0) {
      // Brief flash then count up
      setBurst(true);
      const burstTimer = setTimeout(() => setBurst(false), 900);

      let current = 0;
      const step = score / 60;
      const timer = setInterval(() => {
        current += step;
        if (current >= score) {
          setDisplayScore(score);
          clearInterval(timer);
        } else {
          setDisplayScore(Math.round(current));
        }
      }, 16);
      return () => {
        clearInterval(timer);
        clearTimeout(burstTimer);
      };
    }
  }, [score, locked]);

  const primaryColor = isDark ? '#14f070' : '#0d4aa5';
  const trailColor = isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.08)';

  // 8 sparkle particles radiate outward on unlock
  const sparkleAngles = Array.from({ length: 8 }, (_, i) => (i * 45 - 90) * (Math.PI / 180));

  return (
    <div style={{ position: 'relative', width: '120px', height: '120px' }}>
      <CircularProgressbar
        value={locked ? 0 : displayScore}
        maxValue={100}
        styles={buildStyles({
          pathColor: primaryColor,
          trailColor,
          pathTransitionDuration: 0.05,
        })}
      />

      {/* Sparkle burst on unlock */}
      <AnimatePresence>
        {burst && sparkleAngles.map((angle, i) => (
          <motion.div
            key={i}
            initial={{ x: 0, y: 0, opacity: 1, scale: 1 }}
            animate={{
              x: Math.cos(angle) * 52,
              y: Math.sin(angle) * 52,
              opacity: 0,
              scale: 0,
            }}
            exit={{}}
            transition={{ duration: 0.65, ease: 'easeOut', delay: i % 2 === 0 ? 0 : 0.06 }}
            style={{
              position: 'absolute',
              top: '50%',
              left: '50%',
              width: i % 2 === 0 ? 6 : 5,
              height: i % 2 === 0 ? 6 : 5,
              borderRadius: '50%',
              background: i % 3 === 0 ? primaryColor : i % 3 === 1 ? '#9945FF' : '#f59e0b',
              transform: 'translate(-50%, -50%)',
              pointerEvents: 'none',
            }}
          />
        ))}
      </AnimatePresence>

      {/* Center overlay */}
      <div
        style={{
          position: 'absolute',
          inset: 0,
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          gap: '2px',
        }}
      >
        {locked ? (
          <>
            <motion.span
              className="material-symbols-outlined"
              animate={{ scale: [1, 1.1, 1] }}
              transition={{ duration: 2.2, repeat: Infinity, ease: 'easeInOut' }}
              style={{ fontSize: '28px', color: isDark ? 'rgba(255,255,255,0.3)' : 'rgba(0,0,0,0.3)' }}
            >
              lock
            </motion.span>
            <span style={{ fontSize: '10px', opacity: 0.4 }}>Hidden</span>
          </>
        ) : (
          <>
            <span
              style={{
                fontSize: '1.75rem',
                fontWeight: 700,
                fontFamily: '"Space Grotesk", sans-serif',
                color: primaryColor,
                lineHeight: 1,
              }}
            >
              {displayScore}
            </span>
            <span style={{ fontSize: '0.6875rem', opacity: 0.5 }}>/100</span>
          </>
        )}
      </div>
    </div>
  );
}
