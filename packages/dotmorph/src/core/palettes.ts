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

/** The glow every built-in background shares: an arch rising from just below the bottom edge. */
const GLOW = 'radial-gradient(136% 116% at 50% 114%';

export const PALETTES: Record<PaletteName, Palette> = {
  /** Sunrise: violet on the horizon, then pink, apricot and cream; purple dots rising to hot pink. */
  aurora: {
    top: '#ff1486',
    bottom: '#850fff',
    background: `${GLOW}, #a462ff 0%, #fc6abc 20%, #ffae30 36%, #fdfaff 60%)`,
  },
  /** Morning sea: deep blue under sky blue, fading to pale air. */
  ocean: {
    top: '#2b9ff2',
    bottom: '#1830b0',
    background: `${GLOW}, #017de6 0%, #49b0fa 16%, #92d0ff 32%, #f5f9ff 64%)`,
  },
  /** Firelight: red-orange under orange and peach; crimson dots rising to amber. */
  ember: {
    top: '#f98316',
    bottom: '#d01040',
    background: `${GLOW}, #ff5c1f 0%, #ff914d 20%, #fffaf3 68%)`,
  },
  /** Lagoon: teal under aqua, fading to a cool white; deep-blue dots rising to teal. */
  mint: {
    top: '#12b39c',
    bottom: '#0b56a0',
    background: `${GLOW}, #00a890 0%, #5de2c4 16%, #a4f5dd 36%, #f5fffb 68%)`,
  },
  /** Sunset: coral into pink into lilac; plum dots rising to rose. */
  rose: {
    top: '#d8378e',
    bottom: '#7a1f8a',
    background: `${GLOW}, #ff7a6a 0%, #ff6f9e 16%, #e890e0 32%, #f5b8eb 48%, #fffafd 68%)`,
  },
  /** Deep night: a periwinkle glow on the horizon rising through purple into navy; ice-white dots. */
  midnight: {
    top: '#dde2ff',
    bottom: '#9ee7ff',
    rampEnd: 0.9,
    dark: true,
    background: `${GLOW}, #a8b8ff 0%, #7a48e4 20%, #3a1a9a 40%, #1c006c 60%, #00004c 88%)`,
  },
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
