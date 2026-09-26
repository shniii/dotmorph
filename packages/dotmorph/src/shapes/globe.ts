import { BufferGeometry, Euler, Float32BufferAttribute, LineSegments, Matrix3, Matrix4, Points, Vector2, Vector3 } from 'three';
import { Shape, type Vec3Like } from '../core/Shape';
import { clamp, createRandom } from '../core/random';

/**
 * Parameters of the globe: a large tilted sphere sitting low in the frame,
 * drawn only with meridian arcs that grow from a start point, then retract
 * into their end, each led by a dot at its moving head.
 */
export interface GlobeParams {
  /** Number of meridian arcs (and head dots), evenly spread in longitude. Structural. */
  arcs: number;
  /** Line segments per arc; more gives smoother curves. Structural. */
  segments: number;
  /** 0..1: random longitude offset of each arc, as a fraction of the gap between neighbours. Structural. */
  jitter: number;
  /** Seed for every per-arc pick (longitude jitter, start, span, period, phase, direction). Structural. */
  seed: number;
  /** Radius of the sphere in world units. Live. */
  radius: number;
  /** Centre of the sphere in world units (below the frame, so only the upper part shows). Live. */
  center: Vec3Like;
  /** Tilt of the globe's axis in degrees around x, y and z (applied in that order, after the spin). Live. */
  tilt: Vec3Like;
  /** Turn speed about the globe's own axis, in radians per second. Live. */
  spin: number;
  /** Colatitude kept clear around the north pole, in degrees, so arcs don't pile up there. Live. */
  poleGap: number;
  /** Colatitude where arcs stop, in degrees (90 = the equator, 180 = the south pole). Live. */
  reach: number;
  /** Shortest arc, as a fraction of the band between `poleGap` and `reach`. Live. */
  minSpan: number;
  /** Longest arc, as a fraction of the band between `poleGap` and `reach`. Live. */
  maxSpan: number;
  /** Shortest life cycle of an arc (grow, then retract), in seconds. Live. */
  minPeriod: number;
  /** Longest life cycle of an arc, in seconds. Live. */
  maxPeriod: number;
  /** 0.05..0.95: fraction of each life the head spends growing; the tail follows during the rest. Live. */
  grow: number;
  /** 0..1: share of arcs whose head runs towards the north pole instead of away from it. Live. */
  reverse: number;
  /** Length of the soft fade behind the tail, as a fraction of the arc. Live. */
  tailFade: number;
  /** Opacity of the arcs on the side of the globe facing the viewer. Live. */
  lineOpacity: number;
  /** 0..1: opacity multiplier for arcs and dots on the far side of the globe. Live. */
  backOpacity: number;
  /** Size of the head dots, relative to the engine's dot size. Live. */
  dotScale: number;
}

export const GLOBE_DEFAULTS: GlobeParams = {
  arcs: 220,
  segments: 40,
  jitter: 0.6,
  seed: 5,
  radius: 5.2,
  center: { x: 0.5, y: -3.3, z: -2.6 },
  tilt: { x: 15, y: 0, z: -15 },
  spin: 0.05,
  poleGap: 7,
  reach: 118,
  minSpan: 0.25,
  maxSpan: 0.6,
  minPeriod: 8,
  maxPeriod: 13,
  grow: 0.5,
  reverse: 0.5,
  tailFade: 0.45,
  lineOpacity: 0.5,
  backOpacity: 0.14,
  dotScale: 0.85,
};

const DEG = Math.PI / 180;

/** Per-arc attributes, each a single float shared by the arc's dot and every vertex of its line. */
const ARC_ATTRIBUTES = ['aLon', 'aStart', 'aSpan', 'aPeriod', 'aOffset', 'aFlow'] as const;

const DECLARATIONS = /* glsl */ `
uniform vec3 uCenter;
uniform float uRadius;
uniform mat3 uTilt;
uniform float uSpin;
uniform vec2 uBand;
uniform vec2 uSpan;
uniform vec2 uPeriod;
uniform float uGrow;
uniform float uReverse;
uniform float uTailFade;
uniform float uLineOpacity;
uniform float uBackOpacity;
uniform float uDotScale;
attribute float aLon;
attribute float aStart;
attribute float aSpan;
attribute float aPeriod;
attribute float aOffset;
attribute float aFlow;

// 0..1 through this arc's current life cycle.
float globeLife() {
  float period = max(mix(uPeriod.x, uPeriod.y, aPeriod), 0.1);
  return fract(uTime / period + aOffset);
}

// x: head, y: tail, both as arc parameter (0 = where the arc starts, 1 = where it ends).
// The head eases out to the end first, then the tail eases after it.
vec2 globeHeadTail(float life) {
  return vec2(dmSmoother(life / uGrow), dmSmoother((life - uGrow) / (1.0 - uGrow)));
}

// Unit vector from the centre to arc parameter u: spherical coordinates, spin, then tilt.
vec3 globeNormal(float u) {
  float span = mix(uSpan.x, uSpan.y, aSpan);
  float low = aStart * (1.0 - span);
  float k = aFlow < uReverse ? 1.0 - u : u;
  float colat = mix(uBand.x, uBand.y, low + k * span);
  float lon = aLon + uTime * uSpin;
  float s = sin(colat);
  return uTilt * vec3(s * cos(lon), cos(colat), s * sin(lon));
}

// 1 on the half of the sphere facing the camera, 0 on the far half, soft across the rim.
float globeFront(vec3 dir, vec3 point) {
  vec3 world = (modelMatrix * vec4(point, 1.0)).xyz;
  vec3 n = normalize((modelMatrix * vec4(dir, 0.0)).xyz);
  return smoothstep(-0.12, 0.12, dot(n, normalize(cameraPosition - world)));
}
`;

const DOT = /* glsl */ `
vec3 dmShapeDot(out float alpha, out float scale) {
  float life = globeLife();
  vec3 dir = globeNormal(globeHeadTail(life).x);
  vec3 point = uCenter + dir * uRadius;
  float front = globeFront(dir, point);
  // Depth only applies once the dot has landed, so the cloud stays bright.
  float landed = dmProgress(uPresence, aSeed);
  // Ease in as the arc is born and out as the tail catches up, so dots never pop.
  float envelope = smoothstep(0.0, 0.08, life) * (1.0 - smoothstep(0.8, 1.0, life));
  alpha = envelope * mix(1.0, mix(uBackOpacity, 1.0, front), landed);
  scale = uDotScale * envelope * mix(0.8, 1.0, fract(aSeed * 7.31)) * mix(1.0, mix(0.7, 1.0, front), landed);
  return point;
}
`;

const LINE = /* glsl */ `
vec3 dmShapeLine(out float alpha) {
  vec2 headTail = globeHeadTail(globeLife());
  // The line's vertices always span the visible piece, from the tail (aAlong 0) to the head (aAlong 1).
  float u = mix(headTail.y, headTail.x, aAlong);
  vec3 dir = globeNormal(u);
  vec3 point = uCenter + dir * uRadius;
  float fade = smoothstep(0.0, uTailFade, u - headTail.y);
  alpha = uLineOpacity * fade * mix(uBackOpacity, 1.0, globeFront(dir, point));
  return point;
}
`;

export class GlobeShape extends Shape<GlobeParams> {
  readonly name = 'globe' as const;
  protected readonly structuralKeys = ['arcs', 'segments', 'jitter', 'seed'] as const;
  private readonly euler = new Euler();
  private readonly rotation = new Matrix4();

  constructor(params?: Partial<GlobeParams>) {
    super(GLOBE_DEFAULTS, params);
    Object.assign(this.local, {
      uCenter: { value: new Vector3() },
      uRadius: { value: 1 },
      uTilt: { value: new Matrix3() },
      uSpin: { value: 0 },
      uBand: { value: new Vector2() },
      uSpan: { value: new Vector2() },
      uPeriod: { value: new Vector2(1, 1) },
      uGrow: { value: 0.5 },
      uReverse: { value: 0 },
      uTailFade: { value: 0.001 },
      uLineOpacity: { value: 0 },
      uBackOpacity: { value: 0 },
      uDotScale: { value: 1 },
    });
  }

  protected build() {
    const p = this.params;
    const count = Math.max(1, Math.round(p.arcs));
    const segments = Math.max(1, Math.round(p.segments));
    const jitter = clamp(p.jitter, 0, 1);
    const rng = createRandom(p.seed * 2741 + 53);

    // Evenly spaced longitudes nudged by a seeded jitter; every other pick is a
    // 0..1 value that the shader maps through the live ranges (span, period, ...).
    const step = (Math.PI * 2) / count;
    const arc: Record<(typeof ARC_ATTRIBUTES)[number], Float32Array> = {
      aLon: new Float32Array(count),
      aStart: new Float32Array(count),
      aSpan: new Float32Array(count),
      aPeriod: new Float32Array(count),
      aOffset: new Float32Array(count),
      aFlow: new Float32Array(count),
    };
    for (let i = 0; i < count; i++) {
      arc.aLon[i] = (i + rng.range(-0.5, 0.5) * jitter) * step;
      arc.aStart[i] = rng.next();
      arc.aSpan[i] = rng.next();
      arc.aPeriod[i] = rng.next();
      arc.aOffset[i] = rng.next();
      arc.aFlow[i] = rng.next();
    }

    // One dot per arc, riding its head.
    const dots = new BufferGeometry();
    dots.setAttribute('position', new Float32BufferAttribute(new Float32Array(count * 3), 3));
    for (const key of ARC_ATTRIBUTES) dots.setAttribute(key, new Float32BufferAttribute(arc[key], 1));
    this.addCloud(dots, count, 211);
    const seeds = dots.getAttribute('aSeed').array as Float32Array;

    // Each arc is `segments` separate pairs of vertices along aAlong 0..1.
    const perArc = segments * 2;
    const total = count * perArc;
    const along = new Float32Array(total);
    const lineSeeds = new Float32Array(total);
    const lineArc = {} as Record<(typeof ARC_ATTRIBUTES)[number], Float32Array>;
    for (const key of ARC_ATTRIBUTES) lineArc[key] = new Float32Array(total);
    for (let i = 0; i < count; i++) {
      for (let s = 0; s < segments; s++) {
        for (let e = 0; e < 2; e++) {
          const v = i * perArc + s * 2 + e;
          along[v] = (s + e) / segments;
          lineSeeds[v] = seeds[i];
          for (const key of ARC_ATTRIBUTES) lineArc[key][v] = arc[key][i];
        }
      }
    }
    const lines = new BufferGeometry();
    lines.setAttribute('position', new Float32BufferAttribute(new Float32Array(total * 3), 3));
    lines.setAttribute('aAlong', new Float32BufferAttribute(along, 1));
    lines.setAttribute('aSeed', new Float32BufferAttribute(lineSeeds, 1));
    for (const key of ARC_ATTRIBUTES) lines.setAttribute(key, new Float32BufferAttribute(lineArc[key], 1));

    const lineMesh = new LineSegments(lines, this.lineMaterial(DECLARATIONS, LINE));
    const dotMesh = new Points(dots, this.dotMaterial(DECLARATIONS, DOT));
    for (const mesh of [lineMesh, dotMesh]) mesh.frustumCulled = false;
    this.group.add(lineMesh, dotMesh);
  }

  protected syncUniforms() {
    const p = this.params;
    const u = this.local;
    (u.uCenter.value as Vector3).set(p.center.x, p.center.y, p.center.z);
    u.uRadius.value = Math.max(0.01, p.radius);
    this.euler.set(p.tilt.x * DEG, p.tilt.y * DEG, p.tilt.z * DEG, 'XYZ');
    (u.uTilt.value as Matrix3).setFromMatrix4(this.rotation.makeRotationFromEuler(this.euler));
    u.uSpin.value = p.spin;
    const gap = clamp(p.poleGap, 0, 179);
    const reach = clamp(p.reach, gap + 1, 180);
    (u.uBand.value as Vector2).set(gap * DEG, reach * DEG);
    (u.uSpan.value as Vector2).set(clamp(p.minSpan, 0.01, 1), clamp(p.maxSpan, 0.01, 1));
    (u.uPeriod.value as Vector2).set(Math.max(0.5, p.minPeriod), Math.max(0.5, p.maxPeriod));
    u.uGrow.value = clamp(p.grow, 0.05, 0.95);
    u.uReverse.value = clamp(p.reverse, 0, 1);
    u.uTailFade.value = Math.max(0.001, p.tailFade);
    u.uLineOpacity.value = p.lineOpacity;
    u.uBackOpacity.value = clamp(p.backOpacity, 0, 1);
    u.uDotScale.value = Math.max(0, p.dotScale);
  }
}
