'use client';

import React, { useEffect, useRef, useState, useCallback } from 'react';
import {
  Play,
  Square,
  Download,
  Share2,
  RotateCcw,
  Sparkles,
  Orbit,
  HelpCircle,
  X,
} from 'lucide-react';

// --- Scales & Tunings ---
type ScaleKey = 'standard' | 'dropD' | 'pentatonic' | 'hirajoshi';

interface ScaleConfig {
  label: string;
  strings: { name: string; baseMidi: number }[];
  offsets: number[];
}

const SCALES: Record<ScaleKey, ScaleConfig> = {
  standard: {
    label: 'Standard (E2–E4)',
    strings: [
      { name: 'E4', baseMidi: 64 },
      { name: 'B3', baseMidi: 59 },
      { name: 'G3', baseMidi: 55 },
      { name: 'D3', baseMidi: 50 },
      { name: 'A2', baseMidi: 45 },
      { name: 'E2', baseMidi: 40 },
    ],
    offsets: [0, 2, 4, 5, 7, 9, 11, 12],
  },
  dropD: {
    label: 'Drop D (D2–E4)',
    strings: [
      { name: 'E4', baseMidi: 64 },
      { name: 'B3', baseMidi: 59 },
      { name: 'G3', baseMidi: 55 },
      { name: 'D3', baseMidi: 50 },
      { name: 'A2', baseMidi: 45 },
      { name: 'D2', baseMidi: 38 },
    ],
    offsets: [0, 2, 3, 5, 7, 8, 10, 12],
  },
  pentatonic: {
    label: 'Minor Pentatonic',
    strings: [
      { name: 'E4', baseMidi: 64 },
      { name: 'B3', baseMidi: 59 },
      { name: 'G3', baseMidi: 55 },
      { name: 'D3', baseMidi: 50 },
      { name: 'A2', baseMidi: 45 },
      { name: 'E2', baseMidi: 40 },
    ],
    offsets: [0, 3, 5, 7, 10, 12, 15, 17],
  },
  hirajoshi: {
    label: 'Hirajoshi (Japanese)',
    strings: [
      { name: 'E4', baseMidi: 64 },
      { name: 'C4', baseMidi: 60 },
      { name: 'B3', baseMidi: 59 },
      { name: 'F3', baseMidi: 53 },
      { name: 'E3', baseMidi: 52 },
      { name: 'A2', baseMidi: 45 },
    ],
    offsets: [0, 2, 3, 7, 8, 12, 14, 15],
  },
};

type DrumType = 'kick' | 'snare' | 'hihat';
type ToolMode = 'drag' | 'guitar' | 'drum';
type PhysicsMode = 'bounce' | 'orbit';

interface GuitarString {
  index: number;
  y: number;
  baseMidi: number;
  amp: number;
  phase: number;
  pluckX: number;
}

interface TriggerShape {
  kind: 'guitar' | 'drum';
  stringIndex?: number;
  drumType?: DrumType;
  x: number;
  y: number;
  r: number;
  pulse: number;
  cooldown: Map<number, number>;
}

interface KineticOrb {
  id: number;
  x: number;
  y: number;
  vx: number;
  vy: number;
  r: number;
  trail: { x: number; y: number }[];
}

interface RecordedEvent {
  kind: 'guitar' | 'drum';
  drumType?: DrumType;
  midi: number;
  label: string;
  step: number;
  color: string;
  timeMs: number;
}

const NOTE_NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
const PC_TO_DIATONIC: Record<number, number> = {
  0: 0, 1: 0, 2: 1, 3: 1, 4: 2, 5: 3, 6: 3, 7: 4, 8: 4, 9: 5, 10: 5, 11: 6,
};
const GM_DRUM_MIDI: Record<DrumType, number> = { kick: 36, snare: 38, hihat: 42 };
const DRUM_TYPES: DrumType[] = ['kick', 'snare', 'hihat'];

function midiToFreq(midi: number) {
  return 440 * Math.pow(2, (midi - 69) / 12);
}

function midiToNoteName(midi: number) {
  return `${NOTE_NAMES[midi % 12]}${Math.floor(midi / 12) - 1}`;
}

function midiToStaffStep(midi: number) {
  const octave = Math.floor(midi / 12) - 1;
  const pc = midi % 12;
  return (octave - 4) * 7 + PC_TO_DIATONIC[pc] - 2; // E4 = 0
}

export default function KineticStudio() {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  // UI State
  const [mode, setMode] = useState<ToolMode>('drag');
  const [physicsMode, setPhysicsMode] = useState<PhysicsMode>('bounce');
  const [scaleKey, setScaleKey] = useState<ScaleKey>('standard');
  const [delayEnabled, setDelayEnabled] = useState<boolean>(true);
  const [isPlayingBack, setIsPlayingBack] = useState<boolean>(false);
  const [noteCount, setNoteCount] = useState<number>(0);
  const [toast, setToast] = useState<string>('Click anywhere to start audio · Swipe strings or drag shapes');
  const [showHelp, setShowHelp] = useState<boolean>(false);

  // Mutable Engine Refs (avoids React re-render overhead inside 60fps loop)
  const audioCtxRef = useRef<AudioContext | null>(null);
  const masterBusRef = useRef<GainNode | null>(null);
  const delayWetRef = useRef<GainNode | null>(null);

  const stringsRef = useRef<GuitarString[]>([]);
  const shapesRef = useRef<TriggerShape[]>([]);
  const orbsRef = useRef<KineticOrb[]>([]);
  const ripplesRef = useRef<{ x: number; y: number; r: number; color: string; alpha: number }[]>([]);
  const sheetNotesRef = useRef<(RecordedEvent & { x: number; alpha: number })[]>([]);
  const recordedEventsRef = useRef<RecordedEvent[]>([]);
  const playbackTimersRef = useRef<number[]>([]);

  const modeRef = useRef<ToolMode>(mode);
  const physicsRef = useRef<PhysicsMode>(physicsMode);
  const scaleRef = useRef<ScaleKey>(scaleKey);
  const drumCycleRef = useRef<number>(0);

  useEffect(() => { modeRef.current = mode; }, [mode]);
  useEffect(() => { physicsRef.current = physicsMode; }, [physicsMode]);
  useEffect(() => { scaleRef.current = scaleKey; }, [scaleKey]);

  const showToastMsg = useCallback((msg: string) => {
    setToast(msg);
  }, []);

  // --- Initialize Web Audio API with Stereo Delay & Compressor ---
  const initAudio = useCallback(() => {
    if (!audioCtxRef.current) {
      const AudioContextClass = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      const ctx = new AudioContextClass();

      const compressor = ctx.createDynamicsCompressor();
      compressor.threshold.setValueAtTime(-16, ctx.currentTime);
      compressor.ratio.setValueAtTime(4, ctx.currentTime);

      const masterBus = ctx.createGain();
      masterBus.gain.setValueAtTime(0.85, ctx.currentTime);

      // Stereo Delay Network
      const delay = ctx.createDelay(1.0);
      delay.delayTime.setValueAtTime(0.25, ctx.currentTime); // 16th/8th dotted echo

      const feedback = ctx.createGain();
      feedback.gain.setValueAtTime(0.32, ctx.currentTime);

      const delayFilter = ctx.createBiquadFilter();
      delayFilter.type = 'lowpass';
      delayFilter.frequency.setValueAtTime(2200, ctx.currentTime);

      const delayWet = ctx.createGain();
      delayWet.gain.setValueAtTime(delayEnabled ? 0.28 : 0, ctx.currentTime);

      masterBus.connect(compressor);
      masterBus.connect(delay);
      delay.connect(delayFilter);
      delayFilter.connect(feedback);
      feedback.connect(delay);
      delayFilter.connect(delayWet);
      delayWet.connect(compressor);
      compressor.connect(ctx.destination);

      audioCtxRef.current = ctx;
      masterBusRef.current = masterBus;
      delayWetRef.current = delayWet;
    }

    if (audioCtxRef.current.state === 'suspended') {
      audioCtxRef.current.resume();
    }
  }, [delayEnabled]);

  useEffect(() => {
    if (delayWetRef.current && audioCtxRef.current) {
      delayWetRef.current.gain.setTargetAtTime(
        delayEnabled ? 0.28 : 0,
        audioCtxRef.current.currentTime,
        0.05
      );
    }
  }, [delayEnabled]);

  // --- Synthesizers ---
  const playGuitarSound = useCallback((freq: number) => {
    const ctx = audioCtxRef.current;
    const bus = masterBusRef.current;
    if (!ctx || !bus) return;

    const now = ctx.currentTime;
    const osc1 = ctx.createOscillator();
    const osc2 = ctx.createOscillator();
    const filter = ctx.createBiquadFilter();
    const gain = ctx.createGain();

    osc1.type = 'triangle';
    osc2.type = 'sawtooth';
    osc1.frequency.setValueAtTime(freq, now);
    osc2.frequency.setValueAtTime(freq * 1.0015, now); // Subtle chorus detune

    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(freq * 6.5, now);
    filter.frequency.exponentialRampToValueAtTime(freq * 1.15, now + 0.65);

    gain.gain.setValueAtTime(0.001, now);
    gain.gain.linearRampToValueAtTime(0.28, now + 0.01);
    gain.gain.exponentialRampToValueAtTime(0.0008, now + 1.45);

    const osc2Gain = ctx.createGain();
    osc2Gain.gain.setValueAtTime(0.08, now);

    osc1.connect(filter);
    osc2.connect(osc2Gain);
    osc2Gain.connect(filter);
    filter.connect(gain);
    gain.connect(bus);

    osc1.start(now);
    osc2.start(now);
    osc1.stop(now + 1.5);
    osc2.stop(now + 1.5);
  }, []);

  const playDrumSound = useCallback((drumType: DrumType) => {
    const ctx = audioCtxRef.current;
    const bus = masterBusRef.current;
    if (!ctx || !bus) return;

    const now = ctx.currentTime;

    if (drumType === 'kick') {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(140, now);
      osc.frequency.exponentialRampToValueAtTime(36, now + 0.14);
      gain.gain.setValueAtTime(0.6, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.36);
      osc.connect(gain);
      gain.connect(bus);
      osc.start(now);
      osc.stop(now + 0.38);
    } else if (drumType === 'snare') {
      const bufSize = ctx.sampleRate * 0.18;
      const buffer = ctx.createBuffer(1, bufSize, ctx.sampleRate);
      const data = buffer.getChannelData(0);
      for (let i = 0; i < bufSize; i++) data[i] = Math.random() * 2 - 1;

      const noise = ctx.createBufferSource();
      noise.buffer = buffer;

      const filter = ctx.createBiquadFilter();
      filter.type = 'highpass';
      filter.frequency.setValueAtTime(650, now);

      const gain = ctx.createGain();
      gain.gain.setValueAtTime(0.3, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.18);

      noise.connect(filter);
      filter.connect(gain);
      gain.connect(bus);
      noise.start(now);
    } else {
      const bufSize = ctx.sampleRate * 0.07;
      const buffer = ctx.createBuffer(1, bufSize, ctx.sampleRate);
      const data = buffer.getChannelData(0);
      for (let i = 0; i < bufSize; i++) data[i] = Math.random() * 2 - 1;

      const noise = ctx.createBufferSource();
      noise.buffer = buffer;

      const filter = ctx.createBiquadFilter();
      filter.type = 'highpass';
      filter.frequency.setValueAtTime(6800, now);

      const gain = ctx.createGain();
      gain.gain.setValueAtTime(0.18, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.07);

      noise.connect(filter);
      filter.connect(gain);
      gain.connect(bus);
      noise.start(now);
    }
  }, []);

  // --- Pitch Resolution ---
  const getMidiAtStringX = useCallback((stringIndex: number, x: number, width: number) => {
    const cfg = SCALES[scaleRef.current];
    const base = cfg.strings[stringIndex]?.baseMidi ?? 64;
    const norm = Math.max(0, Math.min(0.99, (x - width * 0.08) / (width * 0.84)));
    const idx = Math.floor(norm * cfg.offsets.length);
    return base + cfg.offsets[idx];
  }, []);

  // --- Stave Recording ---
  const pushStaveEvent = useCallback((ev: Omit<RecordedEvent, 'timeMs'>, width: number) => {
    const now = performance.now();
    const writeX = width - 90;
    const notes = sheetNotesRef.current;

    if (notes.length > 0) {
      const last = notes[notes.length - 1];
      if (writeX - last.x < 34) {
        notes.forEach((n) => {
          n.x -= 34 - (writeX - last.x);
        });
      }
    }

    const fullEvent: RecordedEvent = { ...ev, timeMs: now };
    notes.push({ ...fullEvent, x: writeX, alpha: 1 });
    if (notes.length > 65) notes.shift();

    recordedEventsRef.current.push(fullEvent);
    setNoteCount(recordedEventsRef.current.length);
  }, []);

  const triggerGuitar = useCallback(
    (str: GuitarString, x: number, width: number) => {
      const midi = getMidiAtStringX(str.index, x, width);
      playGuitarSound(midiToFreq(midi));

      str.amp = 14;
      str.phase = 0;
      str.pluckX = x;

      const label = midiToNoteName(midi);
      ripplesRef.current.push({ x, y: str.y, r: 6, color: '#f59e0b', alpha: 0.9 });

      pushStaveEvent(
        {
          kind: 'guitar',
          midi,
          label,
          step: midiToStaffStep(midi),
          color: '#f59e0b',
        },
        width
      );
    },
    [getMidiAtStringX, playGuitarSound, pushStaveEvent]
  );

  const triggerDrum = useCallback(
    (shape: TriggerShape, width: number) => {
      const dt = shape.drumType || 'kick';
      playDrumSound(dt);
      shape.pulse = 1;

      const colorMap: Record<DrumType, string> = {
        kick: '#f43f5e',
        snare: '#a855f7',
        hihat: '#10b981',
      };
      const stepMap: Record<DrumType, number> = { kick: -1, snare: 4, hihat: 9 };
      const labelMap: Record<DrumType, string> = { kick: 'KICK', snare: 'SNARE', hihat: 'HAT' };

      ripplesRef.current.push({
        x: shape.x,
        y: shape.y,
        r: shape.r,
        color: colorMap[dt],
        alpha: 0.9,
      });

      pushStaveEvent(
        {
          kind: 'drum',
          drumType: dt,
          midi: GM_DRUM_MIDI[dt],
          label: labelMap[dt],
          step: stepMap[dt],
          color: colorMap[dt],
        },
        width
      );
    },
    [playDrumSound, pushStaveEvent]
  );

  // --- Scene Initialization & URL Patch Loader ---
  const seedDefaultScene = useCallback((width: number, height: number) => {
    const staveTop = height * 0.72;
    const topMargin = height * 0.14;
    const usableH = staveTop - topMargin - height * 0.08;
    const cfg = SCALES[scaleRef.current];
    const spacing = usableH / (cfg.strings.length - 1);

    stringsRef.current = cfg.strings.map((s, i) => ({
      index: i,
      y: topMargin + i * spacing,
      baseMidi: s.baseMidi,
      amp: 0,
      phase: 0,
      pluckX: width / 2,
    }));

    // Check URL for shared patch
    if (typeof window !== 'undefined') {
      const params = new URLSearchParams(window.location.search);
      const patchStr = params.get('patch');
      if (patchStr) {
        try {
          const decoded = JSON.parse(atob(patchStr));
          if (decoded.scale && SCALES[decoded.scale as ScaleKey]) {
            setScaleKey(decoded.scale);
          }
          if (Array.isArray(decoded.shapes)) {
            shapesRef.current = decoded.shapes.map((s: { k: 'guitar' | 'drum'; si?: number; dt?: DrumType; xr: number; yr: number }) => ({
              kind: s.k,
              stringIndex: s.si,
              drumType: s.dt,
              x: s.xr * width,
              y: s.k === 'guitar' && s.si !== undefined ? stringsRef.current[s.si].y : s.yr * height,
              r: s.k === 'guitar' ? 15 : 20,
              pulse: 0,
              cooldown: new Map(),
            }));
          }
          showToastMsg('Loaded shared KinetiChord patch from URL');
        } catch {
          // Fallback to default on invalid URL param
        }
      }
    }

    if (shapesRef.current.length === 0) {
      shapesRef.current = [
        { kind: 'guitar', stringIndex: 0, x: width * 0.3, y: stringsRef.current[0].y, r: 15, pulse: 0, cooldown: new Map() },
        { kind: 'guitar', stringIndex: 1, x: width * 0.52, y: stringsRef.current[1].y, r: 15, pulse: 0, cooldown: new Map() },
        { kind: 'guitar', stringIndex: 2, x: width * 0.68, y: stringsRef.current[2].y, r: 15, pulse: 0, cooldown: new Map() },
        { kind: 'guitar', stringIndex: 4, x: width * 0.24, y: stringsRef.current[4].y, r: 15, pulse: 0, cooldown: new Map() },
        { kind: 'drum', drumType: 'kick', x: width * 0.4, y: height * 0.55, r: 20, pulse: 0, cooldown: new Map() },
        { kind: 'drum', drumType: 'snare', x: width * 0.6, y: height * 0.34, r: 20, pulse: 0, cooldown: new Map() },
        { kind: 'drum', drumType: 'hihat', x: width * 0.78, y: height * 0.48, r: 20, pulse: 0, cooldown: new Map() },
      ];
    }

    orbsRef.current = [
      { id: 1, x: width * 0.18, y: height * 0.3, vx: 3.3, vy: 2.1, r: 7, trail: [] },
      { id: 2, x: width * 0.82, y: height * 0.5, vx: -3.1, vy: -2.3, r: 7, trail: [] },
    ];
    sheetNotesRef.current = [];
    recordedEventsRef.current = [];
    setNoteCount(0);
  }, [showToastMsg]);

  // --- Main Canvas Loop & Pointer Listeners ---
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let animId: number;
    let draggingShape: TriggerShape | null = null;
    let pointerDown = false;
    let lastPointer = { x: 0, y: 0 };

    const handleResize = () => {
      canvas.width = window.innerWidth;
      canvas.height = window.innerHeight;
      const W = canvas.width;
      const H = canvas.height;
      const staveTop = H * 0.72;
      const topMargin = H * 0.14;
      const usableH = staveTop - topMargin - H * 0.08;
      const cfg = SCALES[scaleRef.current];
      const spacing = usableH / (cfg.strings.length - 1);

      if (stringsRef.current.length === 0) {
        seedDefaultScene(W, H);
      } else {
        stringsRef.current.forEach((st, i) => {
          st.y = topMargin + i * spacing;
        });
        shapesRef.current.forEach((s) => {
          if (s.kind === 'guitar' && s.stringIndex !== undefined) {
            s.y = stringsRef.current[s.stringIndex].y;
          }
        });
      }
    };

    handleResize();
    window.addEventListener('resize', handleResize);

    const onPointerDown = (e: PointerEvent) => {
      initAudio();
      pointerDown = true;
      const rect = canvas.getBoundingClientRect();
      const x = e.clientX - rect.left;
      const y = e.clientY - rect.top;
      lastPointer = { x, y };

      const W = canvas.width;
      const H = canvas.height;
      const staveTop = H * 0.72;
      if (y >= staveTop) return;

      const hit = shapesRef.current.find((s) => Math.hypot(s.x - x, s.y - y) < s.r + 8);

      if (modeRef.current === 'drag') {
        if (hit) {
          draggingShape = hit;
          if (hit.kind === 'guitar' && hit.stringIndex !== undefined) {
            triggerGuitar(stringsRef.current[hit.stringIndex], hit.x, W);
          } else {
            triggerDrum(hit, W);
          }
        }
      } else if (modeRef.current === 'guitar') {
        let nearest = stringsRef.current[0];
        let minDist = Infinity;
        stringsRef.current.forEach((st) => {
          const d = Math.abs(st.y - y);
          if (d < minDist) {
            minDist = d;
            nearest = st;
          }
        });
        const newShape: TriggerShape = {
          kind: 'guitar',
          stringIndex: nearest.index,
          x,
          y: nearest.y,
          r: 15,
          pulse: 1,
          cooldown: new Map(),
        };
        shapesRef.current.push(newShape);
        triggerGuitar(nearest, x, W);
      } else if (modeRef.current === 'drum') {
        const dt = DRUM_TYPES[drumCycleRef.current % DRUM_TYPES.length];
        drumCycleRef.current++;
        const newDrum: TriggerShape = {
          kind: 'drum',
          drumType: dt,
          x,
          y,
          r: 20,
          pulse: 1,
          cooldown: new Map(),
        };
        shapesRef.current.push(newDrum);
        triggerDrum(newDrum, W);
      }
    };

    const onPointerMove = (e: PointerEvent) => {
      const rect = canvas.getBoundingClientRect();
      const x = e.clientX - rect.left;
      const y = e.clientY - rect.top;
      const W = canvas.width;
      const staveTop = canvas.height * 0.72;

      if (draggingShape) {
        draggingShape.x = Math.max(40, Math.min(W - 40, x));
        if (draggingShape.kind === 'guitar') {
          let nearest = stringsRef.current[0];
          let minDist = Infinity;
          stringsRef.current.forEach((st) => {
            const d = Math.abs(st.y - y);
            if (d < minDist) {
              minDist = d;
              nearest = st;
            }
          });
          draggingShape.stringIndex = nearest.index;
          draggingShape.y = nearest.y;
        } else {
          draggingShape.y = Math.max(55, Math.min(staveTop - 30, y));
        }
      } else if (pointerDown || audioCtxRef.current) {
        stringsRef.current.forEach((st) => {
          const crossedDown = lastPointer.y < st.y && y >= st.y;
          const crossedUp = lastPointer.y > st.y && y <= st.y;
          if ((crossedDown || crossedUp) && Math.abs(y - lastPointer.y) < 90) {
            initAudio();
            triggerGuitar(st, x, W);
          }
        });

        shapesRef.current.forEach((s) => {
          const dPrev = Math.hypot(lastPointer.x - s.x, lastPointer.y - s.y);
          const dCurr = Math.hypot(x - s.x, y - s.y);
          if (dPrev > s.r + 6 && dCurr <= s.r + 6) {
            initAudio();
            if (s.kind === 'guitar' && s.stringIndex !== undefined) {
              triggerGuitar(stringsRef.current[s.stringIndex], s.x, W);
            } else {
              triggerDrum(s, W);
            }
          }
        });
      }

      lastPointer = { x, y };
    };

    const onPointerUp = () => {
      pointerDown = false;
      draggingShape = null;
    };

    canvas.addEventListener('pointerdown', onPointerDown);
    canvas.addEventListener('pointermove', onPointerMove);
    window.addEventListener('pointerup', onPointerUp);

    const drawPolygon = (cx: number, cy: number, radius: number, sides: number, rot = 0) => {
      ctx.beginPath();
      for (let i = 0; i < sides; i++) {
        const a = rot + (i * 2 * Math.PI) / sides;
        const px = cx + Math.cos(a) * radius;
        const py = cy + Math.sin(a) * radius;
        if (i === 0) ctx.moveTo(px, py);
        else ctx.lineTo(px, py);
      }
      ctx.closePath();
    };

    const render = (now: number) => {
      const W = canvas.width;
      const H = canvas.height;
      const staveTop = H * 0.72;
      const cfg = SCALES[scaleRef.current];

      ctx.clearRect(0, 0, W, H);

      // 1. Fret Guides
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.025)';
      ctx.lineWidth = 1;
      for (let i = 1; i < cfg.offsets.length; i++) {
        const fx = W * 0.08 + W * 0.84 * (i / cfg.offsets.length);
        ctx.beginPath();
        ctx.moveTo(fx, H * 0.11);
        ctx.lineTo(fx, staveTop - H * 0.05);
        ctx.stroke();
      }

      // 2. Guitar Strings
      stringsRef.current.forEach((st, idx) => {
        ctx.save();
        ctx.beginPath();
        ctx.moveTo(0, st.y);

        if (st.amp > 0.15) {
          const waveY = st.y + Math.sin(st.phase) * st.amp;
          ctx.quadraticCurveTo(st.pluckX, waveY, W, st.y);
          st.phase += 0.65;
          st.amp *= 0.92;
          ctx.strokeStyle = '#fbbf24';
          ctx.shadowColor = '#f59e0b';
          ctx.shadowBlur = 12;
          ctx.lineWidth = 2.2;
        } else {
          st.amp = 0;
          ctx.lineTo(W, st.y);
          ctx.strokeStyle = 'rgba(255, 255, 255, 0.16)';
          ctx.lineWidth = 1.2 + idx * 0.25;
        }
        ctx.stroke();
        ctx.restore();

        ctx.fillStyle = 'rgba(255, 255, 255, 0.25)';
        ctx.font = '11px monospace';
        ctx.fillText(cfg.strings[idx]?.name || '', 18, st.y - 6);
      });

      // 3. Kinetic Orbs (Bounce or Orbital Gravity)
      orbsRef.current.forEach((orb) => {
        if (physicsRef.current === 'orbit') {
          shapesRef.current.forEach((s) => {
            const dx = s.x - orb.x;
            const dy = s.y - orb.y;
            const distSq = Math.max(900, dx * dx + dy * dy);
            const dist = Math.sqrt(distSq);
            if (dist < 260) {
              const force = 110 / distSq;
              orb.vx += (dx / dist) * force;
              orb.vy += (dy / dist) * force;
            }
          });
          // Clamp speed so orbital slingshots stay musical
          const spd = Math.hypot(orb.vx, orb.vy);
          if (spd > 5.2) {
            orb.vx = (orb.vx / spd) * 5.2;
            orb.vy = (orb.vy / spd) * 5.2;
          } else if (spd < 2.0) {
            orb.vx = (orb.vx / (spd || 1)) * 2.4;
            orb.vy = (orb.vy / (spd || 1)) * 2.4;
          }
        }

        orb.x += orb.vx;
        orb.y += orb.vy;

        if (orb.x < 16 || orb.x > W - 16) orb.vx *= -1;
        if (orb.y < 16 || orb.y > staveTop - 16) orb.vy *= -1;

        orb.trail.push({ x: orb.x, y: orb.y });
        if (orb.trail.length > 18) orb.trail.shift();

        ctx.beginPath();
        orb.trail.forEach((pt, i) => {
          if (i === 0) ctx.moveTo(pt.x, pt.y);
          else ctx.lineTo(pt.x, pt.y);
        });
        ctx.strokeStyle = 'rgba(56, 189, 248, 0.28)';
        ctx.lineWidth = 2;
        ctx.stroke();

        ctx.save();
        ctx.beginPath();
        ctx.arc(orb.x, orb.y, orb.r, 0, Math.PI * 2);
        ctx.fillStyle = '#38bdf8';
        ctx.shadowColor = '#38bdf8';
        ctx.shadowBlur = 14;
        ctx.fill();
        ctx.restore();

        // Trigger check when orb passes shape
        shapesRef.current.forEach((s) => {
          const dist = Math.hypot(orb.x - s.x, orb.y - s.y);
          const trigRad = s.r + orb.r + 10;
          const lastTrig = s.cooldown.get(orb.id) || 0;

          if (dist < trigRad && now - lastTrig > 260) {
            s.cooldown.set(orb.id, now);
            s.pulse = 1;
            if (s.kind === 'guitar' && s.stringIndex !== undefined) {
              triggerGuitar(stringsRef.current[s.stringIndex], s.x, W);
            } else {
              triggerDrum(s, W);
            }
          }
        });
      });

      // 4. Shapes
      shapesRef.current.forEach((s) => {
        ctx.save();
        const scale = 1 + s.pulse * 0.35;
        s.pulse *= 0.88;

        if (s.kind === 'guitar' && s.stringIndex !== undefined) {
          ctx.beginPath();
          ctx.arc(s.x, s.y, s.r * scale, 0, Math.PI * 2);
          ctx.fillStyle = 'rgba(245, 158, 11, 0.22)';
          ctx.strokeStyle = '#f59e0b';
          ctx.lineWidth = 2;
          ctx.fill();
          ctx.stroke();

          const lbl = midiToNoteName(getMidiAtStringX(s.stringIndex, s.x, W));
          ctx.fillStyle = '#fef3c7';
          ctx.font = 'bold 10px monospace';
          ctx.textAlign = 'center';
          ctx.textBaseline = 'middle';
          ctx.fillText(lbl, s.x, s.y);
        } else {
          const dt = s.drumType || 'kick';
          const colors: Record<DrumType, string> = {
            kick: '#f43f5e',
            snare: '#a855f7',
            hihat: '#10b981',
          };
          const col = colors[dt];
          ctx.strokeStyle = col;
          ctx.fillStyle = col + '28';
          ctx.lineWidth = 2.2;

          if (dt === 'kick') drawPolygon(s.x, s.y, s.r * scale, 6, Math.PI / 6);
          else if (dt === 'snare') drawPolygon(s.x, s.y, s.r * scale, 4, Math.PI / 4);
          else drawPolygon(s.x, s.y, s.r * scale, 3, -Math.PI / 2);

          ctx.fill();
          ctx.stroke();

          ctx.fillStyle = '#f8fafc';
          ctx.font = '9px monospace';
          ctx.textAlign = 'center';
          ctx.textBaseline = 'middle';
          ctx.fillText(dt.toUpperCase(), s.x, s.y);
        }
        ctx.restore();
      });

      // 5. Ripples
      for (let i = ripplesRef.current.length - 1; i >= 0; i--) {
        const rp = ripplesRef.current[i];
        rp.r += 1.6;
        rp.alpha *= 0.93;
        ctx.save();
        ctx.beginPath();
        ctx.arc(rp.x, rp.y, rp.r, 0, Math.PI * 2);
        ctx.strokeStyle = rp.color;
        ctx.globalAlpha = rp.alpha;
        ctx.lineWidth = 1.5;
        ctx.stroke();
        ctx.restore();
        if (rp.alpha < 0.04) ripplesRef.current.splice(i, 1);
      }

      // 6. Live Sheet Music Stave at Bottom
      ctx.fillStyle = 'rgba(13, 16, 23, 0.96)';
      ctx.fillRect(0, staveTop, W, H - staveTop);

      ctx.strokeStyle = 'rgba(255, 255, 255, 0.08)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(0, staveTop);
      ctx.lineTo(W, staveTop);
      ctx.stroke();

      const lineSpacing = 13;
      const bottomLineY = staveTop + (H - staveTop) * 0.66;
      const stepPx = lineSpacing / 2;

      ctx.strokeStyle = 'rgba(255, 255, 255, 0.18)';
      for (let i = 0; i < 5; i++) {
        const ly = bottomLineY - i * lineSpacing;
        ctx.beginPath();
        ctx.moveTo(36, ly);
        ctx.lineTo(W - 36, ly);
        ctx.stroke();
      }

      ctx.fillStyle = 'rgba(255, 255, 255, 0.45)';
      ctx.font = '46px serif';
      ctx.textAlign = 'left';
      ctx.textBaseline = 'alphabetic';
      ctx.fillText('𝄞', 44, bottomLineY - lineSpacing * 0.7);

      const writeX = W - 90;
      ctx.strokeStyle = 'rgba(56, 189, 248, 0.25)';
      ctx.setLineDash([4, 4]);
      ctx.beginPath();
      ctx.moveTo(writeX, bottomLineY - lineSpacing * 4.8);
      ctx.lineTo(writeX, bottomLineY + lineSpacing * 1.8);
      ctx.stroke();
      ctx.setLineDash([]);

      for (let i = sheetNotesRef.current.length - 1; i >= 0; i--) {
        const n = sheetNotesRef.current[i];
        n.x -= 1.15;

        if (n.x < 85) {
          n.alpha -= 0.04;
          if (n.alpha <= 0) {
            sheetNotesRef.current.splice(i, 1);
            continue;
          }
        }

        const ny = bottomLineY - n.step * stepPx;
        ctx.save();
        ctx.globalAlpha = Math.max(0, n.alpha);
        ctx.strokeStyle = n.color;
        ctx.fillStyle = n.color;
        ctx.lineWidth = 1.6;

        if (n.kind === 'guitar') {
          if (n.step <= -2) {
            for (let s = -2; s >= n.step; s -= 2) {
              const ly = bottomLineY - s * stepPx;
              ctx.beginPath();
              ctx.moveTo(n.x - 10, ly);
              ctx.lineTo(n.x + 10, ly);
              ctx.strokeStyle = 'rgba(255, 255, 255, 0.28)';
              ctx.stroke();
            }
          } else if (n.step >= 10) {
            for (let s = 10; s <= n.step; s += 2) {
              const ly = bottomLineY - s * stepPx;
              ctx.beginPath();
              ctx.moveTo(n.x - 10, ly);
              ctx.lineTo(n.x + 10, ly);
              ctx.strokeStyle = 'rgba(255, 255, 255, 0.28)';
              ctx.stroke();
            }
          }

          ctx.strokeStyle = n.color;
          ctx.beginPath();
          ctx.ellipse(n.x, ny, 6.5, 4.8, -0.35, 0, Math.PI * 2);
          ctx.fill();

          ctx.beginPath();
          if (n.step < 4) {
            ctx.moveTo(n.x + 5.5, ny);
            ctx.lineTo(n.x + 5.5, ny - 28);
          } else {
            ctx.moveTo(n.x - 5.5, ny);
            ctx.lineTo(n.x - 5.5, ny + 28);
          }
          ctx.stroke();
        } else {
          if (n.drumType === 'hihat') {
            const r = 5;
            ctx.beginPath();
            ctx.moveTo(n.x - r, ny - r);
            ctx.lineTo(n.x + r, ny + r);
            ctx.moveTo(n.x + r, ny - r);
            ctx.lineTo(n.x - r, ny + r);
            ctx.stroke();
          } else if (n.drumType === 'snare') {
            drawPolygon(n.x, ny, 6.5, 4, 0);
            ctx.stroke();
          } else {
            ctx.beginPath();
            ctx.arc(n.x, ny, 5.5, 0, Math.PI * 2);
            ctx.fill();
          }
          ctx.beginPath();
          ctx.moveTo(n.x + 5.5, ny);
          ctx.lineTo(n.x + 5.5, ny - 24);
          ctx.stroke();
        }

        ctx.fillStyle = 'rgba(255, 255, 255, 0.45)';
        ctx.font = '9px monospace';
        ctx.textAlign = 'center';
        ctx.fillText(n.label, n.x, bottomLineY + 34);
        ctx.restore();
      }

      animId = requestAnimationFrame(render);
    };

    animId = requestAnimationFrame(render);

    return () => {
      cancelAnimationFrame(animId);
      window.removeEventListener('resize', handleResize);
      canvas.removeEventListener('pointerdown', onPointerDown);
      canvas.removeEventListener('pointermove', onPointerMove);
      window.removeEventListener('pointerup', onPointerUp);
    };
  }, [getMidiAtStringX, initAudio, seedDefaultScene, triggerDrum, triggerGuitar]);

  // --- Replay Recorded Sheet Music ---
  const togglePlayback = () => {
    initAudio();
    if (isPlayingBack) {
      playbackTimersRef.current.forEach((id) => window.clearTimeout(id));
      playbackTimersRef.current = [];
      setIsPlayingBack(false);
      return;
    }

    const events = recordedEventsRef.current;
    if (events.length === 0) {
      showToastMsg('No recorded notes to replay yet');
      return;
    }

    setIsPlayingBack(true);
    const t0 = events[0].timeMs;
    const timers: number[] = [];

    events.forEach((ev, idx) => {
      const delayMs = Math.min(idx * 220, ev.timeMs - t0); // Caps long silences for tight playback
      const timer = window.setTimeout(() => {
        if (ev.kind === 'guitar') {
          playGuitarSound(midiToFreq(ev.midi));
        } else if (ev.drumType) {
          playDrumSound(ev.drumType);
        }
        if (idx === events.length - 1) {
          setIsPlayingBack(false);
        }
      }, delayMs);
      timers.push(timer);
    });

    playbackTimersRef.current = timers;
  };

  // --- Shareable URL Patch Generator ---
  const sharePatchUrl = () => {
    const W = window.innerWidth;
    const H = window.innerHeight;
    const payload = {
      scale: scaleKey,
      shapes: shapesRef.current.map((s) => ({
        k: s.kind,
        si: s.stringIndex,
        dt: s.drumType,
        xr: Number((s.x / W).toFixed(3)),
        yr: Number((s.y / H).toFixed(3)),
      })),
    };
    const encoded = btoa(JSON.stringify(payload));
    const shareUrl = `${window.location.origin}${window.location.pathname}?patch=${encoded}`;
    navigator.clipboard.writeText(shareUrl);
    window.history.replaceState({}, '', `?patch=${encoded}`);
    showToastMsg('Shareable patch link copied to clipboard!');
  };

  // --- MIDI (.mid) Exporter ---
  const exportMIDI = () => {
    const events = recordedEventsRef.current;
    if (events.length === 0) {
      showToastMsg('Trigger a few notes before exporting MIDI');
      return;
    }

    const writeVLQ = (val: number) => {
      let v = val;
      const buf = [v & 0x7f];
      while ((v >>= 7) > 0) buf.unshift((v & 0x7f) | 0x80);
      return buf;
    };

    const TPQN = 480;
    const t0 = events[0].timeMs;
    const raw: { tick: number; bytes: number[] }[] = [];

    events.forEach((ev) => {
      const startTick = Math.max(0, Math.round((ev.timeMs - t0) * 0.96));
      const isDrum = ev.kind === 'drum';
      const ch = isDrum ? 9 : 0;
      const dur = isDrum ? 160 : 420;
      raw.push({ tick: startTick, bytes: [0x90 | ch, ev.midi, isDrum ? 105 : 96] });
      raw.push({ tick: startTick + dur, bytes: [0x80 | ch, ev.midi, 0] });
    });

    raw.sort((a, b) => a.tick - b.tick);

    const track: number[] = [
      0x00, 0xff, 0x51, 0x03, 0x07, 0xa1, 0x20, // 120 BPM
      0x00, 0xc0, 24, // Acoustic Guitar
    ];

    let prev = 0;
    raw.forEach((r) => {
      const delta = Math.max(0, r.tick - prev);
      prev = r.tick;
      track.push(...writeVLQ(delta), ...r.bytes);
    });
    track.push(0x00, 0xff, 0x2f, 0x00);

    const len = track.length;
    const midiBytes = new Uint8Array([
      0x4d, 0x54, 0x68, 0x64, 0x00, 0x00, 0x00, 0x06, 0x00, 0x00, 0x00, 0x01,
      (TPQN >> 8) & 0xff, TPQN & 0xff,
      0x4d, 0x54, 0x72, 0x6b,
      (len >> 24) & 0xff, (len >> 16) & 0xff, (len >> 8) & 0xff, len & 0xff,
      ...track,
    ]);

    const blob = new Blob([midiBytes], { type: 'audio/midi' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'kinetichord-session.mid';
    a.click();
    showToastMsg(`Exported ${events.length} notes to kinetichord-session.mid`);
  };

  // --- ABC Notation (.abc) Exporter ---
  const exportABC = () => {
    const events = recordedEventsRef.current;
    if (events.length === 0) {
      showToastMsg('Trigger a few notes before exporting ABC sheet music');
      return;
    }

    const toAbcPitch = (midi: number) => {
      const names = ['C', '^C', 'D', '^D', 'E', 'F', '^F', 'G', '^G', 'A', '^A', 'B'];
      const oct = Math.floor(midi / 12) - 1;
      let base = names[midi % 12];
      if (oct >= 5) {
        base = base.toLowerCase();
        for (let o = 5; o < oct; o++) base += "'";
      } else if (oct < 4) {
        for (let o = 4; o > oct; o--) base += ',';
      }
      return base;
    };

    const tokens: string[] = [];
    events.forEach((ev, idx) => {
      if (ev.kind === 'guitar') {
        tokens.push(toAbcPitch(ev.midi));
      } else {
        const dp: Record<DrumType, string> = { kick: 'F,', snare: 'c', hihat: 'g' };
        tokens.push(`"^${ev.label}"${dp[ev.drumType || 'kick']}`);
      }
      if ((idx + 1) % 8 === 0) tokens.push('|');
    });

    const abc = [
      'X: 1',
      'T: KinetiChord Generative Session',
      'M: 4/4',
      'L: 1/8',
      'Q: 1/4=120',
      'K: C',
      tokens.join(' ') + ' |]',
    ].join('\n');

    const blob = new Blob([abc], { type: 'text/plain;charset=utf-8' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'kinetichord-session.abc';
    a.click();
    showToastMsg(`Exported ${events.length} notes to kinetichord-session.abc`);
  };

  return (
    <div className="relative w-screen h-screen select-none overflow-hidden">
      {/* Minimal Floating Top Pill HUD */}
      <nav
        aria-label="Studio Controls"
        className="fixed top-4 left-1/2 -translate-x-1/2 z-20 flex flex-wrap items-center justify-center gap-1.5 px-2.5 py-1.5 rounded-full bg-slate-900/80 backdrop-blur-md border border-white/10 shadow-2xl text-xs"
      >
        <button
          onClick={() => setMode('drag')}
          className={`px-3 py-1.5 rounded-full transition flex items-center gap-1.5 ${
            mode === 'drag' ? 'bg-white/15 text-white border border-white/20' : 'text-slate-400 hover:text-white'
          }`}
        >
          <span className="w-2 h-2 rounded-full bg-sky-400" /> Interact
        </button>

        <button
          onClick={() => setMode('guitar')}
          className={`px-3 py-1.5 rounded-full transition flex items-center gap-1.5 ${
            mode === 'guitar' ? 'bg-white/15 text-white border border-white/20' : 'text-slate-400 hover:text-white'
          }`}
        >
          <span className="w-2 h-2 rounded-full bg-amber-400" /> + Guitar
        </button>

        <button
          onClick={() => setMode('drum')}
          className={`px-3 py-1.5 rounded-full transition flex items-center gap-1.5 ${
            mode === 'drum' ? 'bg-white/15 text-white border border-white/20' : 'text-slate-400 hover:text-white'
          }`}
        >
          <span className="w-2 h-2 rounded-full bg-rose-500" /> + Drum
        </button>

        <button
          onClick={() => {
            initAudio();
            const a = Math.random() * Math.PI * 2;
            orbsRef.current.push({
              id: Date.now() + Math.random(),
              x: window.innerWidth * 0.5,
              y: window.innerHeight * 0.35,
              vx: Math.cos(a) * 3.5,
              vy: Math.sin(a) * 3.5,
              r: 7,
              trail: [],
            });
          }}
          className="px-2.5 py-1.5 rounded-full text-slate-300 hover:text-white hover:bg-white/5 transition"
        >
          + Orb
        </button>

        <div className="h-4 w-px bg-white/10 mx-0.5" />

        {/* Physics Mode Toggle */}
        <button
          onClick={() => setPhysicsMode((p) => (p === 'bounce' ? 'orbit' : 'bounce'))}
          title="Switch between Linear Bounce and Gravitational Orbit physics"
          className={`px-2.5 py-1.5 rounded-full transition flex items-center gap-1 ${
            physicsMode === 'orbit'
              ? 'bg-purple-500/20 text-purple-200 border border-purple-400/30'
              : 'text-slate-400 hover:text-white'
          }`}
        >
          <Orbit className="w-3.5 h-3.5" />
          {physicsMode === 'orbit' ? 'Orbit' : 'Bounce'}
        </button>

        {/* Scale / Tuning Selector */}
        <select
          aria-label="Guitar Scale and Tuning"
          value={scaleKey}
          onChange={(e) => setScaleKey(e.target.value as ScaleKey)}
          className="bg-slate-800/90 text-slate-200 px-2.5 py-1.5 rounded-full border border-white/10 text-xs focus:outline-none cursor-pointer"
        >
          {Object.entries(SCALES).map(([k, v]) => (
            <option key={k} value={k}>
              {v.label}
            </option>
          ))}
        </select>

        {/* Stereo Echo DSP Toggle */}
        <button
          onClick={() => setDelayEnabled((d) => !d)}
          className={`px-2.5 py-1.5 rounded-full transition flex items-center gap-1 ${
            delayEnabled ? 'bg-emerald-500/15 text-emerald-300 border border-emerald-500/30' : 'text-slate-400'
          }`}
        >
          <Sparkles className="w-3.5 h-3.5" /> Echo
        </button>

        <div className="h-4 w-px bg-white/10 mx-0.5" />

        {/* Replay Stave */}
        <button
          onClick={togglePlayback}
          className="px-2.5 py-1.5 rounded-full bg-sky-500/15 hover:bg-sky-500/25 text-sky-300 border border-sky-500/30 transition flex items-center gap-1"
        >
          {isPlayingBack ? <Square className="w-3 h-3 fill-current" /> : <Play className="w-3 h-3 fill-current" />}
          Replay
        </button>

        {/* MIDI & ABC Export */}
        <button
          onClick={exportMIDI}
          className="px-2.5 py-1.5 rounded-full bg-white/5 hover:bg-white/15 text-slate-200 border border-white/10 transition flex items-center gap-1"
        >
          <Download className="w-3 h-3" /> MIDI
          <span className="px-1.5 py-0.2 rounded-full bg-sky-500/20 text-sky-300 font-mono text-[10px]">
            {noteCount}
          </span>
        </button>

        <button
          onClick={exportABC}
          className="px-2.5 py-1.5 rounded-full bg-white/5 hover:bg-white/15 text-slate-200 border border-white/10 transition flex items-center gap-1"
        >
          <Download className="w-3 h-3" /> ABC
        </button>

        {/* Viral URL Patch Share */}
        <button
          onClick={sharePatchUrl}
          title="Copy shareable URL with your current layout"
          className="p-1.5 rounded-full text-slate-400 hover:text-white hover:bg-white/10 transition"
        >
          <Share2 className="w-3.5 h-3.5" />
        </button>

        <button
          onClick={() => {
            window.history.replaceState({}, '', window.location.pathname);
            shapesRef.current = [];
            seedDefaultScene(window.innerWidth, window.innerHeight);
            showToastMsg('Canvas & sheet music reset');
          }}
          title="Reset Canvas"
          className="p-1.5 rounded-full text-slate-400 hover:text-rose-400 hover:bg-white/10 transition"
        >
          <RotateCcw className="w-3.5 h-3.5" />
        </button>

        <button
          onClick={() => setShowHelp((h) => !h)}
          title="About & Shortcuts"
          className="p-1.5 rounded-full text-slate-400 hover:text-white hover:bg-white/10 transition"
        >
          <HelpCircle className="w-3.5 h-3.5" />
        </button>
      </nav>

      {/* Subtle Status Toast */}
      <div className="fixed bottom-[29%] left-1/2 -translate-x-1/2 pointer-events-none text-[11px] tracking-widest uppercase text-slate-400/80 transition-opacity">
        {toast}
      </div>

      {/* Minimalist Info Modal */}
      {showHelp && (
        <aside className="fixed inset-0 z-30 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
          <div className="relative max-w-md w-full rounded-2xl bg-slate-900 border border-white/15 p-6 text-slate-200 shadow-2xl">
            <button
              onClick={() => setShowHelp(false)}
              className="absolute top-4 right-4 text-slate-400 hover:text-white"
            >
              <X className="w-4 h-4" />
            </button>
            <h2 className="text-base font-semibold text-white mb-2">KinetiChord Studio Guide</h2>
            <ul className="space-y-2 text-xs text-slate-300 leading-relaxed">
              <li>
                <strong className="text-amber-400">Guitar Nodes (Circles):</strong> Snap onto the 6
                strings. Horizontal position controls fret pitch; vertical position selects the
                string.
              </li>
              <li>
                <strong className="text-rose-400">Drum Shapes (Polygons):</strong> Hexagons trigger{' '}
                <em>Kick</em>, Squares trigger <em>Snare</em>, and Triangles trigger <em>Hi-Hat</em>.
              </li>
              <li>
                <strong className="text-purple-300">Bounce vs. Orbit:</strong> Switch to{' '}
                <em>Orbit</em> so kinetic orbs curve around shapes using gravitational attraction.
              </li>
              <li>
                <strong className="text-sky-300">Share & Export:</strong> Export your stave history
                to multi-channel <code>.mid</code> or <code>.abc</code> notation, or click Share to
                encode your patch into a URL.
              </li>
            </ul>
          </div>
        </aside>
      )}

      {/* Fullscreen Interactive Canvas */}
      <canvas ref={canvasRef} className="block w-screen h-screen cursor-crosshair" />
    </div>
  );
}
