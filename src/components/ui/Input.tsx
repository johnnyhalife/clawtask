'use client';

import { InputHTMLAttributes, TextareaHTMLAttributes, forwardRef } from 'react';

export const Input = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement>>(
  ({ className = '', ...props }, ref) => (
    <input
      ref={ref}
      className={`w-full px-3 py-2 bg-zinc-900 border border-zinc-700 rounded text-sm text-zinc-200 placeholder-zinc-500 focus:outline-none focus:border-blue-500 transition-colors ${className}`}
      {...props}
    />
  )
);
Input.displayName = 'Input';

export const Textarea = forwardRef<HTMLTextAreaElement, TextareaHTMLAttributes<HTMLTextAreaElement>>(
  ({ className = '', ...props }, ref) => (
    <textarea
      ref={ref}
      className={`w-full px-3 py-2 bg-zinc-900 border border-zinc-700 rounded text-sm text-zinc-200 placeholder-zinc-500 focus:outline-none focus:border-blue-500 transition-colors resize-none ${className}`}
      {...props}
    />
  )
);
Textarea.displayName = 'Textarea';

export const Select = forwardRef<HTMLSelectElement, React.SelectHTMLAttributes<HTMLSelectElement>>(
  ({ className = '', children, ...props }, ref) => (
    <select
      ref={ref}
      className={`w-full px-3 py-2 bg-zinc-900 border border-zinc-700 rounded text-sm text-zinc-200 focus:outline-none focus:border-blue-500 transition-colors ${className}`}
      {...props}
    >
      {children}
    </select>
  )
);
Select.displayName = 'Select';
