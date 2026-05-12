import { useRef, useCallback, useEffect } from 'react';
import { Canvas } from '@react-three/fiber';
import { Environment } from '@react-three/drei';
import LogoCoin3D from './LogoCoin3D';
import { useTheme } from '../lib/theme';

export default function SolanaBackground() {
  const { theme } = useTheme();
  const isDark = theme === 'dark';

  const isDragging = useRef(false);
  const lastMouse = useRef({ x: 0, y: 0 });
  const dragVelocity = useRef({ x: 0, y: 0 });
  const scrollDelta = useRef(0);

  const isOverCard = useCallback((e: MouseEvent | PointerEvent | WheelEvent) => {
    const card = document.getElementById('profile-card');
    if (!card) return false;
    const rect = card.getBoundingClientRect();
    return (
      e.clientX >= rect.left &&
      e.clientX <= rect.right &&
      e.clientY >= rect.top &&
      e.clientY <= rect.bottom
    );
  }, []);

  const handlePointerDown = useCallback((e: PointerEvent) => {
    if (isOverCard(e)) return;
    isDragging.current = true;
    lastMouse.current = { x: e.clientX, y: e.clientY };
    dragVelocity.current = { x: 0, y: 0 };
    (e.target as HTMLElement)?.setPointerCapture?.(e.pointerId);
  }, [isOverCard]);

  const handlePointerMove = useCallback((e: PointerEvent) => {
    if (!isDragging.current) return;
    const dx = e.clientX - lastMouse.current.x;
    const dy = e.clientY - lastMouse.current.y;
    dragVelocity.current = { x: dx, y: dy };
    lastMouse.current = { x: e.clientX, y: e.clientY };
  }, []);

  const handlePointerUp = useCallback(() => {
    isDragging.current = false;
  }, []);

  const handleWheel = useCallback((e: WheelEvent) => {
    if (isOverCard(e)) return;
    scrollDelta.current += e.deltaY;
  }, [isOverCard]);

  useEffect(() => {
    window.addEventListener('pointerdown', handlePointerDown);
    window.addEventListener('pointermove', handlePointerMove);
    window.addEventListener('pointerup', handlePointerUp);
    window.addEventListener('wheel', handleWheel, { passive: true });

    return () => {
      window.removeEventListener('pointerdown', handlePointerDown);
      window.removeEventListener('pointermove', handlePointerMove);
      window.removeEventListener('pointerup', handlePointerUp);
      window.removeEventListener('wheel', handleWheel);
    };
  }, [handlePointerDown, handlePointerMove, handlePointerUp, handleWheel]);

  return (
    <div className="solana-bg-canvas">
      <Canvas
        shadows
        camera={{ position: [0, 0, 8], fov: 50 }}
        dpr={[1, 2]}
        gl={{ antialias: true, alpha: true }}
        style={{ background: 'transparent' }}
      >
        {/* Ambient fill */}
        <ambientLight intensity={isDark ? 0.35 : 0.65} />

        {/* Main directional light — casts shadows */}
        <directionalLight
          position={[4, 4, 8]}
          intensity={isDark ? 1.3 : 1.0}
          color={isDark ? '#8b5cf6' : '#60a5fa'}
          castShadow
          shadow-mapSize-width={1024}
          shadow-mapSize-height={1024}
          shadow-camera-far={30}
          shadow-camera-left={-6}
          shadow-camera-right={6}
          shadow-camera-top={6}
          shadow-camera-bottom={-6}
          shadow-bias={-0.002}
        />

        {/* Accent fill from below-left */}
        <directionalLight
          position={[-5, -3, 3]}
          intensity={isDark ? 0.5 : 0.35}
          color={isDark ? '#14F195' : '#34d399'}
        />

        {/* Front key for gradient highlights */}
        <pointLight
          position={[0, 0, 6]}
          intensity={isDark ? 0.7 : 0.4}
          color={isDark ? '#c084fc' : '#93c5fd'}
        />

        {/* Rim light for depth */}
        <pointLight
          position={[-3, 2, -4]}
          intensity={isDark ? 0.4 : 0.25}
          color={isDark ? '#14F195' : '#60a5fa'}
        />

        {/* Environment reflections */}
        <Environment preset={isDark ? 'night' : 'city'} />

        {/* 3D Logo Coin */}
        <LogoCoin3D
          isDark={isDark}
          dragVelocity={dragVelocity}
          isDragging={isDragging}
          scrollDelta={scrollDelta}
        />
      </Canvas>
    </div>
  );
}
