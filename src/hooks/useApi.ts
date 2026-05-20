'use client';

import { useEffect, useState, useCallback } from 'react';

const TOKEN_KEY = 'clawtask_ui_token';

export async function getToken(): Promise<string> {
  const cached = typeof window !== 'undefined' ? localStorage.getItem(TOKEN_KEY) : null;
  if (cached) return cached;

  // Fetch from server and cache
  const res = await fetch('/api/v1/auth/token');
  const json = await res.json();
  if (!json.ok || !json.data?.token) throw new Error('Failed to fetch UI token');
  localStorage.setItem(TOKEN_KEY, json.data.token);
  return json.data.token;
}

function authHeaders(token: string, extra?: Record<string, string>): Record<string, string> {
  return { 'Authorization': `Bearer ${token}`, ...extra };
}

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
  const token = await getToken();
  const res = await fetch(url, {
    method: 'POST',
    headers: authHeaders(token, { 'Content-Type': 'application/json' }),
    body: JSON.stringify(body),
  });
  const json = await res.json();
  if (!json.ok) throw new Error(json.error?.message || 'Unknown error');
  return json.data as T;
}

export async function apiPatch<T>(url: string, body: unknown): Promise<T> {
  const token = await getToken();
  const res = await fetch(url, {
    method: 'PATCH',
    headers: authHeaders(token, { 'Content-Type': 'application/json' }),
    body: JSON.stringify(body),
  });
  const json = await res.json();
  if (!json.ok) throw new Error(json.error?.message || 'Unknown error');
  return json.data as T;
}

export async function apiDelete(url: string): Promise<void> {
  const token = await getToken();
  const res = await fetch(url, {
    method: 'DELETE',
    headers: authHeaders(token),
  });
  const json = await res.json();
  if (!json.ok) throw new Error(json.error?.message || 'Unknown error');
}
