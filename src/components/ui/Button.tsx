'use client';

import { ButtonHTMLAttributes, forwardRef } from 'react';

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'ghost' | 'danger';
  size?: 'sm' | 'md';
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  ({ variant = 'secondary', size = 'md', className = '', children, ...props }, ref) => {
    const base = 'inline-flex items-center gap-2 font-medium rounded transition-colors disabled:opacity-50 disabled:cursor-not-allowed';
    const sizeClass = size === 'sm' ? 'px-3 py-1.5 text-sm' : 'px-4 py-2 text-sm';
    const variantClass = {
      primary: 'bg-blue-600 hover:bg-blue-700 text-white',
      secondary: 'bg-zinc-800 hover:bg-zinc-700 text-zinc-200 border border-zinc-700',
      ghost: 'hover:bg-zinc-800 text-zinc-400 hover:text-zinc-200',
      danger: 'bg-red-600/20 hover:bg-red-600/30 text-red-400 border border-red-500/30',
    }[variant];

    return (
      <button ref={ref} className={`${base} ${sizeClass} ${variantClass} ${className}`} {...props}>
        {children}
      </button>
    );
  }
);
Button.displayName = 'Button';
