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

export function Octagon({ children, color, size = 160, onClick, delay = 0, glow = true, className }: Props) {
  return (
    <motion.button
      type="button"
      onClick={onClick}
      initial={{ opacity: 0, y: 24, scale: 0.9 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      transition={{ delay, type: 'spring', stiffness: 120, damping: 14 }}
      whileHover={{ scale: 1.06, y: -6 }}
      whileTap={{ scale: 0.97 }}
      className={`group relative outline-none focus-visible:ring-4 focus-visible:ring-primary/60 ${className ?? ''}`}
      style={{
        width: size,
        height: size,
        filter: glow ? `drop-shadow(0 20px 40px ${color}55)` : undefined,
      }}
      data-testid={`oct-${color}`}
    >
      {/* Outer fill */}
      <div
        className="absolute inset-0 oct-clip"
        style={{
          background: `linear-gradient(145deg, ${color} 0%, ${color}cc 55%, #11102a 130%)`,
        }}
      />
      {/* Inner dark layer */}
      <div
        className="absolute oct-clip"
        style={{
          inset: 6,
          background: 'linear-gradient(180deg, rgba(10,8,32,0.88) 0%, rgba(10,8,32,0.55) 100%)',
        }}
      />
      {/* Hover glow */}
      <div
        className="absolute oct-clip opacity-0 group-hover:opacity-100 transition-opacity duration-300"
        style={{
          inset: 0,
          background: `radial-gradient(ellipse at center, ${color}44 0%, transparent 70%)`,
        }}
      />
      {/* Content */}
      <div className="relative z-10 flex h-full w-full flex-col items-center justify-center px-6 text-center">
        {children}
      </div>
    </motion.button>
  );
}
