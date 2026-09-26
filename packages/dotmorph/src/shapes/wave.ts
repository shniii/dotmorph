import { BufferGeometry, Float32BufferAttribute, LineSegments, Points, Vector2, Vector3 } from 'three';
import { Shape, type Vec3Like } from '../core/Shape';
import { clamp, createRandom } from '../core/random';

/**
 * Parameters of the wave: a ribbon of vertical stems standing along a path that
 * swings left and right while it climbs away from the viewer, like a fence
 * winding up a hill. A dot sits on top of every stem.
 *
 * The path runs from s = 0 (nearest the viewer, low) to s = 1 (far and high):
 * x = amplitude * sin(2π * turns * s + phase), y = rise * s, z = -depth * s,
 * then shifted by `offset`.
 */
export interface WaveParams {
  /** Number of stems (and dots), spaced evenly by length along the path. Structural. */
  stems: number;
  /** How far the path swings left and right of its centre line, in world units. Structural. */
  amplitude: number;
  /** Number of full left-right swings between the near end and the far end. Structural. */
  turns: number;
  /** Where in its swing the path starts, in radians (0 = centre, heading right). Structural. */
  phase: number;
  /** How far the path climbs from the near end to the far end, in world units. Structural. */
  rise: number;
  /** How far the path recedes from the near end to the far end, in world units. Structural. */
  depth: number;
  /** Position of the path's near end (s = 0). Live. */
  offset: Vec3Like;
  /** Seed for the per-stem height variation. Structural. */
  seed: number;
  /** Length of each stem, hanging down from its dot, in world units. Live. */
  height: number;
  /** 0..1: how much shorter some stems are at random (0 = all the same length). Live. */
  heightJitter: number;
  /** How far the stem tops bob up and down, in world units. Live. */
  bob: number;
  /** How fast the tops bob, in radians per second. Live. */
  bobSpeed: number;
  /** Seconds between two pulses travelling up the ribbon (0 turns the pulse off). Live. */
  pulsePeriod: number;
  /** Seconds a pulse takes to travel from the near end to the far end (capped at `pulsePeriod`). Live. */
  pulseDuration: number;
  /** Half-width of the pulse as a fraction of the ribbon's length. Live. */
  pulseWidth: number;
  /** How far the pulse lifts the stem tops it passes, in world units. Live. */
  pulseLift: number;
  /** How much brighter stems and dots get at the pulse (0 = no change, 1 = twice as bright). Live. */
  pulseGlow: number;
  /** How much larger dots get at the pulse (0 = no change, 1 = twice as large). Live. */
  pulseDotScale: number;
  /** Opacity multiplier at the far end (s = 1); everything fades linearly towards it. Live. */
  farOpacity: number;
  /** Opacity of the stems at their tops, before the distance fade. Live. */
  lineOpacity: number;
  /** 0..1: how much each stem fades towards its bottom (1 = invisible at the bottom). Live. */
  lineFade: number;
  /** Dot size at the near end, relative to the engine's dot size. Live. */
  dotScale: number;
  /** Dot size at the far end, as a fraction of `dotScale`. Live. */
  farDotScale: number;
}

export const WAVE_DEFAULTS: WaveParams = {
  stems: 340,
  amplitude: 5.2,
  turns: 1.75,
  phase: -0.8,
  rise: 9,
  depth: 16,
  offset: { x: 0.3, y: -2.4, z: 0 },
  seed: 5,
  height: 3.5,
  heightJitter: 0.18,
  bob: 0.07,
  bobSpeed: 0.9,
  pulsePeriod: 7,
  pulseDuration: 5,
  pulseWidth: 0.09,
  pulseLift: 0.3,
  pulseGlow: 1.2,
  pulseDotScale: 0.7,
  farOpacity: 0.08,
  lineOpacity: 0.4,
  lineFade: 1,
  dotScale: 0.95,
  farDotScale: 0.55,
};

const DECLARATIONS = /* glsl */ `
uniform vec3 uOffset;
uniform float uAmplitude;
uniform float uTurns;
uniform float uPhase;
uniform float uRise;
uniform float uDepth;
uniform float uHeight;
uniform float uHeightJitter;
uniform float uBob;
uniform float uBobSpeed;
uniform float uPulsePeriod;
uniform float uPulseDuration;
uniform float uPulseWidth;
uniform float uPulseLift;
uniform float uPulseGlow;
uniform float uPulseDotScale;
uniform float uFarOpacity;
uniform float uLineOpacity;
uniform float uLineFade;
uniform vec2 uDotScale;
attribute float aS;
attribute float aArc;
attribute float aRand;

// Resting top of the stem at path parameter s.
vec3 wavePath(float s) {
  return uOffset + vec3(uAmplitude * sin(DM_TAU * uTurns * s + uPhase), uRise * s, -uDepth * s);
}

// 0..1: how close the travelling pulse is to this stem. The pulse moves along
// the ribbon's length (aArc), entering before the near end and leaving past
// the far end, so it never pops in or out.
float wavePulse() {
  if (uPulsePeriod <= 0.0 || uPulseWidth <= 0.0) return 0.0;
  float progress = mod(uTime, uPulsePeriod) / uPulseDuration;
  float head = mix(-uPulseWidth, 1.0 + uPulseWidth, progress);
  return dmSmoother(1.0 - abs(aArc - head) / uPulseWidth);
}

// How far the top is raised: a slow bob travelling up the ribbon plus the pulse.
float waveLift(float pulse) {
  float t = uTime * uBobSpeed;
  float bob = 0.7 * sin(t - aS * 14.0) + 0.3 * dmNoise(vec2(aArc * 9.0 + 3.1, t * 0.6));
  return uBob * bob + uPulseLift * pulse;
}

// Opacity multiplier from distance and from the pulse.
float waveBrightness(float pulse) {
  return mix(1.0, uFarOpacity, aS) * (1.0 + uPulseGlow * pulse);
}
`;

const DOT = /* glsl */ `
vec3 dmShapeDot(out float alpha, out float scale) {
  float pulse = wavePulse();
  alpha = min(1.0, waveBrightness(pulse));
  scale = uDotScale.x * mix(1.0, uDotScale.y, aS) * (1.0 + uPulseDotScale * pulse);
  vec3 top = wavePath(aS);
  top.y += waveLift(pulse);
  return top;
}
`;

const LINE = /* glsl */ `
vec3 dmShapeLine(out float alpha) {
  float pulse = wavePulse();
  vec3 top = wavePath(aS);
  vec3 bottom = top - vec3(0.0, uHeight * (1.0 - uHeightJitter * aRand), 0.0);
  top.y += waveLift(pulse);
  alpha = min(1.0, uLineOpacity * mix(1.0 - uLineFade, 1.0, aAlong) * waveBrightness(pulse));
  return mix(bottom, top, aAlong);
}
`;

export class WaveShape extends Shape<WaveParams> {
  readonly name = 'wave' as const;
  protected readonly structuralKeys = ['stems', 'amplitude', 'turns', 'phase', 'rise', 'depth', 'seed'] as const;

  constructor(params?: Partial<WaveParams>) {
    super(WAVE_DEFAULTS, params);
    Object.assign(this.local, {
      uOffset: { value: new Vector3() },
      uAmplitude: { value: 0 },
      uTurns: { value: 0 },
      uPhase: { value: 0 },
      uRise: { value: 0 },
      uDepth: { value: 0 },
      uHeight: { value: 0 },
      uHeightJitter: { value: 0 },
      uBob: { value: 0 },
      uBobSpeed: { value: 0 },
      uPulsePeriod: { value: 0 },
      uPulseDuration: { value: 1 },
      uPulseWidth: { value: 0 },
      uPulseLift: { value: 0 },
      uPulseGlow: { value: 0 },
      uPulseDotScale: { value: 0 },
      uFarOpacity: { value: 0 },
      uLineOpacity: { value: 0 },
      uLineFade: { value: 0 },
      uDotScale: { value: new Vector2() },
    });
  }

  protected build() {
    const p = this.params;
    const count = Math.max(1, Math.round(p.stems));
    const rng = createRandom(p.seed * 2027 + 29);
    const params = arcSpacedParams(p, count);
    const arcs = new Float32Array(count);
    const rands = new Float32Array(count);
    for (let i = 0; i < count; i++) {
      arcs[i] = count > 1 ? i / (count - 1) : 0;
      rands[i] = rng.next();
    }

    const dots = new BufferGeometry();
    dots.setAttribute('position', new Float32BufferAttribute(new Float32Array(count * 3), 3));
    dots.setAttribute('aS', new Float32BufferAttribute(params, 1));
    dots.setAttribute('aArc', new Float32BufferAttribute(arcs, 1));
    dots.setAttribute('aRand', new Float32BufferAttribute(rands, 1));
    this.addCloud(dots, count, 303);
    const seeds = dots.getAttribute('aSeed').array as Float32Array;

    // Two vertices per stem: along = 0 at the bottom, 1 at the top (where the dot sits).
    const lineParams = new Float32Array(count * 2);
    const lineArcs = new Float32Array(count * 2);
    const lineRands = new Float32Array(count * 2);
    const lineSeeds = new Float32Array(count * 2);
    const along = new Float32Array(count * 2);
    for (let i = 0; i < count; i++) {
      for (let e = 0; e < 2; e++) {
        const v = i * 2 + e;
        lineParams[v] = params[i];
        lineArcs[v] = arcs[i];
        lineRands[v] = rands[i];
        lineSeeds[v] = seeds[i];
        along[v] = e;
      }
    }
    const lines = new BufferGeometry();
    lines.setAttribute('position', new Float32BufferAttribute(new Float32Array(count * 6), 3));
    lines.setAttribute('aS', new Float32BufferAttribute(lineParams, 1));
    lines.setAttribute('aArc', new Float32BufferAttribute(lineArcs, 1));
    lines.setAttribute('aRand', new Float32BufferAttribute(lineRands, 1));
    lines.setAttribute('aSeed', new Float32BufferAttribute(lineSeeds, 1));
    lines.setAttribute('aAlong', new Float32BufferAttribute(along, 1));

    const lineMesh = new LineSegments(lines, this.lineMaterial(DECLARATIONS, LINE));
    const dotMesh = new Points(dots, this.dotMaterial(DECLARATIONS, DOT));
    for (const mesh of [lineMesh, dotMesh]) mesh.frustumCulled = false;
    this.group.add(lineMesh, dotMesh);
  }

  protected syncUniforms() {
    const p = this.params;
    const u = this.local;
    (u.uOffset.value as Vector3).set(p.offset.x, p.offset.y, p.offset.z);
    u.uAmplitude.value = p.amplitude;
    u.uTurns.value = p.turns;
    u.uPhase.value = p.phase;
    u.uRise.value = p.rise;
    u.uDepth.value = p.depth;
    u.uHeight.value = p.height;
    u.uHeightJitter.value = clamp(p.heightJitter, 0, 1);
    u.uBob.value = p.bob;
    u.uBobSpeed.value = p.bobSpeed;
    u.uPulsePeriod.value = p.pulsePeriod;
    u.uPulseDuration.value = clamp(p.pulseDuration, 0.05, Math.max(p.pulsePeriod, 0.05));
    u.uPulseWidth.value = p.pulseWidth;
    u.uPulseLift.value = p.pulseLift;
    u.uPulseGlow.value = p.pulseGlow;
    u.uPulseDotScale.value = p.pulseDotScale;
    u.uFarOpacity.value = p.farOpacity;
    u.uLineOpacity.value = p.lineOpacity;
    u.uLineFade.value = clamp(p.lineFade, 0, 1);
    (u.uDotScale.value as Vector2).set(p.dotScale, p.farDotScale);
  }
}

/**
 * Path parameters (0..1) of `count` stems spaced evenly by length along the
 * path, so the fence posts keep the same spacing through the swings. Offset is
 * left out: it moves the path without changing its length.
 */
function arcSpacedParams(p: WaveParams, count: number): Float32Array {
  const out = new Float32Array(count);
  if (count < 2) return out;
  const samples = Math.max(1024, count * 8);
  const cumulative = new Float64Array(samples + 1);
  const frequency = Math.PI * 2 * p.turns;
  let px = p.amplitude * Math.sin(p.phase);
  let py = 0;
  let pz = 0;
  for (let k = 1; k <= samples; k++) {
    const s = k / samples;
    const x = p.amplitude * Math.sin(frequency * s + p.phase);
    const y = p.rise * s;
    const z = -p.depth * s;
    cumulative[k] = cumulative[k - 1] + Math.hypot(x - px, y - py, z - pz);
    px = x;
    py = y;
    pz = z;
  }
  const total = cumulative[samples];
  let j = 0;
  for (let i = 0; i < count; i++) {
    const t = i / (count - 1);
    // A degenerate path (or non-finite params) falls back to even steps in s.
    if (!(total > 1e-9)) {
      out[i] = t;
      continue;
    }
    const target = total * t;
    while (j < samples - 1 && cumulative[j + 1] < target) j++;
    const span = cumulative[j + 1] - cumulative[j];
    const f = span > 0 ? clamp((target - cumulative[j]) / span, 0, 1) : 0;
    out[i] = Math.min(1, (j + f) / samples);
  }
  return out;
}
