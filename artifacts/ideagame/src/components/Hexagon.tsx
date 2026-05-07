import { motion } from 'framer-motion';
import type { ReactNode } from 'react';

interface Props {
  children?: ReactNode;
  color: string;
  size?: number;
  onClick?: () => void;
  delay?: number;
  glow?: boolean;
  className?: string;
}

export function Hexagon({ children, color, size = 320, onClick, delay = 0, glow = true, className }: Props) {
  const w = size;
  const h = Math.round(size * 1.06);
  return (
    <motion.button
      type="button"
      onClick={onClick}
      initial={{ opacity: 0, y: 24, scale: 0.9 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      transition={{ delay, type: 'spring', stiffness: 120, damping: 14 }}
      whileHover={{ scale: 1.05, y: -6 }}
      whileTap={{ scale: 0.97 }}
      className={`group relative outline-none focus-visible:ring-4 focus-visible:ring-primary/60 ${className ?? ''}`}
      style={{ width: w, height: h, filter: glow ? `drop-shadow(0 24px 48px ${color}55)` : undefined }}
      data-testid={`hex-${color}`}
    >
      <div
        className="absolute inset-0 hex-clip"
        style={{
          background: `linear-gradient(155deg, ${color} 0%, ${color}cc 60%, #11102a 120%)`,
        }}
      />
      <div
        className="absolute hex-clip"
        style={{
          inset: 6,
          background: 'linear-gradient(180deg, rgba(10,8,32,0.88) 0%, rgba(10,8,32,0.55) 100%)',
        }}
      />
      <div
        className="absolute hex-clip opacity-0 group-hover:opacity-100 transition-opacity"
        style={{
          inset: 0,
          background: `radial-gradient(ellipse at center, ${color}40 0%, transparent 70%)`,
        }}
      />
      <div className="relative z-10 flex h-full w-full flex-col items-center justify-center px-8 text-center">
        {children}
      </div>
    </motion.button>
  );
}
