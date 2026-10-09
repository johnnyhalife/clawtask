import React from 'react';

export function RequestState({ loading, error, label = 'issues', onRetry }: {
  loading: boolean; error: string | null; label?: string; onRetry: () => void;
}) {
  if (error) return (
    <div role="alert" className="px-6 py-3 text-sm" style={{ color: 'var(--color-base-800)' }}>
      Could not load {label}: {error}{' '}
      <button type="button" onClick={onRetry} className="underline">Retry</button>
    </div>
  );
  if (loading) return <div role="status" className="px-6 py-3 text-sm" style={{ color: 'var(--color-base-500)' }}>Loading {label}…</div>;
  return null;
}
