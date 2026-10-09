import type { Task } from '@/types';

export async function fetchTaskCollection(url: string, signal?: AbortSignal, request: typeof fetch = fetch): Promise<{ tasks: Task[]; total: number }> {
  const tasks = new Map<string, Task>();
  const [pathname, query = ''] = url.split('?');
  const params = new URLSearchParams(query);
  params.set('limit', '500');
  for (let page = 1; ; page++) {
    params.set('page', String(page));
    const response = await request(pathname + '?' + params.toString(), { signal });
    const json = await response.json();
    if (!response.ok || !json.ok) throw new Error(json.error?.message || 'Failed to load issues');
    const data = json.data as { tasks: Task[]; total: number; limit: number };
    for (const task of data.tasks) tasks.set(task.id, task);
    if (page * data.limit >= data.total) return { tasks: [...tasks.values()], total: tasks.size };
    if (!data.tasks.length) throw new Error('Incomplete issue page');
  }
}
