import { BufferGeometry, Float32BufferAttribute, LineSegments, Points, Vector2, Vector3 } from 'three';
import { Shape, type Vec3Like } from '../core/Shape';
import { TipSprings, ViewMirror, springSlices, springVelocity } from '../core/hover';
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
  /**
   * Reach of the pointer around each stem top, in canvas heights, measured on
   * the canvas (the same across and up, so it is round on screen). It is the
   * same on screen for near and far stems. Live.
   */
  hoverReach: number;
  /**
   * How far a top right under the pointer settles away from it, in canvas
   * heights (at most 60% of the reach: `hoverReach` scaled by
   * `pointerRadius / 0.32`). Live.
   */
  hoverDent: number;
  /**
   * Sideways swing period of the stem tops, as a share of `hoverPeriod`
   * (at least 0.05). Below 1 a stem is stiffer against leaning than against
   * stretching: its sideways spring is 1 / hoverLean² times as stiff, so under
   * the same push a top leans only about hoverLean² as far as it stretches or
   * squashes (0.65 gives about 0.42). Live.
   */
  hoverLean: number;
  /** Seconds per swing of the stem-top springs, up and down. Live. */
  hoverPeriod: number;
  /** Damping ratio of the stem tops, the same up and down as sideways, and with the pointer near or gone (low = bouncy). Live. */
  hoverDamping: number;
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
  hoverReach: 0.15,
  hoverDent: 0.06,
  hoverLean: 0.65,
  hoverPeriod: 0.55,
  hoverDamping: 0.3,
};

// Hover: the pointer parts the stem tops like a springy field. Each top has a
// spring on the CPU. Closeness, reach and dent are all measured on the canvas
// in canvas heights (round on screen, the same for near and far stems), and
// the push is turned into world units at each top's depth. Only x and y are
// simulated: a drift in depth would be all but invisible, so it is left out on
// purpose.
/** Largest dent, as a share of the reach; past it the bell is too flat to hold a top. */
const HOVER_DENT_MAX = 0.6;
/** Longest frame the springs take in one go, in seconds. */
const HOVER_CAP = 0.04;
/**
 * Below this speed (world units per second), and this distance from balance or
 * from rest (world units), the springs count as settled and stop uploading.
 */
const HOVER_REST = 1e-3;

/** Falloff of the push: a smooth bell, 1 at the pointer and 0 (flat) at the edge of the reach (q = distance / reach). */
function waveFalloff(q: number): number {
  const t = 1 - q * q;
  return t * t;
}

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
attribute vec2 aHover;

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

// The top's hover offset (view space, from the CPU springs) in model space.
vec3 waveHover() {
  return uHoverGain > 0.0 ? dmViewToModel(vec3(aHover * uHoverGain, 0.0)) : vec3(0.0);
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
  return top + waveHover();
}
`;

const LINE = /* glsl */ `
vec3 dmShapeLine(out float alpha) {
  float pulse = wavePulse();
  vec3 top = wavePath(aS);
  vec3 bottom = top - vec3(0.0, uHeight * (1.0 - uHeightJitter * aRand), 0.0);
  top.y += waveLift(pulse);
  alpha = min(1.0, uLineOpacity * mix(1.0 - uLineFade, 1.0, aAlong) * waveBrightness(pulse));
  // Only the top moves, so the stem stretches, squashes and leans from its fixed bottom.
  return mix(bottom, top + waveHover(), aAlong);
}
`;

export class WaveShape extends Shape<WaveParams> {
  readonly name = 'wave' as const;
  protected readonly structuralKeys = ['stems', 'amplitude', 'turns', 'phase', 'rise', 'depth', 'seed'] as const;
  protected readonly ownsHover = true;
  private readonly view = new ViewMirror();
  private springs: TipSprings | null = null;
  /** Per stem: its path parameter (the CPU mirror leaves out the bob and the pulse, which ride on top). */
  private stemParams: Float32Array = new Float32Array(0);
  /** Per stem, refreshed while awake: resting top in view space (x, y, depth). */
  private restX = new Float32Array(0);
  private restY = new Float32Array(0);
  private restDepth = new Float32Array(0);
  /** False once every top has settled, so frames skip the springs and uploads. */
  private awake = false;
  /** The engine's reach factor the springs last ran with; a change wakes them. */
  private reachScale = 1;

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

    // Hover springs, one per stem top, mirrored onto the dot and the stem's two vertices.
    this.springs = new TipSprings(count);
    this.springs.attach(dots, 1);
    this.springs.attach(lines, 2);
    this.stemParams = params;
    this.restX = new Float32Array(count);
    this.restY = new Float32Array(count);
    this.restDepth = new Float32Array(count);
    this.awake = this.pointer.inside;

    const lineMesh = new LineSegments(lines, this.lineMaterial(DECLARATIONS, LINE));
    const dotMesh = new Points(dots, this.dotMaterial(DECLARATIONS, DOT));
    for (const mesh of [lineMesh, dotMesh]) mesh.frustumCulled = false;
    this.group.add(lineMesh, dotMesh);
  }

  pointerMove(x: number, y: number, live: boolean) {
    super.pointerMove(x, y, live);
    this.awake = true;
  }

  pointerLeave() {
    super.pointerLeave();
    this.awake = true;
  }

  resetHover() {
    super.resetHover();
    this.springs?.reset();
    this.awake = false;
  }

  /**
   * Steps every stem top's spring. A top within reach is pushed straight away
   * from the pointer on screen, with a smooth bell falloff. Each top has two
   * springs: up and down it swings every `hoverPeriod`, and sideways it swings
   * `hoverLean` times as long, so a stem resists leaning more than stretching
   * and tops mostly stretch or squash. Distances are measured on the canvas in
   * canvas heights, and the push is scaled so a top right under the pointer
   * settles `hoverDent` away. The damping ratio is the same everywhere, so the
   * ribbon stays bouncy and a sweep leaves a wake. Each step is implicit, so it
   * stays stable for any period or damping. The springs sleep only at a real
   * equilibrium: every top still and where its push and spring balance.
   */
  updateHover(_time: number, delta: number) {
    const springs = this.springs;
    const camera = this.ctx?.camera;
    if (!springs || !camera) return;
    if (this.view.sync(camera, this.group)) this.awake = true;
    const reachScale = this.shared.uHoverReach.value as number;
    if (reachScale !== this.reachScale) {
      this.reachScale = reachScale;
      this.awake = true;
    }
    if (!this.awake) return;
    this.mirrorTops();

    const p = this.params;
    const omega = (Math.PI * 2) / Math.max(p.hoverPeriod, 0.05);
    const stiffness = omega * omega;
    const ratio = clamp(p.hoverDamping, 0, 3);
    const damping = 2 * ratio * omega;
    // The sideways spring: `hoverLean` times the period, same damping ratio.
    const lean = Math.max(0.05, p.hoverLean);
    const leanOmega = omega / lean;
    const leanStiffness = leanOmega * leanOmega;
    const leanDamping = 2 * ratio * leanOmega;
    // Reach and dent in canvas heights.
    const reach = Math.max(1e-3, p.hoverReach * reachScale);
    // A top right under the pointer is pushed straight up and rests where push and spring balance.
    const dent = Math.min(Math.max(0, p.hoverDent), reach * HOVER_DENT_MAX);
    const push = (stiffness * dent) / waveFalloff(dent / reach);
    const { scaleX, scaleY } = this.view;
    const aspect = scaleY / scaleX;
    const { inside, x: cx, y: cy } = this.pointer;
    const { offsetX, offsetY, speedX, speedY } = springs;

    const slices = springSlices(delta, HOVER_CAP);
    const h = Math.min(delta, HOVER_CAP) / slices;
    let pushing = false;
    let fastest = 0;
    let farthest = 0;
    /** Largest distance of a top from where its push and spring balance (world units). */
    let strain = 0;
    for (let slice = 0; slice < slices; slice++) {
      const last = slice === slices - 1;
      for (let i = 0; i < springs.count; i++) {
        const depth = this.restDepth[i];
        const ox = offsetX[i];
        const oy = offsetY[i];
        let forceX = 0;
        let forceY = 0;
        if (inside && depth > 1e-3) {
          // Offset from the pointer in canvas heights.
          const across = (((scaleX * (this.restX[i] + ox)) / depth - cx) * aspect) / 2;
          const up = ((scaleY * (this.restY[i] + oy)) / depth - cy) / 2;
          const gap = Math.hypot(across, up);
          if (gap < reach) {
            // The push in world units at this depth: one canvas height is 2 * depth / scaleY.
            const force = push * waveFalloff(gap / reach) * ((2 * depth) / scaleY);
            if (gap > 1e-9) {
              forceX = (force * across) / gap;
              forceY = (force * up) / gap;
            } else {
              // Right on the pointer there is no "away"; the top stretches up.
              forceY = force;
            }
            pushing = true;
          }
        }
        const vx = springVelocity(ox, speedX[i], forceX, leanStiffness, leanDamping, h);
        const vy = springVelocity(oy, speedY[i], forceY, stiffness, damping, h);
        const nx = ox + (h * (speedX[i] + vx)) / 2;
        const ny = oy + (h * (speedY[i] + vy)) / 2;
        offsetX[i] = nx;
        offsetY[i] = ny;
        speedX[i] = vx;
        speedY[i] = vy;
        if (last) {
          fastest = Math.max(fastest, Math.abs(vx), Math.abs(vy));
          farthest = Math.max(farthest, Math.abs(nx), Math.abs(ny));
          strain = Math.max(strain, Math.abs(forceX / leanStiffness - nx), Math.abs(forceY / stiffness - ny));
        }
      }
    }
    // A bad param (NaN, Infinity) must not leave the wave broken for good.
    if (!Number.isFinite(fastest) || !Number.isFinite(farthest) || !Number.isFinite(strain)) {
      springs.reset();
      this.awake = false;
      return;
    }
    if (!pushing && fastest < HOVER_REST && farthest < HOVER_REST) {
      // Back at rest: zero the offsets (a no-op, uploads included, once they are).
      springs.reset();
      this.awake = false;
      return;
    }
    springs.upload();
    // The mirror leaves out the bob and the pulse, so a held dent under a
    // resting pointer is static: keep it and sleep until something changes.
    // A turning point is still too, but off balance, so it keeps going.
    if (fastest < HOVER_REST && strain < HOVER_REST) this.awake = false;
  }

  /** Resting stem tops (no bob, no pulse) in view space. */
  private mirrorTops() {
    const e = this.view.modelView.elements;
    const p = this.params;
    const frequency = Math.PI * 2 * p.turns;
    for (let i = 0; i < this.stemParams.length; i++) {
      const s = this.stemParams[i];
      const x = p.offset.x + p.amplitude * Math.sin(frequency * s + p.phase);
      const y = p.offset.y + p.rise * s;
      const z = p.offset.z - p.depth * s;
      this.restX[i] = e[0] * x + e[4] * y + e[8] * z + e[12];
      this.restY[i] = e[1] * x + e[5] * y + e[9] * z + e[13];
      this.restDepth[i] = -(e[2] * x + e[6] * y + e[10] * z + e[14]);
    }
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
    // The path may have moved; let the springs look again.
    this.awake = true;
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
