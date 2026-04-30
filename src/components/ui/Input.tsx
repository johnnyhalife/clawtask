'use client';

import { InputHTMLAttributes, TextareaHTMLAttributes, forwardRef } from 'react';

const inputStyle: React.CSSProperties = {
  width: '100%',
  padding: '8px 12px',
  background: 'var(--color-base-150)',
  border: '1px solid var(--color-base-300)',
  borderRadius: 6,
  fontSize: '0.875rem',
  color: 'var(--color-base-800)',
  fontFamily: "'Instrument Sans', sans-serif",
  outline: 'none',
  transition: 'border-color 0.15s',
};

export const Input = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement>>(
  ({ style, ...props }, ref) => (
    <input
      ref={ref}
      style={{ ...inputStyle, ...style }}
      onFocus={e => (e.currentTarget.style.borderColor = 'var(--color-accent)')}
      onBlur={e => (e.currentTarget.style.borderColor = 'var(--color-base-300)')}
      {...props}
    />
  )
);
Input.displayName = 'Input';

export const Textarea = forwardRef<HTMLTextAreaElement, TextareaHTMLAttributes<HTMLTextAreaElement>>(
  ({ style, ...props }, ref) => (
    <textarea
      ref={ref}
      style={{ ...inputStyle, resize: 'none', ...style }}
      onFocus={e => (e.currentTarget.style.borderColor = 'var(--color-accent)')}
      onBlur={e => (e.currentTarget.style.borderColor = 'var(--color-base-300)')}
      {...props}
    />
  )
);
Textarea.displayName = 'Textarea';

export const Select = forwardRef<HTMLSelectElement, React.SelectHTMLAttributes<HTMLSelectElement>>(
  ({ style, children, ...props }, ref) => (
    <select
      ref={ref}
      style={{ ...inputStyle, ...style }}
      onFocus={e => (e.currentTarget.style.borderColor = 'var(--color-accent)')}
      onBlur={e => (e.currentTarget.style.borderColor = 'var(--color-base-300)')}
      {...props}
    >
      {children}
    </select>
  )
);
Select.displayName = 'Select';
