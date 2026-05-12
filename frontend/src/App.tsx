import { BrowserRouter, Routes, Route, useLocation } from 'react-router-dom';
import { Toaster } from 'react-hot-toast';
import { AnimatePresence, motion } from 'framer-motion';
import { useMemo } from 'react';
import { ThemeProvider, useTheme } from './lib/theme';
import { WalletProviders } from './WalletProviders';
import Header from './components/Header';
import LandingPage from './pages/LandingPage';
import UploadPage from './pages/UploadPage';
import ProfilePage from './pages/ProfilePage';
import BrowsePage from './pages/BrowsePage';
import SolanaBackground from './components/SolanaBackground';

// Deterministic pseudo-random — avoids shifting values on re-renders
function seededRand(seed: number): number {
  const x = Math.sin(seed + 1) * 10000;
  return x - Math.floor(x);
}

// Subtle ambient particles between the 3D canvas and page content
function FloatingParticles() {
  const { theme } = useTheme();
  const isDark = theme === 'dark';

  const particles = useMemo(() =>
    Array.from({ length: 16 }, (_, i) => ({
      id: i,
      x: seededRand(i * 3) * 100,
      y: seededRand(i * 3 + 1) * 100,
      size: 2 + seededRand(i * 3 + 2) * 2,
      duration: 6 + seededRand(i * 7) * 9,
      delay: seededRand(i * 11) * 6,
      yRange: 20 + seededRand(i * 5) * 20,
      xDrift: (seededRand(i * 13) - 0.5) * 24,
    }))
  , []);

  return (
    <div style={{ position: 'fixed', inset: 0, pointerEvents: 'none', zIndex: 1, overflow: 'hidden' }}>
      {particles.map(p => (
        <motion.div
          key={p.id}
          style={{
            position: 'absolute',
            left: `${p.x}%`,
            top: `${p.y}%`,
            width: p.size,
            height: p.size,
            borderRadius: '50%',
            background: isDark ? '#14f070' : '#0d4aa5',
          }}
          animate={{
            y: [0, -p.yRange, 0],
            x: [0, p.xDrift, 0],
            opacity: [0.1, 0.2, 0.1],
          }}
          transition={{
            duration: p.duration,
            delay: p.delay,
            repeat: Infinity,
            ease: 'easeInOut',
          }}
        />
      ))}
    </div>
  );
}

// Fading overlay that carries the light-mode radial gradient so it
// transitions smoothly instead of snapping in/out with the class change.
function LightModeGradient() {
  const { theme } = useTheme();
  return (
    <div
      aria-hidden
      style={{
        position: 'fixed',
        inset: 0,
        pointerEvents: 'none',
        zIndex: 1,
        opacity: theme === 'light' ? 1 : 0,
        backgroundImage: `
          radial-gradient(at 0% 0%, hsla(215,65%,88%,0.45) 0px, transparent 50%),
          radial-gradient(at 100% 0%, hsla(210,80%,93%,0.55) 0px, transparent 50%),
          radial-gradient(at 100% 100%, hsla(215,65%,88%,0.35) 0px, transparent 50%),
          radial-gradient(at 0% 100%, hsla(210,80%,93%,0.5) 0px, transparent 50%)
        `,
      }}
    />
  );
}

// Shared page transition wrapper — each route fades + slides in/out
function PageTransition({ children }: { children: React.ReactNode }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 18 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -10 }}
      transition={{ duration: 0.38, ease: [0.22, 1, 0.36, 1] }}
    >
      {children}
    </motion.div>
  );
}

// Must live inside BrowserRouter to use useLocation
function AnimatedRoutes() {
  const location = useLocation();
  return (
    <AnimatePresence mode="wait">
      <Routes location={location} key={location.pathname}>
        <Route path="/" element={<PageTransition><LandingPage /></PageTransition>} />
        <Route path="/upload" element={<PageTransition><UploadPage /></PageTransition>} />
        <Route path="/browse" element={<PageTransition><BrowsePage /></PageTransition>} />
        <Route path="/profile/:walletAddress" element={<PageTransition><ProfilePage /></PageTransition>} />
      </Routes>
    </AnimatePresence>
  );
}

function AppShell() {
  return (
    <WalletProviders>
      <BrowserRouter>
        {/* Gradient and particles sit above canvas (z:0) but below content (z:2) */}
        <LightModeGradient />
        <FloatingParticles />

        {/* All page content at z-index: 2 so the WebGL canvas never composites above it */}
        <div style={{ position: 'relative', zIndex: 2 }}>
          <Header />
          <AnimatedRoutes />
          <Toaster
            position="bottom-right"
            toastOptions={{
              style: {
                background: 'rgba(20, 22, 30, 0.95)',
                color: '#f1f5f9',
                border: '1px solid rgba(255,255,255,0.08)',
                borderRadius: '0.75rem',
                backdropFilter: 'blur(12px)',
                fontFamily: '"Outfit", sans-serif',
              },
            }}
          />
        </div>
      </BrowserRouter>
    </WalletProviders>
  );
}

export default function App() {
  return (
    <ThemeProvider>
      {/* Canvas background at z-index: 0 (see .solana-bg-canvas in index.css) */}
      <SolanaBackground />
      <AppShell />
    </ThemeProvider>
  );
}
