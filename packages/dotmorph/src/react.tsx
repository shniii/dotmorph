'use client';

import { useEffect, useRef, useState, useSyncExternalStore, type CSSProperties, type ReactNode } from 'react';
import { DotMorphEngine, type EngineOptions, type EngineSettings } from './core/Engine';
import type { Palette, PaletteName } from './core/palettes';
import type { ShapeName } from './core/Shape';

export { DotMorphEngine } from './core/Engine';
export type { Palette, PaletteName } from './core/palettes';
export type { ShapeName } from './core/Shape';

export interface DotMorphProps {
  /** Shape to show: 'burst', 'globe', 'wave' or 'fan' (or 0 to 3). Changing it runs the morph. */
  shape?: ShapeName | number;
  /** A built-in palette name or your own `{ top, bottom }` palette. */
  palette?: PaletteName | Palette;
  /** Animate. Defaults to the visitor's reduced-motion preference: off when they asked for less motion. */
  motion?: boolean;
  /** Seconds per morph. */
  transitionDuration?: number;
  /** Let the pointer push dots and lines aside. */
  interactive?: boolean;
  /** Stop rendering while the canvas is scrolled out of view. */
  pauseWhenHidden?: boolean;
  /** Anything else the engine accepts (cloud layout, per-shape params, look and feel). Read once, on mount. */
  options?: Omit<EngineOptions, 'shape' | 'palette' | 'motion' | 'transitionDuration' | 'interactive'>;
  /** Called once the engine exists, e.g. to tune it live. */
  onReady?: (engine: DotMorphEngine) => void;
  /** Called when a morph finishes. */
  onMorphEnd?: (shape: ShapeName) => void;
  /** Called if WebGL 2 is unavailable or the renderer fails to start. */
  onError?: (error: unknown) => void;
  /** Rendered instead of the canvas when WebGL 2 is unavailable. */
  fallback?: ReactNode;
  className?: string;
  style?: CSSProperties;
}

const REDUCED_MOTION = '(prefers-reduced-motion: reduce)';

/** `true` when the visitor asked their system for reduced motion. Server-safe; updates live. */
export function usePrefersReducedMotion(): boolean {
  return useSyncExternalStore(subscribeReducedMotion, readReducedMotion, () => false);
}

function subscribeReducedMotion(onChange: () => void) {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return () => {};
  const query = window.matchMedia(REDUCED_MOTION);
  query.addEventListener('change', onChange);
  return () => query.removeEventListener('change', onChange);
}

function readReducedMotion() {
  return typeof window !== 'undefined' && typeof window.matchMedia === 'function' && window.matchMedia(REDUCED_MOTION).matches;
}

const paletteKey = (palette: PaletteName | Palette) =>
  typeof palette === 'string' ? palette : `${palette.top}|${palette.bottom}|${palette.rampEnd ?? ''}`;

/**
 * Dots that morph between shapes through a swirling cloud. Renders a
 * transparent canvas that fills its parent; put a background behind it
 * (every built-in palette has a matching `background`).
 */
export function DotMorph({
  shape = 'burst',
  palette = 'aurora',
  motion,
  transitionDuration,
  interactive = true,
  pauseWhenHidden = true,
  options,
  onReady,
  onMorphEnd,
  onError,
  fallback = null,
  className,
  style,
}: DotMorphProps) {
  const reducedMotion = usePrefersReducedMotion();
  const animate = motion ?? !reducedMotion;

  const canvasRef = useRef<HTMLCanvasElement>(null);
  const engineRef = useRef<DotMorphEngine | null>(null);
  const [engine, setEngine] = useState<DotMorphEngine | null>(null);
  const [visible, setVisible] = useState(!pauseWhenHidden);
  const [failed, setFailed] = useState(false);

  const latest = useRef({ shape, palette, animate, transitionDuration, interactive, options, onReady, onMorphEnd, onError });
  latest.current = { shape, palette, animate, transitionDuration, interactive, options, onReady, onMorphEnd, onError };

  // Create the engine once per canvas; dispose on unmount.
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const initial = latest.current;
    let created: DotMorphEngine;
    try {
      created = new DotMorphEngine(canvas, {
        ...initial.options,
        shape: initial.shape,
        palette: initial.palette,
        motion: initial.animate,
        interactive: initial.interactive,
        ...(initial.transitionDuration !== undefined ? { transitionDuration: initial.transitionDuration } : {}),
      });
    } catch (error) {
      setFailed(true);
      latest.current.onError?.(error);
      return;
    }
    created.onMorphEnd = (name) => latest.current.onMorphEnd?.(name);
    engineRef.current = created;
    setEngine(created);
    latest.current.onReady?.(created);

    const resizeObserver = new ResizeObserver(() => created.resize());
    resizeObserver.observe(canvas);
    return () => {
      resizeObserver.disconnect();
      created.dispose();
      engineRef.current = null;
      setEngine(null);
    };
  }, []);

  // Track visibility so off-screen canvases don't render.
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!pauseWhenHidden || !canvas || typeof IntersectionObserver === 'undefined') {
      setVisible(true);
      return;
    }
    const observer = new IntersectionObserver(([entry]) => setVisible(entry.isIntersecting), { threshold: 0.05 });
    observer.observe(canvas);
    return () => observer.disconnect();
  }, [pauseWhenHidden]);

  // Run the loop only while visible and animating.
  useEffect(() => {
    if (!engine) return;
    engine.motion = animate;
    if (visible && animate) engine.start();
    else {
      engine.stop();
      engine.renderOnce();
    }
  }, [engine, visible, animate]);

  useEffect(() => {
    engine?.morphTo(shape, animate && visible);
  }, [engine, shape, animate, visible]);

  const key = paletteKey(palette);
  useEffect(() => {
    engine?.setPalette(latest.current.palette, animate && visible);
  }, [engine, key, animate, visible]);

  useEffect(() => {
    if (!engine) return;
    const patch: Partial<EngineSettings> = { interactive };
    if (transitionDuration !== undefined) patch.transitionDuration = transitionDuration;
    engine.setSettings(patch);
  }, [engine, interactive, transitionDuration]);

  if (failed) return <>{fallback}</>;

  return (
    <canvas
      ref={canvasRef}
      className={className}
      style={{ display: 'block', width: '100%', height: '100%', touchAction: 'pan-y', ...style }}
      aria-hidden="true"
    />
  );
}
