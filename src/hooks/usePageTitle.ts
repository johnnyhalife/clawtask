'use client';

import { useEffect } from 'react';
import { useApi } from '@/hooks/useApi';

export function usePageTitle(page: string) {
  const { data: config } = useApi<Record<string, string>>('/api/v1/config');
  const workspace = config?.appName || 'Clawtask';

  useEffect(() => {
    document.title = `clawtask | ${workspace} | ${page}`;
  }, [workspace, page]);
}
