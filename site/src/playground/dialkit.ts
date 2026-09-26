import type { DialConfig } from 'dialkit';

/**
 * Builds a DialKit panel config from a plain defaults object (numbers,
 * booleans, nested objects such as `{ x, y, z }` vectors). Ranges are derived
 * from the default's magnitude; pass `overrides` for the ones that matter.
 */
export type SliderTuple = readonly [number, number, number, number];
export type Overrides<T> = {
  [K in keyof T]?: T[K] extends number ? SliderTuple : T[K] extends object ? Overrides<T[K]> : never;
};

/** Positions, angles and offsets can go either way; everything else is a magnitude. */
const SIGNED_KEY = /^(x|y|z|phase|lean)$|X$|Y$/;

function sliderFor(value: number, signed: boolean): SliderTuple {
  const mag = Math.abs(value);
  if (signed) {
    const range = Math.max(2, Math.ceil(mag * 2));
    return [value, -range, range, range >= 20 ? 1 : 0.01];
  }
  if (value === 0) return [0, -1, 1, 0.01];
  const step = Number.isInteger(value) && mag >= 5 ? 1 : mag >= 100 ? 1 : mag >= 10 ? 0.1 : mag >= 1 ? 0.01 : 0.001;
  const min = value < 0 ? value * 4 : 0;
  const max = value < 0 ? mag : value * 4;
  return [value, min, max, step];
}

export function configFromDefaults<T extends object>(
  defaults: T,
  overrides: Overrides<T> = {},
  exclude: readonly string[] = [],
  collapsed = true,
): DialConfig {
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(defaults as Record<string, unknown>)) {
    if (exclude.includes(key)) continue;
    const override = (overrides as Record<string, unknown>)[key];
    if (typeof value === 'number') out[key] = [...((override as SliderTuple | undefined) ?? sliderFor(value, SIGNED_KEY.test(key)))];
    else if (typeof value === 'boolean') out[key] = value;
    else if (typeof value === 'string') out[key] = value;
    else if (value && typeof value === 'object') {
      const folder = configFromDefaults(value as object, (override as Overrides<object>) ?? {}, [], false) as Record<string, unknown>;
      out[key] = collapsed ? { _collapsed: true, ...folder } : folder;
    }
  }
  return out as DialConfig;
}

/** Returns only the leaves of `next` that differ from `prev` (nested objects are returned whole when any leaf changed). */
export function diffParams<T extends object>(prev: T | null, next: T): Partial<T> {
  if (!prev) return { ...next };
  const out: Record<string, unknown> = {};
  const prevRec = prev as Record<string, unknown>;
  for (const [key, value] of Object.entries(next as Record<string, unknown>)) {
    const before = prevRec[key];
    if (value && typeof value === 'object') {
      if (!before || typeof before !== 'object' || JSON.stringify(before) !== JSON.stringify(value)) out[key] = value;
    } else if (before !== value) out[key] = value;
  }
  return out as Partial<T>;
}
