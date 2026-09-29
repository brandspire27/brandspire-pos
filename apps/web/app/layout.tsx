import type { ReactNode } from 'react';
import './globals.css';

export const metadata = {
  title: 'Brandspire POS',
  description: 'Simple Billing. Smarter Business.'
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en" data-scroll-behavior="smooth">
      <body>{children}</body>
    </html>
  );
}
