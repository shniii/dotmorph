import { BufferGeometry, Float32BufferAttribute, LineSegments, Points, Vector2, Vector3 } from 'three';
import { Shape, type Vec3Like } from '../core/Shape';
import { createRandom } from '../core/random';

/** Parameters of the burst: rays fanning up from a point below the frame, a dot on every tip. */
export interface BurstParams {
  /** Number of rays (and dots). Structural. */
  rays: number;
  /** Where every ray starts. Live. */
  origin: Vec3Like;
  /** Shortest and longest ray, in world units. Structural. */
  minLength: number;
  maxLength: number;
  /** Half-angle of the cone the rays fill, in degrees (90 = a full half-dome). Structural. */
  spread: number;
  /** Tilt of the cone towards the viewer, in degrees. Structural. */
  lean: number;
  /** Seed for directions and lengths. Structural. */
  seed: number;
  /** How far rays sway, as a fraction of their direction. */
  sway: number;
  /** How fast rays sway. */
  swaySpeed: number;
  /** How much rays lengthen and shorten over time (fraction of length). */
  breathe: number;
  /** 0..1: how strongly tip dots fade in and out. */
  twinkle: number;
  /** Smallest and largest dot, relative to the engine's dot size. */
  minDotScale: number;
  maxDotScale: number;
  /** Opacity of the rays at their tips. */
  lineOpacity: number;
  /** Fraction of each ray (from the origin) that fades out, so the rays don't clump where they meet. */
  lineFade: number;
}

export const BURST_DEFAULTS: BurstParams = {
  rays: 420,
  origin: { x: 0, y: -3.1, z: -1 },
  minLength: 2.6,
  maxLength: 4.3,
  spread: 84,
  lean: 14,
  seed: 3,
  sway: 0.06,
  swaySpeed: 0.28,
  breathe: 0.035,
  twinkle: 0.4,
  minDotScale: 0.55,
  maxDotScale: 1.2,
  lineOpacity: 0.42,
  lineFade: 0.6,
};

/** Straight segments per ray. */
const RAY_SEGMENTS = 4;

const DECLARATIONS = /* glsl */ `
uniform vec3 uOrigin;
uniform float uSway;
uniform float uSwaySpeed;
uniform float uBreathe;
uniform float uTwinkle;
uniform vec2 uDotScale;
uniform float uLineOpacity;
uniform float uLineFade;
attribute vec3 aDirection;
attribute float aLength;

vec3 burstTip() {
  float t = uTime * uSwaySpeed;
  vec3 wobble = vec3(dmNoise(vec2(aSeed * 31.0, t)), 0.35 * dmNoise(vec2(aSeed * 17.0 + 3.0, t)), dmNoise(vec2(aSeed * 13.0 + 7.0, t)));
  vec3 direction = normalize(aDirection + wobble * uSway);
  float length3 = aLength * (1.0 + uBreathe * sin(uTime * 0.8 + aSeed * DM_TAU));
  return uOrigin + direction * length3;
}
`;

const DOT = /* glsl */ `
vec3 dmShapeDot(out float alpha, out float scale) {
  alpha = 1.0 - uTwinkle * (0.5 + 0.5 * sin(uTime * 1.4 + aSeed * 53.0));
  scale = mix(uDotScale.x, uDotScale.y, fract(aSeed * 13.37));
  return burstTip();
}
`;

const LINE = /* glsl */ `
vec3 dmShapeLine(out float alpha) {
  alpha = uLineOpacity * smoothstep(0.0, max(uLineFade, 0.001), aAlong);
  return mix(uOrigin, burstTip(), aAlong);
}
`;

export class BurstShape extends Shape<BurstParams> {
  readonly name = 'burst' as const;
  protected readonly structuralKeys = ['rays', 'minLength', 'maxLength', 'spread', 'lean', 'seed'] as const;

  constructor(params?: Partial<BurstParams>) {
    super(BURST_DEFAULTS, params);
    Object.assign(this.local, {
      uOrigin: { value: new Vector3() },
      uSway: { value: 0 },
      uSwaySpeed: { value: 0 },
      uBreathe: { value: 0 },
      uTwinkle: { value: 0 },
      uDotScale: { value: new Vector2() },
      uLineOpacity: { value: 0 },
      uLineFade: { value: 0 },
    });
  }

  protected build() {
    const p = this.params;
    const count = Math.max(1, Math.round(p.rays));
    const rng = createRandom(p.seed * 1013 + 17);
    const directions = new Float32Array(count * 3);
    const lengths = new Float32Array(count);

    // Directions on a golden-angle spiral over a spherical cap around +y, tilted towards the viewer.
    const cap = (Math.min(Math.max(p.spread, 1), 179) * Math.PI) / 180;
    const lean = (p.lean * Math.PI) / 180;
    const golden = Math.PI * (3 - Math.sqrt(5));
    const dir = new Vector3();
    for (let i = 0; i < count; i++) {
      const t = (i + 0.5) / count;
      const cosTheta = 1 - t * (1 - Math.cos(cap));
      const sinTheta = Math.sqrt(Math.max(0, 1 - cosTheta * cosTheta));
      const phi = i * golden + rng.range(-0.08, 0.08);
      dir.set(sinTheta * Math.cos(phi), cosTheta, sinTheta * Math.sin(phi));
      dir.applyAxisAngle(new Vector3(1, 0, 0), lean).normalize();
      directions.set([dir.x, dir.y, dir.z], i * 3);
      lengths[i] = rng.range(p.minLength, p.maxLength);
    }

    const dots = new BufferGeometry();
    dots.setAttribute('position', new Float32BufferAttribute(new Float32Array(count * 3), 3));
    dots.setAttribute('aDirection', new Float32BufferAttribute(directions, 3));
    dots.setAttribute('aLength', new Float32BufferAttribute(lengths, 1));
    this.addCloud(dots, count, 101);
    const seeds = dots.getAttribute('aSeed').array as Float32Array;

    // Each ray is a few straight segments, along = 0 at the origin and 1 at the
    // tip, so the fade near the origin follows a curve instead of a straight ramp.
    const perRay = RAY_SEGMENTS * 2;
    const total = count * perRay;
    const lineDirections = new Float32Array(total * 3);
    const lineLengths = new Float32Array(total);
    const lineSeeds = new Float32Array(total);
    const along = new Float32Array(total);
    for (let i = 0; i < count; i++) {
      for (let s = 0; s < RAY_SEGMENTS; s++) {
        for (let e = 0; e < 2; e++) {
          const v = i * perRay + s * 2 + e;
          lineDirections.set(directions.subarray(i * 3, i * 3 + 3), v * 3);
          lineLengths[v] = lengths[i];
          lineSeeds[v] = seeds[i];
          along[v] = (s + e) / RAY_SEGMENTS;
        }
      }
    }
    const lines = new BufferGeometry();
    lines.setAttribute('position', new Float32BufferAttribute(new Float32Array(total * 3), 3));
    lines.setAttribute('aDirection', new Float32BufferAttribute(lineDirections, 3));
    lines.setAttribute('aLength', new Float32BufferAttribute(lineLengths, 1));
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
    (u.uOrigin.value as Vector3).set(p.origin.x, p.origin.y, p.origin.z);
    u.uSway.value = p.sway;
    u.uSwaySpeed.value = p.swaySpeed;
    u.uBreathe.value = p.breathe;
    u.uTwinkle.value = Math.min(Math.max(p.twinkle, 0), 1);
    (u.uDotScale.value as Vector2).set(p.minDotScale, p.maxDotScale);
    u.uLineOpacity.value = p.lineOpacity;
    u.uLineFade.value = p.lineFade;
  }
}
