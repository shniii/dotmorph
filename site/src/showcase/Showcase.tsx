import { useEffect, useRef, useState, type CSSProperties } from 'react';
import { PALETTES, PALETTE_NAMES, SHAPE_NAMES, type DotMorphEngine, type PaletteName, type ShapeName } from 'dotmorph';
import { DotMorph } from 'dotmorph/react';

export const SHAPE_LABELS: Record<ShapeName, string> = {
  burst: 'Burst',
  globe: 'Globe',
  wave: 'Wave',
  fan: 'Fan',
};

export const PALETTE_LABELS: Record<PaletteName, string> = {
  aurora: 'Aurora',
  ocean: 'Ocean',
  ember: 'Ember',
  mint: 'Mint',
  rose: 'Rose',
  midnight: 'Midnight',
};

const CYCLE_MS = 4800;

/** The hero: the four shapes on a loop, with tabs and a palette picker. */
export function Showcase() {
  const [shape, setShape] = useState<ShapeName>('burst');
  const [palette, setPalette] = useState<PaletteName>('aurora');
  const [autoplay, setAutoplay] = useState(true);
  const engineRef = useRef<DotMorphEngine | null>(null);

  useEffect(() => {
    if (!autoplay) return;
    const id = window.setInterval(() => {
      setShape((current) => SHAPE_NAMES[(SHAPE_NAMES.indexOf(current) + 1) % SHAPE_NAMES.length]);
    }, CYCLE_MS);
    return () => window.clearInterval(id);
  }, [autoplay]);

  const theme = PALETTES[palette];

  return (
    <div
      className={`showcase${theme.dark ? ' showcase--dark' : ''}`}
      style={{ '--showcase-bg': theme.background, '--showcase-accent': theme.bottom } as CSSProperties}
    >
      <div className="showcase__canvas">
        <DotMorph
          shape={shape}
          palette={palette}
          onReady={(engine) => {
            engineRef.current = engine;
            if (import.meta.env.DEV) (window as unknown as { __dotmorph?: DotMorphEngine }).__dotmorph = engine;
          }}
        />
      </div>

      <div className="showcase__palettes" role="radiogroup" aria-label="Palette">
        {PALETTE_NAMES.map((name) => (
          <button
            key={name}
            type="button"
            role="radio"
            aria-checked={name === palette}
            aria-label={PALETTE_LABELS[name]}
            title={PALETTE_LABELS[name]}
            className={`swatch${name === palette ? ' swatch--active' : ''}`}
            style={{ '--swatch-top': PALETTES[name].top, '--swatch-bottom': PALETTES[name].bottom } as CSSProperties}
            onClick={() => setPalette(name)}
          />
        ))}
      </div>

      <div className="showcase__tabs" role="tablist" aria-label="Shape">
        {SHAPE_NAMES.map((name) => (
          <button
            key={name}
            type="button"
            role="tab"
            aria-selected={name === shape}
            className={`tab${name === shape ? ' tab--active' : ''}`}
            onClick={() => {
              setAutoplay(false);
              setShape(name);
            }}
          >
            {SHAPE_LABELS[name]}
          </button>
        ))}
        <button
          type="button"
          className={`tab tab--icon${autoplay ? ' tab--active' : ''}`}
          aria-label={autoplay ? 'Pause the tour' : 'Play the tour'}
          title={autoplay ? 'Pause the tour' : 'Play the tour'}
          onClick={() => setAutoplay((a) => !a)}
        >
          {autoplay ? (
            <svg width="12" height="12" viewBox="0 0 12 12" aria-hidden="true">
              <rect x="2" y="1.5" width="2.6" height="9" rx="0.8" fill="currentColor" />
              <rect x="7.4" y="1.5" width="2.6" height="9" rx="0.8" fill="currentColor" />
            </svg>
          ) : (
            <svg width="12" height="12" viewBox="0 0 12 12" aria-hidden="true">
              <path d="M3 1.8v8.4c0 .5.5.8.9.5l6.6-4.2a.6.6 0 0 0 0-1L3.9 1.3c-.4-.3-.9 0-.9.5Z" fill="currentColor" />
            </svg>
          )}
        </button>
      </div>
    </div>
  );
}
