import { Color } from 'three';

/**
 * A palette colours the dots and lines with a vertical ramp fixed to the canvas
 * (bottom colour at the bottom edge, top colour from `rampEnd` upwards), and
 * suggests a CSS `background` for the element behind the transparent canvas.
 */
export interface Palette {
  /** Colour at the top of the ramp. Any CSS colour three.js understands. */
  top: string;
  /** Colour at the bottom of the ramp. */
  bottom: string;
  /** Fraction of the canvas height (0..1) where the ramp reaches `top`. Default 0.8. */
  rampEnd?: number;
  /** Suggested CSS background for the canvas container. */
  background?: string;
  /** True when the palette is meant for a dark background. */
  dark?: boolean;
}

export const PALETTE_NAMES = ['aurora', 'ocean', 'ember', 'mint', 'rose', 'midnight'] as const;
export type PaletteName = (typeof PALETTE_NAMES)[number];

/**
 * Builds a soft glow rising from the bottom edge, made only from the ramp's own
 * two colours: tinted near the bottom, fading to a pale paper (or, for dark
 * palettes, a deep night) towards the top. Takes `#rgb` or `#rrggbb` colours;
 * use it for your own palettes too.
 */
export function paletteBackground(top: string, bottom: string, dark = false): string {
  const shape = 'radial-gradient(140% 110% at 50% 115%';
  if (dark) {
    const night = mixHex(bottom, '#04050c', 0.93);
    return `${shape}, ${mixHex(bottom, top, 0.2)} 0%, ${mixHex(bottom, night, 0.45)} 24%, ${mixHex(bottom, night, 0.8)} 46%, ${night} 72%)`;
  }
  const paper = mixHex(top, '#ffffff', 0.965);
  return `${shape}, ${mixHex(bottom, top, 0.35)} 0%, ${mixHex(top, '#ffffff', 0.2)} 20%, ${mixHex(top, '#ffffff', 0.6)} 40%, ${mixHex(top, '#ffffff', 0.86)} 58%, ${paper} 78%)`;
}

function palette(top: string, bottom: string, extra: Partial<Palette> = {}): Palette {
  return { top, bottom, ...extra, background: paletteBackground(top, bottom, extra.dark) };
}

export const PALETTES: Record<PaletteName, Palette> = {
  /** Green into violet, like northern lights. */
  aurora: palette('#22c486', '#6d3cf2'),
  /** Azure into deep indigo. */
  ocean: palette('#2d8cf0', '#1d2a9c'),
  /** Amber into red. */
  ember: palette('#ffa43a', '#e0314f'),
  /** Aqua into blue. */
  mint: palette('#2fd3c0', '#1768c9'),
  /** Rose into plum. */
  rose: palette('#ff5c8a', '#9b1c7a'),
  /** Ice into violet, on a dark night. */
  midnight: palette('#9af0ff', '#8a63ff', { dark: true, rampEnd: 0.9 }),
};

export function resolvePalette(palette: PaletteName | Palette): Palette {
  return typeof palette === 'string' ? PALETTES[palette] : palette;
}

/** Internal: the three.js values a palette maps to. */
export interface PaletteColors {
  top: Color;
  bottom: Color;
  rampEnd: number;
}

export function paletteColors(palette: Palette): PaletteColors {
  // The shaders write colours straight to the sRGB canvas, so keep the values
  // in sRGB (three.js parses CSS colours into linear) to match the CSS exactly.
  return {
    top: new Color(palette.top).convertLinearToSRGB(),
    bottom: new Color(palette.bottom).convertLinearToSRGB(),
    rampEnd: palette.rampEnd ?? 0.8,
  };
}

/** Mixes two `#rgb` / `#rrggbb` colours in sRGB: t = 0 gives `a`, 1 gives `b`. */
function mixHex(a: string, b: string, t: number): string {
  const pa = parseHex(a);
  const pb = parseHex(b);
  return `#${pa.map((v, i) => Math.round(v + (pb[i] - v) * t).toString(16).padStart(2, '0')).join('')}`;
}

function parseHex(hex: string): number[] {
  const h = hex.replace('#', '');
  const full = h.length === 3 ? h.replace(/./g, (c) => c + c) : h;
  if (!/^[0-9a-f]{6}$/i.test(full)) throw new TypeError(`dotmorph: paletteBackground() needs #rgb or #rrggbb colours, got "${hex}"`);
  return [0, 2, 4].map((i) => parseInt(full.slice(i, i + 2), 16));
}
