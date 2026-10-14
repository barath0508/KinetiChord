import type { Metadata, Viewport } from 'next';
import './globals.css';

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL || 'https://kinetichord.vercel.app';

export const viewport: Viewport = {
  themeColor: '#0b0d12',
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
};

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: {
    default: 'KinetiChord — Interactive Guitar, Drum & Live Sheet Music Sandbox',
    template: '%s | KinetiChord',
  },
  description:
    'Play virtual guitar strings and drums with kinetic physics. Place geometric triggers, generate real-time treble clef sheet music, and export to MIDI or ABC notation in your browser.',
  keywords: [
    'interactive music maker',
    'online guitar simulator',
    'generative music sequencer',
    'live sheet music generator',
    'MIDI exporter online',
    'ABC notation generator',
    'kinetic music sandbox',
    'web audio synthesizer',
  ],
  authors: [{ name: 'KinetiChord Studio' }],
  creator: 'KinetiChord Studio',
  alternates: {
    canonical: '/',
  },
  openGraph: {
    type: 'website',
    locale: 'en_US',
    url: SITE_URL,
    siteName: 'KinetiChord',
    title: 'KinetiChord — Kinetic Guitar, Drums & Live Sheet Music',
    description:
      'Trigger guitar strings and drums with kinetic orbs, watch live sheet music write itself, and export MIDI or ABC notation.',
    images: [
      {
        url: '/og-image.png',
        width: 1200,
        height: 630,
        alt: 'KinetiChord Interactive Music & Sheet Music Canvas',
      },
    ],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'KinetiChord — Interactive Guitar, Drum & Sheet Music Sandbox',
    description:
      'Create generative guitar & drum grooves with kinetic physics and export directly to MIDI or ABC sheet music.',
    images: ['/og-image.png'],
  },
  robots: {
    index: true,
    follow: true,
    googleBot: {
      index: true,
      follow: true,
      'max-video-preview': -1,
      'max-image-preview': 'large',
      'max-snippet': -1,
    },
  },
  verification: {
    google: 'google4867b014d6b90931',
  },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className="dark">
      <body className="bg-[#0b0d12] text-slate-100 antialiased selection:bg-sky-500 selection:text-white overflow-hidden">
        {children}
      </body>
    </html>
  );
}
