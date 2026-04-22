import { ReactNode } from 'react';

interface CardProps {
  children: ReactNode;
  className?: string;
  glass?: boolean;
}

export function Card({ children, className = '', glass = true }: CardProps) {
  const glassStyles = glass
    ? 'bg-[--glass-background] border border-[--glass-border] backdrop-blur-xl'
    : 'bg-[--card]';

  return (
    <div className={`rounded-2xl ${glassStyles} ${className}`}>
      {children}
    </div>
  );
}
