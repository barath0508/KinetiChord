import { Suspense } from 'react';
import KineticStudio from '@/components/KineticStudio';

export default function HomePage() {
  const jsonLd = {
    '@context': 'https://schema.org',
    '@type': 'WebApplication',
    name: 'KinetiChord',
    applicationCategory: 'MultimediaApplication',
    operatingSystem: 'Any (Web Browser)',
    offers: {
      '@type': 'Offer',
      price: '0',
      priceCurrency: 'USD',
    },
    description:
      'An interactive web music sandbox where moving kinetic orbs pluck virtual guitar strings and trigger drum shapes while writing live sheet music.',
    featureList: [
      '6-String polyphonic Web Audio guitar synthesizer with multiple tunings',
      'Synthesized Kick, Snare, and Hi-Hat geometric triggers',
      'Orbital gravity and linear bounce kinetic particle physics',
      'Real-time scrolling treble clef sheet music stave transcription',
      'Standard MIDI (.mid) and ABC notation (.abc) file export',
      'Shareable URL patch encoding',
    ],
  };

  return (
    <main className="relative w-screen h-screen overflow-hidden bg-[#0b0d12]">
      {/* Structured Data for Google Rich Results */}
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />

      {/* Semantic SEO Content (Indexed by Search Crawlers & Screen Readers, Zero Visual Clutter) */}
      <section className="sr-only">
        <h1>KinetiChord — Online Interactive Guitar, Drum & Sheet Music Generator</h1>
        <p>
          Create generative melodies and percussion grooves directly in your browser. Place
          geometric shapes on six virtual guitar strings or in the drum field. Whenever a kinetic
          orb or your cursor moves past a shape, it plucks the corresponding note and transcribes it
          onto a live treble clef stave at the bottom of the screen.
        </p>
        <h2>Core Features</h2>
        <ul>
          <li>Play 6 guitar strings tuned to Standard, Drop D, Minor Pentatonic, or Hirajoshi scales.</li>
          <li>Trigger synthesized Kick, Snare, and Hi-Hat drums via geometric polygons.</li>
          <li>Switch between linear billiard bounce and gravitational orbital physics.</li>
          <li>Download recorded sheet music as a polyphonic MIDI file (.mid) or ABC notation (.abc).</li>
          <li>Share custom musical patches via URL parameters.</li>
        </ul>
      </section>

      <Suspense fallback={<div className="w-screen h-screen bg-[#0b0d12]" />}>
        <KineticStudio />
      </Suspense>
    </main>
  );
}
