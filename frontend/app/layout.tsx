import './globals.css';
import type { Metadata } from 'next';
import { ReactNode } from 'react';

export const metadata: Metadata = {
  title: 'AI Creative Battle Room',
  description: 'A real-time multiplayer creative competition powered by AI. Host a challenge, submit your best concept, and let AI bring it to life.',
  keywords: ['AI', 'creative', 'battle', 'multiplayer', 'real-time'],
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="" />
      </head>
      <body>{children}</body>
    </html>
  );
}
