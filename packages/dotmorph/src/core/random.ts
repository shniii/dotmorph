/** Small deterministic PRNG (mulberry32). Same seed, same sequence, on every platform. */
export function createRandom(seed: number) {
  let state = (seed >>> 0) || 0x9e3779b9;
  const next = () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  return {
    next,
    range: (min: number, max: number) => min + (max - min) * next(),
  };
}

export type Random = ReturnType<typeof createRandom>;

export const clamp = (v: number, min: number, max: number) => Math.min(max, Math.max(min, v));

/** Smooth 0..1 ease with zero first and second derivatives at both ends. */
export const smootherstep = (t: number) => {
  const x = clamp(t, 0, 1);
  return x * x * x * (x * (x * 6 - 15) + 10);
};
