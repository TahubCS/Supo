import { ReactNode } from 'react';

interface BadgeProps {
  variant?: 'urgent' | 'normal' | 'low' | 'online' | 'busy' | 'offline';
  children: ReactNode;
  className?: string;
}

export function Badge({ variant = 'normal', children, className = '' }: BadgeProps) {
  const variantStyles = {
    urgent: 'bg-[--status-offline] text-white',
    normal: 'bg-[--primary] text-white',
    low: 'bg-[--muted] text-[--muted-foreground]',
    online: 'bg-[--status-online] text-white',
    busy: 'bg-[--status-busy] text-white',
    offline: 'bg-[--muted] text-[--muted-foreground]',
  };

  return (
    <span className={`inline-flex items-center px-2 py-1 rounded text-xs ${variantStyles[variant]} ${className}`}>
      {children}
    </span>
  );
}
