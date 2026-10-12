import type { Metadata } from 'next';
import './globals.css';
export const metadata: Metadata = {
  title: 'RepoPilot',
  description: 'AI-powered code review and debugging assistant',
};
export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
