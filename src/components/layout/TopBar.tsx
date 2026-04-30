'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';

export function TopBar() {
  const [query, setQuery] = useState('');
  const router = useRouter();

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    if (query.trim()) {
      router.push(`/?tab=all&q=${encodeURIComponent(query.trim())}`);
    }
  };

  return (
    <header className="h-12 border-b border-zinc-800 bg-[#0A0A0B] flex items-center justify-between px-4 flex-shrink-0">
      <form onSubmit={handleSearch} className="flex-1 max-w-md">
        <div className="relative">
          <span className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-500 text-sm">🔍</span>
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search tasks..."
            className="w-full pl-9 pr-4 py-1.5 bg-zinc-900 border border-zinc-700 rounded text-sm text-zinc-200 placeholder-zinc-500 focus:outline-none focus:border-blue-500 transition-colors"
          />
        </div>
      </form>

      <div className="flex items-center gap-2">
        <Link
          href="/settings"
          className="p-2 rounded text-zinc-500 hover:text-zinc-200 hover:bg-zinc-800 transition-colors"
          title="Settings"
        >
          ⚙️
        </Link>
      </div>
    </header>
  );
}
