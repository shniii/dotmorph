import { BufferGeometry, Float32BufferAttribute, LineSegments, Points, Vector2, Vector3 } from 'three';
import { Shape } from '../core/Shape';
import { HoverSwirl } from '../core/hover';
import { clamp, createRandom } from '../core/random';

/**
 * Parameters of the fan: a bow tie of smooth strands. Every strand leaves a
 * point in a left column, sweeps through a narrow waist and ends at a point in
 * a right column. Each strand draws itself in from left to right, holds, then
 * erases from left to right, on its own rhythm, with a dot at either end.
 *
 * A cycle is split into four parts: drawing (`drawPortion`), holding (whatever
 * is left over), erasing (`erasePortion`) and resting, fully hidden
 * (`restPortion`). If the three shares add up to more than 0.98 they are scaled
 * down together.
 */
export interface FanParams {
  /** Number of strands (two dots each). Structural. */
  strands: number;
  /** Points per strand, spaced evenly by length; more gives smoother curves. Structural. */
  samples: number;
  /** x of the left column, in world units. Structural. */
  leftX: number;
  /** x of the right column, in world units. Structural. */
  rightX: number;
  /** Height of the left column the strands start from, in world units. Structural. */
  leftSpread: number;
  /** Height of the right column the strands end at, in world units. Structural. */
  rightSpread: number;
  /** Vertical centre of both columns. Structural. */
  centerY: number;
  /** x of the waist, where the strands pinch together. Structural. */
  waistX: number;
  /** Vertical centre of the waist. Structural. */
  waistY: number;
  /** Height of the band the strands pass through at the waist, in world units. Structural. */
  waistWidth: number;
  /**
   * 0..1: how far the strands stay pulled together either side of the waist, as
   * a fraction of the distance to each column (higher gives a longer, tighter waist). Structural.
   */
  bulge: number;
  /**
   * 0..1: how far each strand leaves its column level before it turns towards
   * the waist, as a fraction of the distance to the waist. Structural.
   */
  endEase: number;
  /** 0..1: share of mirrored strand pairs that swap their right ends, so they cross over at the waist. Structural. */
  cross: number;
  /** Depth spread of the strands (mostly at the waist), in world units. Structural. */
  depth: number;
  /** Seed for the waist, depth, crossings and rhythms. Structural. */
  seed: number;
  /** Shortest cycle of a strand, in seconds (changing it moves strands to a new point in their cycle). Live. */
  minPeriod: number;
  /** Longest cycle of a strand, in seconds; each strand picks its own between the two. Live. */
  maxPeriod: number;
  /** Share of a cycle spent drawing in, from left to right. Live. */
  drawPortion: number;
  /** Share of a cycle spent erasing, from left to right. Live. */
  erasePortion: number;
  /** Share of a cycle a strand stays hidden before it draws again. Live. */
  restPortion: number;
  /** Length of the soft fade at the drawing head and the erasing tail, as a fraction of the strand. Live. */
  softness: number;
  /** How far the strands' wings drift up and down, in world units (ends and waist stay put). Live. */
  drift: number;
  /** How fast the wings drift. Live. */
  driftSpeed: number;
  /** Opacity of a fully drawn strand. Live. */
  lineOpacity: number;
  /** 0..1: how much strands thin out where they bunch up at the waist. Live. */
  waistFade: number;
  /** Size of the end dots, relative to the engine's dot size. Live. */
  dotScale: number;
  /**
   * Reach of the pointer's swirl, in canvas heights, measured on the canvas
   * around the swirl centre (the same across and up, so it is round on screen).
   * Every point of a strand, and every end dot, feels it at its own place, so
   * hovering the middle of a wing moves that part of the wing. Live.
   */
  hoverReach: number;
  /**
   * Largest swirl offset, in canvas heights, of a point at a column. Points
   * nearer the waist take less: nothing at the waist, rising smoothly to all
   * of it at each column, so the strands stay pinned at the waist. Live.
   */
  hoverSize: number;
}

export const FAN_DEFAULTS: FanParams = {
  strands: 90,
  samples: 64,
  leftX: -3.7,
  rightX: 3.7,
  leftSpread: 3.9,
  rightSpread: 3.1,
  centerY: 0.05,
  waistX: 0,
  waistY: 0.1,
  waistWidth: 0.5,
  bulge: 0.55,
  endEase: 0.3,
  cross: 0.2,
  depth: 0.8,
  seed: 11,
  minPeriod: 6,
  maxPeriod: 11,
  drawPortion: 0.3,
  erasePortion: 0.28,
  restPortion: 0.12,
  softness: 0.05,
  drift: 0.06,
  driftSpeed: 0.18,
  lineOpacity: 0.45,
  waistFade: 0.5,
  dotScale: 0.85,
  hoverReach: 0.2,
  hoverSize: 0.05,
};

/** How much of the overall left-to-right slope a strand keeps as it passes the waist. */
const WAIST_SLOPE = 0.75;

/** Fine points traced per output segment before a strand is resampled evenly by length. */
const TRACE_DENSITY = 8;

/**
 * Shared by lines and dots. `aStrand` is per strand: x = phase offset, y = where
 * its period sits between min and max, z = its brightness.
 */
const COMMON = /* glsl */ `
uniform vec2 uPeriod;
uniform vec3 uPhases;
uniform float uSoftness;
uniform vec3 uSwirl;
uniform vec2 uFanHover;
uniform vec3 uFanWings;
attribute vec3 aStrand;

// Hover: the pointer stirs the strands. Each point works the swirl out at its
// own place on the canvas (point is where it is drawn, rest is its place in the
// shape) and keeps a share of it that is 0 at the waist and rises smoothly to 1
// at either column, so the strands flex but stay pinned at the waist.
vec3 fanHover(vec3 point, vec3 rest) {
  if (uHoverGain <= 0.0 || uSwirl.z <= 0.0) return vec3(0.0);
  float side = rest.x - uFanWings.x;
  float outward = side >= 0.0 ? side / uFanWings.z : -side / uFanWings.y;
  float share = smoothstep(0.0, 1.0, outward);
  if (share <= 0.0) return vec3(0.0);
  vec3 view = (modelViewMatrix * vec4(point, 1.0)).xyz;
  vec3 swirl = dmSwirl(view, uSwirl.xy, uFanHover.x * uHoverReach, uFanHover.y * uSwirl.z * uHoverGain);
  return dmViewToModel(swirl) * share;
}

// Where this strand is in its cycle: x = head, y = tail, both 0..1 along the strand.
vec2 fanRhythm() {
  float period = mix(uPeriod.x, uPeriod.y, aStrand.y);
  float life = fract(uTime / period + aStrand.x);
  float eraseStart = 1.0 - uPhases.z - uPhases.y;
  return vec2(dmSmoother(life / uPhases.x), dmSmoother((life - eraseStart) / uPhases.y));
}
`;

const LINE_DECLARATIONS =
  COMMON +
  /* glsl */ `
uniform vec2 uDrift;
uniform float uLineOpacity;
uniform float uWaistFade;
uniform float uWaistX;
`;

const LINE = /* glsl */ `
vec3 dmShapeLine(out float alpha) {
  // Head and tail run a little past 1 so the soft edge clears the right end.
  vec2 rhythm = fanRhythm();
  float soft = max(uSoftness, 0.001);
  float head = rhythm.x * (1.0 + soft);
  float tail = rhythm.y * (1.0 + soft);
  float drawn = (1.0 - smoothstep(head - soft, head, aAlong)) * smoothstep(tail - soft, tail, aAlong);
  float waist = 1.0 - smoothstep(0.0, 1.6, abs(position.x - uWaistX));
  alpha = uLineOpacity * aStrand.z * drawn * (1.0 - uWaistFade * waist);

  // The wings drift up and down; the ends (where the dots sit) and the waist stay put.
  float wing = sin(DM_TAU * aAlong);
  vec3 p = position;
  p.y += uDrift.x * wing * wing * dmNoise(vec2(aSeed * 61.0 + 5.0, uTime * uDrift.y + aSeed * 7.0));
  return p + fanHover(p, position);
}
`;

const DOT_DECLARATIONS =
  COMMON +
  /* glsl */ `
uniform float uDotScale;
attribute float aEnd;
`;

const DOT = /* glsl */ `
vec3 dmShapeDot(out float alpha, out float scale) {
  vec2 rhythm = fanRhythm();
  float soft = max(uSoftness, 0.001);
  // The left dot grows as the line starts drawing and shrinks as the tail passes it.
  float start = soft / (1.0 + soft) + 0.04;
  float left = smoothstep(0.0, start, rhythm.x) * (1.0 - smoothstep(0.0, start, rhythm.y));
  // The right dot grows as the head reaches the end and shrinks as the tail does.
  float arrive = 1.0 / (1.0 + soft) - 0.02;
  float right = smoothstep(arrive, 1.0, rhythm.x) * (1.0 - smoothstep(arrive, 1.0, rhythm.y));
  float shown = mix(left, right, aEnd);
  // Dots in flight always show, so the cloud stays full; the rhythm takes over as they land.
  shown = mix(1.0, shown, smoothstep(0.6, 1.0, dmProgress(uPresence, aSeed)));
  alpha = smoothstep(0.0, 0.5, shown);
  scale = uDotScale * shown;
  return position + fanHover(position, position);
}
`;

function bezier(out: Vector3, a: Vector3, b: Vector3, c: Vector3, d: Vector3, t: number) {
  const s = 1 - t;
  const w0 = s * s * s;
  const w1 = 3 * s * s * t;
  const w2 = 3 * s * t * t;
  const w3 = t * t * t;
  return out.set(
    a.x * w0 + b.x * w1 + c.x * w2 + d.x * w3,
    a.y * w0 + b.y * w1 + c.y * w2 + d.y * w3,
    a.z * w0 + b.z * w1 + c.z * w2 + d.z * w3,
  );
}

export class FanShape extends Shape<FanParams> {
  readonly name = 'fan' as const;
  protected readonly structuralKeys = [
    'strands',
    'samples',
    'leftX',
    'rightX',
    'leftSpread',
    'rightSpread',
    'centerY',
    'waistX',
    'waistY',
    'waistWidth',
    'bulge',
    'endEase',
    'cross',
    'depth',
    'seed',
  ] as const;
  protected readonly ownsHover = true;
  /** Swirl centre and energy, shared with the materials as `uSwirl`. */
  private readonly swirl = new HoverSwirl();

  constructor(params?: Partial<FanParams>) {
    super(FAN_DEFAULTS, params);
    Object.assign(this.local, {
      uPeriod: { value: new Vector2() },
      uPhases: { value: new Vector3() },
      uSoftness: { value: 0 },
      uDrift: { value: new Vector2() },
      uLineOpacity: { value: 0 },
      uWaistFade: { value: 0 },
      uWaistX: { value: 0 },
      uDotScale: { value: 0 },
      uSwirl: this.swirl.uniform,
      uFanHover: { value: new Vector2() },
      uFanWings: { value: new Vector3(0, 1, 1) },
    });
  }

  pointerMove(x: number, y: number, live: boolean) {
    super.pointerMove(x, y, live);
    this.swirl.move(x, y, live);
  }

  /** Drains the energy and moves the swirl centre; the shaders do the rest. */
  updateHover(_time: number, delta: number) {
    this.swirl.step(delta);
  }

  resetHover() {
    super.resetHover();
    this.swirl.reset();
  }

  protected build() {
    const p = this.params;
    const count = Math.max(1, Math.round(p.strands));
    const samples = Math.max(4, Math.round(p.samples));
    const ease = clamp(p.endEase, 0, 1);
    const bulge = clamp(p.bulge, 0, 1);
    // Separate streams, so moving one slider doesn't reshuffle everything else.
    const layout = createRandom(p.seed * 7717 + 29);
    const crossing = createRandom(p.seed * 3571 + 5);
    const rhythm = createRandom(p.seed * 1597 + 83);

    // Right-end slots run in the same order as the left ones; some mirrored
    // pairs swap theirs, so those strands cross over at the waist.
    const slots = Array.from({ length: count }, (_, i) => i);
    for (let i = 0; i < Math.floor(count / 2); i++) {
      if (crossing.next() >= p.cross) continue;
      const j = count - 1 - i;
      const slot = slots[i];
      slots[i] = slots[j];
      slots[j] = slot;
    }

    const segments = samples - 1;
    const perStrand = segments * 2;
    const vertices = count * perStrand;
    const linePositions = new Float32Array(vertices * 3);
    const lineStrands = new Float32Array(vertices * 3);
    const lineSeeds = new Float32Array(vertices);
    const along = new Float32Array(vertices);
    const dotPositions = new Float32Array(count * 2 * 3);
    const dotStrands = new Float32Array(count * 2 * 3);
    const dotEnds = new Float32Array(count * 2);

    // Each strand is first traced finely, then resampled at even steps of length.
    const traced = segments * TRACE_DENSITY + 1;
    const trace = new Float32Array(traced * 3);
    const traceLength = new Float32Array(traced);
    const points = new Float32Array(samples * 3);
    const left = new Vector3();
    const right = new Vector3();
    const waist = new Vector3();
    const tangent = new Vector3();
    const a1 = new Vector3();
    const a2 = new Vector3();
    const b1 = new Vector3();
    const b2 = new Vector3();
    const point = new Vector3();
    const previous = new Vector3();

    for (let i = 0; i < count; i++) {
      // Column positions as -0.5..0.5, top first.
      const uLeft = count === 1 ? 0 : 0.5 - i / (count - 1);
      const uRight = count === 1 ? 0 : 0.5 - slots[i] / (count - 1);
      left.set(p.leftX, p.centerY + p.leftSpread * uLeft, p.depth * 0.2 * (layout.next() - 0.5));
      right.set(p.rightX, p.centerY + p.rightSpread * uRight, p.depth * 0.2 * (layout.next() - 0.5));
      // At the waist, strands keep roughly their order with some seeded jitter.
      const waistOffset = 0.55 * 0.5 * (uLeft + uRight) + 0.45 * (layout.next() - 0.5);
      waist.set(p.waistX, p.waistY + p.waistWidth * waistOffset, p.depth * (layout.next() - 0.5));

      // Two cubics joined at the waist. Each leaves its column level, and both
      // share one tangent at the waist (part of the strand's overall slope).
      const toWaist = waist.x - left.x;
      const fromWaist = right.x - waist.x;
      const width = right.x - left.x;
      const slope = Math.abs(width) > 1e-3 ? WAIST_SLOPE / width : 0;
      tangent.set(1, (right.y - left.y) * slope, (right.z - left.z) * slope);
      a1.set(left.x + ease * toWaist, left.y, left.z);
      a2.copy(waist).addScaledVector(tangent, -bulge * toWaist);
      b1.copy(waist).addScaledVector(tangent, bulge * fromWaist);
      b2.set(right.x - ease * fromWaist, right.y, right.z);

      for (let s = 0; s < traced; s++) {
        const t = (s / (traced - 1)) * 2;
        if (t <= 1) bezier(point, left, a1, a2, waist, t);
        else bezier(point, waist, b1, b2, right, t - 1);
        trace[s * 3] = point.x;
        trace[s * 3 + 1] = point.y;
        trace[s * 3 + 2] = point.z;
        traceLength[s] = s === 0 ? 0 : traceLength[s - 1] + point.distanceTo(previous);
        previous.copy(point);
      }
      // Even steps of length keep every segment about the same size (so curves
      // stay smooth where the strand moves fastest) and make aAlong the true
      // share of the strand drawn so far.
      const total = traceLength[traced - 1];
      let d = 0;
      for (let s = 0; s < samples; s++) {
        const target = (total * s) / segments;
        while (d < traced - 2 && traceLength[d + 1] < target) d++;
        const step = traceLength[d + 1] - traceLength[d];
        const f = step > 1e-9 ? clamp((target - traceLength[d]) / step, 0, 1) : 0;
        for (let c = 0; c < 3; c++) points[s * 3 + c] = trace[d * 3 + c] + (trace[(d + 1) * 3 + c] - trace[d * 3 + c]) * f;
      }

      // Rhythm: phase offsets on a golden-ratio sequence (with jitter) so
      // neighbouring strands are never in step.
      const offset = (((i * 0.6180339887 + rhythm.range(-0.2, 0.2)) % 1) + 1) % 1;
      const periodMix = rhythm.next();
      const brightness = rhythm.range(0.6, 1);
      const seed = rhythm.next();

      for (let s = 0; s < segments; s++) {
        for (let e = 0; e < 2; e++) {
          const v = i * perStrand + s * 2 + e;
          const k = s + e;
          linePositions.set(points.subarray(k * 3, k * 3 + 3), v * 3);
          lineStrands[v * 3] = offset;
          lineStrands[v * 3 + 1] = periodMix;
          lineStrands[v * 3 + 2] = brightness;
          lineSeeds[v] = seed;
          along[v] = k / segments;
        }
      }

      for (let e = 0; e < 2; e++) {
        const d = i * 2 + e;
        const end = e === 0 ? left : right;
        dotPositions.set([end.x, end.y, end.z], d * 3);
        dotStrands.set([offset, periodMix, brightness], d * 3);
        dotEnds[d] = e;
      }
    }

    const lines = new BufferGeometry();
    lines.setAttribute('position', new Float32BufferAttribute(linePositions, 3));
    lines.setAttribute('aStrand', new Float32BufferAttribute(lineStrands, 3));
    lines.setAttribute('aSeed', new Float32BufferAttribute(lineSeeds, 1));
    lines.setAttribute('aAlong', new Float32BufferAttribute(along, 1));

    const dots = new BufferGeometry();
    dots.setAttribute('position', new Float32BufferAttribute(dotPositions, 3));
    dots.setAttribute('aStrand', new Float32BufferAttribute(dotStrands, 3));
    dots.setAttribute('aEnd', new Float32BufferAttribute(dotEnds, 1));
    this.addCloud(dots, count * 2, 409);

    const lineMesh = new LineSegments(lines, this.lineMaterial(LINE_DECLARATIONS, LINE));
    const dotMesh = new Points(dots, this.dotMaterial(DOT_DECLARATIONS, DOT));
    for (const mesh of [lineMesh, dotMesh]) mesh.frustumCulled = false;
    this.group.add(lineMesh, dotMesh);
  }

  protected syncUniforms() {
    const p = this.params;
    const u = this.local;
    const minPeriod = Math.max(0.5, p.minPeriod);
    (u.uPeriod.value as Vector2).set(minPeriod, Math.max(minPeriod, p.maxPeriod));
    // Keep a sliver of hold time so the phases never overlap.
    const draw = clamp(p.drawPortion, 0.02, 0.9);
    const erase = clamp(p.erasePortion, 0.02, 0.9);
    const rest = clamp(p.restPortion, 0, 0.9);
    const fit = Math.min(1, 0.98 / (draw + erase + rest));
    (u.uPhases.value as Vector3).set(draw * fit, erase * fit, rest * fit);
    u.uSoftness.value = clamp(p.softness, 0.005, 0.5);
    (u.uDrift.value as Vector2).set(p.drift, p.driftSpeed);
    u.uLineOpacity.value = p.lineOpacity;
    u.uWaistFade.value = clamp(p.waistFade, 0, 1);
    u.uWaistX.value = p.waistX;
    u.uDotScale.value = Math.max(0, p.dotScale);
    (u.uFanHover.value as Vector2).set(Math.max(1e-3, p.hoverReach), Math.max(0, p.hoverSize));
    // The waist and how far each column is from it, for the hover share.
    (u.uFanWings.value as Vector3).set(p.waistX, Math.max(1e-3, p.waistX - p.leftX), Math.max(1e-3, p.rightX - p.waistX));
  }
}
