import type { Metadata } from 'next';
import { IssuePageClient } from './IssuePageClient';

export const metadata: Metadata = {
  title: 'Issue · Clawtask',
  description: 'Clawtask issue detail',
};

export default function IssuePage() {
  return <IssuePageClient />;
}
