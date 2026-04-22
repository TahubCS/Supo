import Image from 'next/image';
import { ReactNode } from 'react';

interface AvatarProps {
  src?: string;
  alt?: string;
  fallback?: string;
  status?: 'online' | 'busy' | 'offline' | null;
  size?: 'sm' | 'md' | 'lg';
  children?: ReactNode;
}

export function Avatar({
  src,
  alt = '',
  fallback = '?',
  status = null,
  size = 'md',
  children
}: AvatarProps) {
  const sizeStyles = {
    sm: 'w-8 h-8 text-xs',
    md: 'w-10 h-10 text-sm',
    lg: 'w-12 h-12 text-base',
  };

  const imageSizes = {
    sm: 32,
    md: 40,
    lg: 48,
  };

  const statusColors = {
    online: 'bg-[--status-online]',
    busy: 'bg-[--status-busy]',
    offline: 'bg-[--status-offline]',
  };

  return (
    <div className="relative inline-block">
      <div className={`${sizeStyles[size]} rounded-full bg-[--primary] text-[--primary-foreground] flex items-center justify-center overflow-hidden`}>
        {src ? (
          <Image
            src={src}
            alt={alt}
            width={imageSizes[size]}
            height={imageSizes[size]}
            className="w-full h-full object-cover"
          />
        ) : children ? (
          children
        ) : (
          <span>{fallback}</span>
        )}
      </div>
      {status && (
        <span
          className={`absolute bottom-0 right-0 w-3 h-3 rounded-full border-2 border-white ${statusColors[status]}`}
          aria-label={`Status: ${status}`}
        />
      )}
    </div>
  );
}
