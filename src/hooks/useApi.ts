'use client';

import { useEffect, useState, useCallback } from 'react';

export function useApi<T>(url: string, deps: unknown[] = []) {
  const [data, setData] = useState<T | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(url);
      const json = await res.json();
      if (json.ok) {
        setData(json.data);
      } else {
        setError(json.error?.message || 'Unknown error');
      }
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [url, ...deps]);

  useEffect(() => {
    load();
  }, [load]);

  return { data, loading, error, reload: load };
}

export async function apiPost<T>(url: string, body: unknown): Promise<T> {
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const json = await res.json();
  if (!json.ok) throw new Error(json.error?.message || 'Unknown error');
  return json.data as T;
}

export async function apiPatch<T>(url: string, body: unknown): Promise<T> {
  const res = await fetch(url, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const json = await res.json();
  if (!json.ok) throw new Error(json.error?.message || 'Unknown error');
  return json.data as T;
}

export async function apiDelete(url: string): Promise<void> {
  const res = await fetch(url, { method: 'DELETE' });
  const json = await res.json();
  if (!json.ok) throw new Error(json.error?.message || 'Unknown error');
}
