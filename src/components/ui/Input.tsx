'use client';

import { InputHTMLAttributes, TextareaHTMLAttributes, Ref } from 'react';

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

interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  ref?: Ref<HTMLInputElement>;
}

export function Input({ style, ref, ...props }: InputProps) {
  return (
    <input
      ref={ref}
      style={{ ...inputStyle, ...style }}
      onFocus={e => (e.currentTarget.style.borderColor = 'var(--color-accent)')}
      onBlur={e => (e.currentTarget.style.borderColor = 'var(--color-base-300)')}
      {...props}
    />
  );
}

interface TextareaProps extends TextareaHTMLAttributes<HTMLTextAreaElement> {
  ref?: Ref<HTMLTextAreaElement>;
}

export function Textarea({ style, ref, ...props }: TextareaProps) {
  return (
    <textarea
      ref={ref}
      style={{ ...inputStyle, resize: 'none', ...style }}
      onFocus={e => (e.currentTarget.style.borderColor = 'var(--color-accent)')}
      onBlur={e => (e.currentTarget.style.borderColor = 'var(--color-base-300)')}
      {...props}
    />
  );
}

interface SelectProps extends React.SelectHTMLAttributes<HTMLSelectElement> {
  ref?: Ref<HTMLSelectElement>;
}

export function Select({ style, children, ref, ...props }: SelectProps) {
  return (
    <select
      ref={ref}
      style={{ ...inputStyle, ...style }}
      onFocus={e => (e.currentTarget.style.borderColor = 'var(--color-accent)')}
      onBlur={e => (e.currentTarget.style.borderColor = 'var(--color-base-300)')}
      {...props}
    >
      {children}
    </select>
  );
}
