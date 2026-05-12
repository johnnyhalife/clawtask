import type { Metadata } from 'next';
import { Suspense } from 'react';
import { HomeContent } from './HomeContent';

export const metadata: Metadata = {
  title: 'Clawtask',
  description: 'Agent-native task manager',
};

export default function Home() {
  return (
    <Suspense fallback={<div className="h-screen bg-[#0A0A0B] flex items-center justify-center text-[var(--color-base-500)]">Loading…</div>}>
      <HomeContent />
    </Suspense>
  );
}
