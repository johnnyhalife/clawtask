import type { Metadata } from 'next';
import { SettingsPageClient } from './SettingsPageClient';

export const metadata: Metadata = {
  title: 'Settings · Clawtask',
  description: 'Clawtask workspace settings',
};

export default function SettingsPage() {
  return <SettingsPageClient />;
}
