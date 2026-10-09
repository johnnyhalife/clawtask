import type { Metadata } from 'next';
import { IssuePageClient } from './IssuePageClient';

export const metadata: Metadata = {
  title: 'Issue · Clawtask',
  description: 'Clawtask issue detail',
};

export default async function IssuePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  // Reset drafts, pickers and timeline state when moving to another issue.
  return <IssuePageClient key={id} />;
}
