import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'Clawtask',
  description: 'Agent-native task manager',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
