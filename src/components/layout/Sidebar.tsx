'use client';

import { Suspense } from 'react';
import Link from 'next/link';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useState, useEffect } from 'react';
import { useIsMobile } from '@/hooks/useIsMobile';
import { Project, Tag } from '@/types';
import { useApi } from '@/hooks/useApi';
import { useSse } from '@/hooks/useSse';

const PULSE_ITEMS = [
  {
    href: '/?tab=pulse',
    label: 'Pulse',
    tab: 'pulse',
    icon: (
      <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <polyline points="22 12 18 12 15 21 9 3 6 12 2 12" />
      </svg>
    ),
  },
];

const WORK_ITEMS = [
  {
    href: '/?tab=all',
    label: 'All Issues',
    tab: 'all',
    icon: (
      <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <line x1="8" y1="6" x2="21" y2="6" />
        <line x1="8" y1="12" x2="21" y2="12" />
        <line x1="8" y1="18" x2="21" y2="18" />
        <line x1="3" y1="6" x2="3.01" y2="6" />
        <line x1="3" y1="12" x2="3.01" y2="12" />
        <line x1="3" y1="18" x2="3.01" y2="18" />
      </svg>
    ),
  },
];

function NavLink({ href, active, icon, label }: { href: string; active: boolean; icon: React.ReactNode; label: string }) {
  return (
    <Link
      href={href}
      className="flex items-center gap-2.5 px-2.5 py-1.5 rounded text-sm transition-colors"
      style={{
        color: active ? 'var(--color-base-900)' : 'var(--color-base-600)',
        background: active ? 'rgba(128,128,128,0.1)' : 'transparent',
        fontFamily: "'Instrument Sans', sans-serif", fontWeight: 500, fontSize: '0.8125rem',
      }}
      onMouseEnter={(e) => { if (!active) Object.assign((e.currentTarget as HTMLElement).style, { background: 'rgba(128,128,128,0.06)', color: 'var(--color-base-800)' }); }}
      onMouseLeave={(e) => { if (!active) Object.assign((e.currentTarget as HTMLElement).style, { background: 'transparent', color: 'var(--color-base-600)' }); }}
    >
      <span style={{ color: active ? 'var(--color-base-900)' : 'var(--color-base-600)' }}>{icon}</span>
      <span>{label}</span>
    </Link>
  );
}

function SidebarInner({ appName, workspaceLogo }: { appName: string; workspaceLogo?: string }) {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const { push } = useRouter();
  const activeTab = searchParams.get('tab') || 'pulse';
  const isMobile = useIsMobile();
  const { data: projects, reload: reloadProjects } = useApi<Project[]>('/api/v1/projects');
  const { data: tags, reload: reloadTags } = useApi<Tag[]>('/api/v1/tags');
  const [projectsOpen, setProjectsOpen] = useState(true);
  const [tagsExpanded, setTagsExpanded] = useState(false);
  const TAG_LIMIT = 10;

  useSse((_event) => {
    // Projects/tags don't change per task event
  });

  useEffect(() => {
    const handler = () => {
      reloadProjects();
      reloadTags();
    };
    window.addEventListener('clawtask:refresh-sidebar', handler);
    return () => window.removeEventListener('clawtask:refresh-sidebar', handler);
  }, [reloadProjects, reloadTags]);

  // On mobile, sidebar is hidden — BottomNav takes over
  if (isMobile) return null;

  // Get initials from appName
  const initials = appName
    .split(/\s+/)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase() || '')
    .join('');

  return (
    <aside className="w-[220px] flex-shrink-0 flex flex-col h-full overflow-hidden" style={{ background: 'var(--color-base)', borderRight: '1px solid var(--color-base-300)' }}>
      {/* Workspace header */}
      <div className="px-3 flex items-center gap-2.5" style={{ height: 48, borderBottom: '1px solid var(--color-base-300)', flexShrink: 0 }}>
        {workspaceLogo ? (
          <img
            src={workspaceLogo}
            alt={appName}
            className="flex-shrink-0 w-7 h-7 rounded-md object-cover"
          />
        ) : (
          <div
            className="flex-shrink-0 w-7 h-7 rounded-md flex items-center justify-center text-white text-xs font-bold"
            style={{ background: '#3189FF', fontFamily: "'Darker Grotesque', sans-serif" }}
          >
            {initials}
          </div>
        )}
        <span className="workspace-name truncate">{appName}</span>
      </div>

      {/* Nav */}
      <nav className="flex-1 overflow-y-auto py-2">
        {/* Pulse section */}
        <div className="px-3 mb-1">
          <span className="section-label">Pulse</span>
        </div>
        <ul className="space-y-px px-2 mb-4">
          {PULSE_ITEMS.map((item) => {
            const active = pathname === '/' && activeTab === item.tab;
            return (
              <li key={item.tab}>
                <NavLink href={item.href} active={active} icon={item.icon} label={item.label} />
              </li>
            );
          })}
        </ul>

        {/* Work section */}
        <div className="px-3 mb-1">
          <span className="section-label">Work</span>
        </div>
        <ul className="space-y-px px-2 mb-4">
          {WORK_ITEMS.map((item) => {
            const active = pathname === '/' && activeTab === item.tab;
            return (
              <li key={item.tab}>
                <NavLink href={item.href} active={active} icon={item.icon} label={item.label} />
              </li>
            );
          })}
        </ul>

        {/* Projects */}
        <div className="px-3 mb-1">
          <span className="section-label">Projects</span>
        </div>
        <div className="px-2 mb-4">
          <ul className="space-y-px">
            {(projects || []).map((project) => {
              const isActive = searchParams.get('projectId') === project.id;
              return (
                <li key={project.id}>
                  <button
                    onClick={() => push(`/?tab=all&projectId=${project.id}`)}
                    className="flex items-center gap-2 w-full px-2.5 py-1.5 rounded text-sm transition-colors text-left"
                    style={
                      isActive
                        ? { background: 'rgba(128,128,128,0.1)', color: 'var(--color-base-900)' }
                        : { color: 'var(--color-base-600)' }
                    }
                    onMouseEnter={(e) => { if (!isActive) Object.assign((e.currentTarget as HTMLElement).style, { background: 'rgba(128,128,128,0.06)', color: 'var(--color-base-800)' }); }}
                    onMouseLeave={(e) => { if (!isActive) Object.assign((e.currentTarget as HTMLElement).style, { background: '', color: '#6B7280' }); }}
                  >
                    <span
                      className="w-2.5 h-2.5 rounded-full flex-shrink-0"
                      style={{ backgroundColor: project.color }}
                    />
                    <span className="truncate" style={{ fontFamily: "'Instrument Sans', sans-serif", fontWeight: 500, fontSize: '0.8125rem' }}>{project.name}</span>
                  </button>
                </li>
              );
            })}
            {(!projects || projects.length === 0) && (
              <li className="px-2.5 py-1 text-xs" style={{ color: 'var(--color-base-400)', fontFamily: "'Instrument Sans', sans-serif" }}>No projects yet</li>
            )}
          </ul>
        </div>

        {/* Tags — Gmail Labels style */}
        <div className="px-3 mb-1">
          <span className="section-label">Tags</span>
        </div>
        <ul className="space-y-px px-2 mb-2">
          {(tags || []).slice(0, tagsExpanded ? undefined : TAG_LIMIT).map((tag) => {
            const isActive = searchParams.get('tagId') === tag.id;
            return (
              <li key={tag.id}>
                <button
                  onClick={() => push(`/?tab=all&tagId=${tag.id}`)}
                  className="flex items-center gap-2.5 w-full px-2.5 py-1.5 rounded text-left transition-colors"
                  style={{
                    background: isActive ? 'rgba(128,128,128,0.1)' : 'transparent',
                    border: 'none', cursor: 'pointer',
                  }}
                  onMouseEnter={e => { if (!isActive) (e.currentTarget as HTMLElement).style.background = 'rgba(128,128,128,0.06)'; }}
                  onMouseLeave={e => { if (!isActive) (e.currentTarget as HTMLElement).style.background = 'transparent'; }}
                >
                  {/* Tag icon — filled label shape */}
                  <svg width="14" height="14" viewBox="0 0 24 24" fill={tag.color} stroke="none" style={{ flexShrink: 0 }}>
                    <path d="M20.59 13.41l-7.17 7.17a2 2 0 01-2.83 0L2 12V2h10l8.59 8.59a2 2 0 010 2.82z" />
                  </svg>
                  <span className="truncate" style={{ fontFamily: "'Instrument Sans', sans-serif", fontWeight: 500, fontSize: '0.8125rem', color: isActive ? 'var(--color-base-900)' : 'var(--color-base-600)' }}>
                    {tag.name}
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
        {(tags || []).length > TAG_LIMIT && (
          <button
            onClick={() => setTagsExpanded(v => !v)}
            className="flex items-center gap-1.5 px-5 py-1 mb-3 text-xs"
            style={{ color: 'var(--color-base-500)', background: 'none', border: 'none', cursor: 'pointer', fontFamily: "'Instrument Sans', sans-serif" }}
            onMouseEnter={e => (e.currentTarget.style.color = 'var(--color-base-700)')}
            onMouseLeave={e => (e.currentTarget.style.color = 'var(--color-base-500)')}
          >
            {tagsExpanded ? 'Show less' : `${(tags || []).length - TAG_LIMIT} more…`}
          </button>
        )}
        {(!tags || tags.length === 0) && (
          <div className="px-5 mb-3 text-xs" style={{ color: 'var(--color-base-400)', fontFamily: "'Instrument Sans', sans-serif" }}>No tags yet</div>
        )}
      </nav>

      {/* Footer */}
      <div className="px-2 py-2.5" style={{ borderTop: '1px solid var(--color-base-300)' }}>
        <Link
          href="/settings"
          className="flex items-center gap-2.5 px-2.5 py-1.5 rounded text-sm transition-colors"
          style={{ color: 'var(--color-base-600)', fontFamily: "'Instrument Sans', sans-serif" }}
          onMouseEnter={(e) => Object.assign((e.currentTarget as HTMLElement).style, { background: 'rgba(128,128,128,0.06)', color: 'var(--color-base-800)' })}
          onMouseLeave={(e) => Object.assign((e.currentTarget as HTMLElement).style, { background: '', color: '#6B7280' })}
        >
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="12" cy="12" r="3" />
            <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
          </svg>
          <span style={{ fontSize: '0.8125rem', fontWeight: 500 }}>Settings</span>
        </Link>
      </div>
    </aside>
  );
}

export function Sidebar({ appName, workspaceLogo }: { appName: string; workspaceLogo?: string }) {
  return (
    <Suspense fallback={<aside className="hidden md:flex flex-col w-56 flex-shrink-0" />}>
      <SidebarInner appName={appName} workspaceLogo={workspaceLogo} />
    </Suspense>
  );
}
