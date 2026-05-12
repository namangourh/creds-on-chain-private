import { motion } from 'framer-motion';
import { useTheme } from '../lib/theme';

interface Props {
  skills: string[];
}

function pentagon(cx: number, cy: number, r: number, offset = 0): string {
  return Array.from({ length: 5 }, (_, i) => {
    const angle = (i * 72 - 90 + offset) * (Math.PI / 180);
    return `${cx + r * Math.cos(angle)},${cy + r * Math.sin(angle)}`;
  }).join(' ');
}

export default function SkillRadar({ skills }: Props) {
  const { theme } = useTheme();
  const isDark = theme === 'dark';
  const primaryColor = isDark ? '#14f070' : '#0d4aa5';

  const cx = 120, cy = 120, maxR = 90;
  const labels = skills.slice(0, 5);
  while (labels.length < 5) labels.push('');

  const gridOpacity = isDark ? '0.12' : '0.15';
  const labelColor = isDark ? 'rgba(255,255,255,0.6)' : 'rgba(0,0,0,0.6)';
  const gridStroke = isDark ? `rgba(255,255,255,${gridOpacity})` : `rgba(0,0,0,${gridOpacity})`;

  return (
    <svg width="240" height="240" viewBox="0 0 240 240">
      {/* Grid rings — fade in with stagger */}
      {[0.33, 0.66, 1].map((scale, i) => (
        <motion.polygon
          key={scale}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.45, delay: i * 0.07 }}
          points={pentagon(cx, cy, maxR * scale)}
          fill="none"
          stroke={gridStroke}
          strokeWidth="1"
        />
      ))}

      {/* Axis lines */}
      {Array.from({ length: 5 }, (_, i) => {
        const angle = (i * 72 - 90) * (Math.PI / 180);
        return (
          <motion.line
            key={i}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.4, delay: 0.15 + i * 0.05 }}
            x1={cx}
            y1={cy}
            x2={cx + maxR * Math.cos(angle)}
            y2={cy + maxR * Math.sin(angle)}
            stroke={isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.08)'}
            strokeWidth="1"
          />
        );
      })}

      {/* Data polygon — grows from center */}
      <motion.polygon
        initial={{ scale: 0, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        transition={{ duration: 0.75, delay: 0.3, ease: [0.22, 1, 0.36, 1] }}
        style={{ transformOrigin: `${cx}px ${cy}px` }}
        points={pentagon(cx, cy, maxR * 0.75)}
        fill={`${primaryColor}22`}
        stroke={primaryColor}
        strokeWidth="2"
        strokeLinejoin="round"
      />

      {/* Data points — pop in with stagger */}
      {Array.from({ length: 5 }, (_, i) => {
        const angle = (i * 72 - 90) * (Math.PI / 180);
        const px = cx + maxR * 0.75 * Math.cos(angle);
        const py = cy + maxR * 0.75 * Math.sin(angle);
        return (
          <motion.circle
            key={i}
            initial={{ scale: 0, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            transition={{ duration: 0.35, delay: 0.5 + i * 0.07, type: 'spring', stiffness: 380, damping: 18 }}
            style={{ transformOrigin: `${px}px ${py}px` }}
            cx={px}
            cy={py}
            r="4"
            fill={primaryColor}
          />
        );
      })}

      {/* Labels */}
      {labels.map((label, i) => {
        const angle = (i * 72 - 90) * (Math.PI / 180);
        const labelR = maxR + 20;
        const x = cx + labelR * Math.cos(angle);
        const y = cy + labelR * Math.sin(angle);
        return (
          <motion.text
            key={i}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.4, delay: 0.6 + i * 0.06 }}
            x={x}
            y={y}
            textAnchor="middle"
            dominantBaseline="middle"
            fill={labelColor}
            fontSize="10"
            fontFamily='"Outfit", sans-serif'
            fontWeight="500"
          >
            {label}
          </motion.text>
        );
      })}
    </svg>
  );
}
