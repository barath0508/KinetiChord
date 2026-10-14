# KinetiChord

> **Interactive Guitar, Drum & Live Sheet Music Sandbox**

KinetiChord is a generative music sandbox where moving kinetic orbs pluck virtual guitar strings and trigger geometric drum nodes while transcribing notes onto a real-time treble clef stave.

---

## Features

- **6-String Guitar Engine**: Polyphonic Web Audio synthesizers with realistic pluck envelopes and harmonic resonance.
- **Dynamic Scales & Tunings**: Instant switching between:
  - Standard (E2–E4)
  - Drop D
  - Minor Pentatonic
  - Hirajoshi (Japanese Pentatonic)
- **Geometric Drum Triggers**:
  - **Hexagons**: Synthesized Kick drum (sine pitch envelope)
  - **Diamonds / Squares**: Snare drum (shaped noise burst)
  - **Triangles**: Hi-Hat (crisp highpass transient)
- **Dual Physics Engine**:
  - **Bounce**: Classic billiard reflection mechanics.
  - **Orbit**: Gravitational orbital simulation causing kinetic orbs to curve around placed shapes to generate polyrhythmic grooves.
- **Studio DSP Audio Chain**: Built-in stereo delay network with lowpass feedback filter and master dynamics compression.
- **Live Sheet Music Stave**: Real-time treble clef transcription with ledger lines, noteheads, stems, and percussion notation.
- **Live Replay**: Play back your recorded sequence at tempo.
- **Export Formats**:
  - Standard Multi-Track **MIDI (.mid)**
  - **ABC Notation (.abc)**
- **Viral URL Patch Sharing**: Encodes the entire layout, tunings, and orbs into a Base64 shareable URL parameter (`?patch=...`).

---

## Getting Started

First, run the development server:

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser to launch the studio.

---

## Tech Stack

- **Framework**: Next.js 16 (Turbopack, App Router)
- **Language**: TypeScript
- **Styling**: Tailwind CSS
- **Icons**: Lucide React
- **Audio & Physics**: HTML5 Canvas & Web Audio API
