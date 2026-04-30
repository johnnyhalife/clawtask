'use client';

import Link from 'next/link';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useState, useEffect } from 'react';
import { Project, Tag } from '@/types';
import { useApi } from '@/hooks/useApi';
import { useSse } from '@/hooks/useSse';

const navItems = [
  { href: '/?tab=pulse', label: 'Pulse', icon: '⚡', tab: 'pulse' },
  { href: '/?tab=mine', label: 'Mine', icon: '👤', tab: 'mine' },
  { href: '/?tab=recent', label: 'Recent', icon: '🕐', tab: 'recent' },
  { href: '/?tab=all', label: 'All Tasks', icon: '📋', tab: 'all' },
];

export function Sidebar({ appName }: { appName: string }) {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const router = useRouter();
  const activeTab = searchParams.get('tab') || 'pulse';

  const { data: projects, reload: reloadProjects } = useApi<Project[]>('/api/v1/projects');
  const { data: tags, reload: reloadTags } = useApi<Tag[]>('/api/v1/tags');
  const [projectsOpen, setProjectsOpen] = useState(true);
  const [tagsOpen, setTagsOpen] = useState(true);

  useSse((event) => {
    if (event.type === 'task.created' || event.type === 'task.updated') {
      // Projects/tags don't change per task event, but reload occasionally
    }
  });

  // Reload on project/tag creation
  useEffect(() => {
    const handler = () => {
      reloadProjects();
      reloadTags();
    };
    window.addEventListener('clawtask:refresh-sidebar', handler);
    return () => window.removeEventListener('clawtask:refresh-sidebar', handler);
  }, [reloadProjects, reloadTags]);

  return (
    <aside className="w-60 flex-shrink-0 bg-[#131316] border-r border-zinc-800 flex flex-col h-full overflow-hidden">
      {/* App name */}
      <div className="px-4 py-4 border-b border-zinc-800">
        <h1 className="text-base font-semibold text-zinc-100 flex items-center gap-2">
          <span className="text-blue-400">◈</span>
          {appName}
        </h1>
      </div>

      {/* Nav */}
      <nav className="flex-1 overflow-y-auto py-3">
        <ul className="space-y-0.5 px-2">
          {navItems.map((item) => {
            const active = pathname === '/' && activeTab === item.tab;
            return (
              <li key={item.tab}>
                <Link
                  href={item.href}
                  className={`flex items-center gap-2.5 px-2.5 py-1.5 rounded text-sm transition-colors ${
                    active
                      ? 'bg-blue-600/20 text-blue-400'
                      : 'text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800'
                  }`}
                >
                  <span className="text-base">{item.icon}</span>
                  {item.label}
                </Link>
              </li>
            );
          })}
        </ul>

        {/* Projects */}
        <div className="mt-4 px-2">
          <button
            onClick={() => setProjectsOpen(!projectsOpen)}
            className="flex items-center justify-between w-full px-2.5 py-1 text-xs font-semibold text-zinc-500 uppercase tracking-wider hover:text-zinc-400"
          >
            <span>Projects</span>
            <span>{projectsOpen ? '▾' : '▸'}</span>
          </button>
          {projectsOpen && (
            <ul className="mt-1 space-y-0.5">
              {(projects || []).map((project) => (
                <li key={project.id}>
                  <button
                    onClick={() => router.push(`/?tab=all&projectId=${project.id}`)}
                    className={`flex items-center gap-2 w-full px-2.5 py-1.5 rounded text-sm transition-colors ${
                      searchParams.get('projectId') === project.id
                        ? 'bg-zinc-700 text-zinc-100'
                        : 'text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800'
                    }`}
                  >
                    <span
                      className="w-2.5 h-2.5 rounded-full flex-shrink-0"
                      style={{ backgroundColor: project.color }}
                    />
                    <span className="truncate">{project.name}</span>
                  </button>
                </li>
              ))}
              {(!projects || projects.length === 0) && (
                <li className="px-2.5 py-1 text-xs text-zinc-600">No projects yet</li>
              )}
            </ul>
          )}
        </div>

        {/* Tags */}
        <div className="mt-4 px-2">
          <button
            onClick={() => setTagsOpen(!tagsOpen)}
            className="flex items-center justify-between w-full px-2.5 py-1 text-xs font-semibold text-zinc-500 uppercase tracking-wider hover:text-zinc-400"
          >
            <span>Tags</span>
            <span>{tagsOpen ? '▾' : '▸'}</span>
          </button>
          {tagsOpen && (
            <div className="mt-1 flex flex-wrap gap-1 px-2.5">
              {(tags || []).map((tag) => (
                <button
                  key={tag.id}
                  onClick={() => router.push(`/?tab=all&tagId=${tag.id}`)}
                  className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium border transition-opacity hover:opacity-80"
                  style={{
                    borderColor: tag.color + '50',
                    backgroundColor: tag.color + '20',
                    color: tag.color,
                  }}
                >
                  {tag.name}
                </button>
              ))}
              {(!tags || tags.length === 0) && (
                <span className="text-xs text-zinc-600">No tags yet</span>
              )}
            </div>
          )}
        </div>
      </nav>

      {/* Settings */}
      <div className="border-t border-zinc-800 px-2 py-3">
        <Link
          href="/settings"
          className="flex items-center gap-2.5 px-2.5 py-1.5 rounded text-sm text-zinc-500 hover:text-zinc-200 hover:bg-zinc-800 transition-colors"
        >
          <span>⚙️</span>
          Settings
        </Link>
      </div>
    </aside>
  );
}
