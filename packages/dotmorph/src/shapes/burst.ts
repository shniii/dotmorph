import { BufferGeometry, Float32BufferAttribute, LineSegments, Points, Vector2, Vector3 } from 'three';
import { Shape, type Vec3Like } from '../core/Shape.js';
import { TipSprings, ViewMirror, drift1, noise2, springSlices, springVelocity } from '../core/hover.js';
import { clamp, createRandom } from '../core/random.js';

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
  /**
   * Reach of the pointer's push, as a share of the canvas: that much of the
   * canvas width to either side and of its height above and below, so on a
   * wide canvas the zone is a wide ellipse. Live.
   */
  hoverReach: number;
  /**
   * How far, in world units, the push would hold a tip right at the pointer,
   * before the falloff and a soft cap. Sets the size of the clearing. Live.
   */
  hoverPush: number;
  /**
   * 0..0.9: how uneven the push is from tip to tip. Every tip's push strength
   * wanders slowly on its own between (1 - hoverBreathe) and
   * (1 + hoverBreathe) times `hoverPush`, so the rim of the clearing is uneven
   * and keeps shifting. 0 pushes every tip the same. Live.
   */
  hoverBreathe: number;
  /** Seconds per swing of the tip springs. Live. */
  hoverPeriod: number;
  /**
   * Damping ratio of a tip while it is pushed at full strength (1 = no
   * overshoot). A tip pushed less blends towards `hoverRelease` in proportion. Live.
   */
  hoverDamping: number;
  /** Damping ratio of a tip nothing pushes (the pointer has left, or the tip is out of reach): the snap-back wobble. Live. */
  hoverRelease: number;
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
  hoverReach: 0.37,
  hoverPush: 1.3,
  hoverBreathe: 0.6,
  hoverPeriod: 0.55,
  hoverDamping: 0.8,
  hoverRelease: 0.3,
};

/** Straight segments per ray. */
const RAY_SEGMENTS = 4;

// Hover: the pointer parts the tips like a springy field. Each tip has a spring
// on the CPU. Closeness is judged on the canvas in shares of its width and
// height (so the zone is a wide ellipse on a wide canvas); the push itself is
// applied in view space, parallel to the screen.
/** Rate of the push's exponential falloff across the reach (higher keeps it to the inner part). */
const HOVER_FALLOFF = 3.8;
/**
 * How much of the canvas's aspect ratio is taken out of the push direction
 * (1 = pushed straight away from the pointer on screen). A little less than 1
 * keeps a slight lean towards vertical, so the clearing is a lens a bit wider
 * than tall.
 */
const HOVER_LEAN = 0.9;
/**
 * Overrun: a tip that lies past the pointer along its own ray (farther from the
 * origin) gets an extra outward push along that ray, this many times its
 * distance past the pointer measured in reaches. Tips level with the pointer
 * or between it and the origin get none, so only the rays reaching past the
 * pointer grow, the farther past the more.
 */
const HOVER_OVERRUN = 1.2;
/**
 * Soft cap on the push, as a multiple of `hoverPush`: stronger pushes level
 * off smoothly. It is also the push at which a tip's damping reaches `hoverDamping`.
 */
const HOVER_SOFT_CAP = 1.25;
/** Seconds between the random levels a tip's push strength drifts through. */
const HOVER_BREATH_STEP = 2.6;
/** Longest frame the springs take in one go, in seconds. */
const HOVER_CAP = 5 / 60;
/**
 * Below this speed (world units per second), and this distance from balance or
 * from rest (world units), the springs count as settled and stop uploading.
 */
const HOVER_REST = 1e-3;
/** With nothing pushed, the pointer must be this many reaches from every tip before the springs sleep. */
const HOVER_WAKE_MARGIN = 1.3;

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
attribute vec2 aHover;

vec3 burstTip() {
  float t = uTime * uSwaySpeed;
  vec3 wobble = vec3(dmNoise(vec2(aSeed * 31.0, t)), 0.35 * dmNoise(vec2(aSeed * 17.0 + 3.0, t)), dmNoise(vec2(aSeed * 13.0 + 7.0, t)));
  vec3 direction = normalize(aDirection + wobble * uSway);
  float length3 = aLength * (1.0 + uBreathe * sin(uTime * 0.8 + aSeed * DM_TAU));
  return uOrigin + direction * length3;
}

// The tip's hover offset (view space, from the CPU springs) in model space.
vec3 burstHover() {
  return uHoverGain > 0.0 ? dmViewToModel(vec3(aHover * uHoverGain, 0.0)) : vec3(0.0);
}
`;

const DOT = /* glsl */ `
vec3 dmShapeDot(out float alpha, out float scale) {
  alpha = 1.0 - uTwinkle * (0.5 + 0.5 * sin(uTime * 1.4 + aSeed * 53.0));
  scale = mix(uDotScale.x, uDotScale.y, fract(aSeed * 13.37));
  return burstTip() + burstHover();
}
`;

const LINE = /* glsl */ `
vec3 dmShapeLine(out float alpha) {
  // Only the tip moves: the ray stays straight and pivots about the origin.
  vec3 tip = burstTip();
  vec3 moved = tip + burstHover();
  // The fade runs by distance from the origin, and a ray pushed shorter dims a
  // little towards its tip, in proportion to how much shorter it got.
  float stretch = length(moved - uOrigin) / max(length(tip - uOrigin), 1e-4);
  alpha = uLineOpacity * smoothstep(0.0, max(uLineFade, 0.001), aAlong * stretch);
  alpha *= 1.0 - (1.0 - min(stretch, 1.0)) * smoothstep(0.3, 1.0, aAlong);
  return mix(uOrigin, moved, aAlong);
}
`;

export class BurstShape extends Shape<BurstParams> {
  readonly name = 'burst' as const;
  protected readonly structuralKeys = ['rays', 'minLength', 'maxLength', 'spread', 'lean', 'seed'] as const;
  protected readonly ownsHover = true;
  private readonly view = new ViewMirror();
  private springs: TipSprings | null = null;
  /** Per tip: resting direction, length and seed; the CPU mirror adds the same sway and breathing as the shader. */
  private directions: Float32Array = new Float32Array(0);
  private lengths: Float32Array = new Float32Array(0);
  private seeds: Float32Array = new Float32Array(0);
  /** Per tip, refreshed each awake frame: its push strength (1 +- hoverBreathe). */
  private strengths = new Float32Array(0);
  /** Per tip, refreshed while awake: tip without hover in view space (x, y, depth) and its ray's direction on screen. */
  private restX = new Float32Array(0);
  private restY = new Float32Array(0);
  private restDepth = new Float32Array(0);
  private rayX = new Float32Array(0);
  private rayY = new Float32Array(0);
  /** False once every tip has settled, so frames skip the springs and uploads. */
  private awake = false;
  /** The engine's reach factor the springs last ran with; a change wakes them. */
  private reachScale = 1;

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

    // Hover springs, one per tip, mirrored onto the dot and every vertex of its ray.
    this.springs = new TipSprings(count);
    this.springs.attach(dots, 1);
    this.springs.attach(lines, perRay);
    this.directions = directions;
    this.lengths = lengths;
    this.seeds = seeds;
    this.strengths = new Float32Array(count);
    this.restX = new Float32Array(count);
    this.restY = new Float32Array(count);
    this.restDepth = new Float32Array(count);
    this.rayX = new Float32Array(count);
    this.rayY = new Float32Array(count);
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
   * Steps every tip's spring. A tip within reach is pushed away from the
   * pointer, plus an outward push along its ray that grows with how far past
   * the pointer the tip lies (none for tips short of it), by a force that falls
   * off exponentially to nothing at the edge of the reach, levels off softly
   * when strong, and drifts per tip on slow noise. Each tip's damping follows
   * how hard it is pushed right now: from `hoverRelease` with no push up to
   * `hoverDamping` at the soft cap. So a held clearing settles calmly, and
   * tips that lose their push (the pointer left or moved on) swing back with a
   * wobble. Each step is implicit, so it stays stable for any period or damping.
   */
  updateHover(time: number, delta: number) {
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
    this.mirrorTips(time);

    const p = this.params;
    const omega = (Math.PI * 2) / Math.max(p.hoverPeriod, 0.05);
    const stiffness = omega * omega;
    const holdDamping = 2 * clamp(p.hoverDamping, 0, 3) * omega;
    const releaseDamping = 2 * clamp(p.hoverRelease, 0, 3) * omega;
    const reach = Math.max(1e-3, p.hoverReach * reachScale);
    const push = Math.max(0, p.hoverPush);
    const softCap = Math.max(push * HOVER_SOFT_CAP, 1e-6);
    const edge = Math.exp(-HOVER_FALLOFF);
    const { scaleX, scaleY } = this.view;
    const lean = Math.pow(scaleY / scaleX, HOVER_LEAN);
    const { inside, x: cx, y: cy } = this.pointer;
    const { offsetX, offsetY, speedX, speedY } = springs;

    const breathe = clamp(p.hoverBreathe, 0, 0.9);
    for (let i = 0; i < springs.count; i++) {
      this.strengths[i] = 1 + breathe * drift1(time / HOVER_BREATH_STEP + this.seeds[i] * 7, Math.imul(i + 1, 0x2c1b3c6d));
    }

    const slices = springSlices(delta, HOVER_CAP);
    const h = Math.min(delta, HOVER_CAP) / slices;
    let pushing = false;
    let closest = Infinity;
    let fastest = 0;
    let farthest = 0;
    /** Largest distance of a tip from where its push would hold it (world units). */
    let strain = 0;
    for (let slice = 0; slice < slices; slice++) {
      const last = slice === slices - 1;
      for (let i = 0; i < springs.count; i++) {
        const depth = this.restDepth[i];
        const ox = offsetX[i];
        const oy = offsetY[i];
        // Where the push would hold the tip (rest, if nothing pushes it).
        let holdX = 0;
        let holdY = 0;
        let damping = releaseDamping;
        if (inside && depth > 1e-3) {
          // Offset from the pointer on the canvas, in NDC (so in shares of width and height, times two).
          const dx = (scaleX * (this.restX[i] + ox)) / depth - cx;
          const dy = (scaleY * (this.restY[i] + oy)) / depth - cy;
          const q = (Math.hypot(dx, dy) * 0.5) / reach;
          if (last && q < closest) closest = q;
          if (q < 1) {
            const falloff = (Math.exp(-HOVER_FALLOFF * q) - edge) / (1 - edge);
            const held = softCap * Math.tanh((push * falloff * this.strengths[i]) / softCap);
            const rayX = this.rayX[i];
            const rayY = this.rayY[i];
            let ux = dx * lean;
            let uy = dy;
            const length = Math.hypot(ux, uy);
            if (length > 1e-9) {
              ux /= length;
              uy /= length;
            } else {
              // Right on the pointer there is no "away"; the tip goes out along its ray.
              ux = rayX;
              uy = rayY;
            }
            // How far past the pointer the tip lies along its ray on the canvas, in reaches (0 if short of it).
            const canvasRayX = scaleX * rayX;
            const canvasRayY = scaleY * rayY;
            const along = (dx * canvasRayX + dy * canvasRayY) / Math.max(Math.hypot(canvasRayX, canvasRayY), 1e-9);
            const overrun = HOVER_OVERRUN * Math.max(0, (along * 0.5) / reach);
            // Where the push would hold the tip, and how hard that is compared with the soft cap.
            holdX = held * (ux + overrun * rayX);
            holdY = held * (uy + overrun * rayY);
            const load = Math.min(1, Math.hypot(holdX, holdY) / softCap);
            damping = releaseDamping + (holdDamping - releaseDamping) * load;
            pushing = true;
          }
        }
        const vx = springVelocity(ox, speedX[i], stiffness * holdX, stiffness, damping, h);
        const vy = springVelocity(oy, speedY[i], stiffness * holdY, stiffness, damping, h);
        const nx = ox + (h * (speedX[i] + vx)) / 2;
        const ny = oy + (h * (speedY[i] + vy)) / 2;
        offsetX[i] = nx;
        offsetY[i] = ny;
        speedX[i] = vx;
        speedY[i] = vy;
        if (last) {
          fastest = Math.max(fastest, Math.abs(vx), Math.abs(vy));
          farthest = Math.max(farthest, Math.abs(nx), Math.abs(ny));
          strain = Math.max(strain, Math.abs(holdX - nx), Math.abs(holdY - ny));
        }
      }
    }
    // A bad param (NaN, Infinity) must not leave the burst broken for good.
    if (!Number.isFinite(fastest) || !Number.isFinite(farthest) || !Number.isFinite(strain)) {
      springs.reset();
      this.awake = false;
      return;
    }
    if (!pushing && fastest < HOVER_REST && farthest < HOVER_REST) {
      // Back at rest: zero the offsets (a no-op, uploads included, once they are).
      springs.reset();
      // Sleep, unless the pointer is close enough to reach a tip soon: then keep watching.
      if (!inside || closest > HOVER_WAKE_MARGIN) this.awake = false;
      return;
    }
    springs.upload();
    // A held clearing with nothing moving underneath it (no sway, breathing or
    // drifting push) is settled once every tip is still and where its push
    // holds it: keep it and sleep until something changes. A turning point is
    // still too, but off balance, so it keeps going.
    const still = breathe === 0 && p.sway === 0 && p.breathe === 0;
    if (pushing && still && fastest < HOVER_REST && strain < HOVER_REST) this.awake = false;
  }

  /** Tips as the shader draws them before hover (sway and breathing included) in view space, and each ray's direction on screen. */
  private mirrorTips(time: number) {
    const e = this.view.modelView.elements;
    const p = this.params;
    const o = p.origin;
    const originX = e[0] * o.x + e[4] * o.y + e[8] * o.z + e[12];
    const originY = e[1] * o.x + e[5] * o.y + e[9] * o.z + e[13];
    // Same float32 inputs as the shader's burstTip(), so the noise lands on the same cells.
    const t = Math.fround(Math.fround(time) * Math.fround(p.swaySpeed));
    const sway = p.sway;
    for (let i = 0; i < this.lengths.length; i++) {
      const seed = this.seeds[i];
      const wobbleX = noise2(Math.fround(seed * 31), t);
      const wobbleY = 0.35 * noise2(Math.fround(Math.fround(seed * 17) + 3), t);
      const wobbleZ = noise2(Math.fround(Math.fround(seed * 13) + 7), t);
      let dx = this.directions[i * 3] + wobbleX * sway;
      let dy = this.directions[i * 3 + 1] + wobbleY * sway;
      let dz = this.directions[i * 3 + 2] + wobbleZ * sway;
      const norm = Math.hypot(dx, dy, dz) || 1;
      const length = (this.lengths[i] * (1 + p.breathe * Math.sin(time * 0.8 + seed * Math.PI * 2))) / norm;
      dx *= length;
      dy *= length;
      dz *= length;
      const x = o.x + dx;
      const y = o.y + dy;
      const z = o.z + dz;
      const vx = e[0] * x + e[4] * y + e[8] * z + e[12];
      const vy = e[1] * x + e[5] * y + e[9] * z + e[13];
      this.restX[i] = vx;
      this.restY[i] = vy;
      this.restDepth[i] = -(e[2] * x + e[6] * y + e[10] * z + e[14]);
      const rx = vx - originX;
      const ry = vy - originY;
      const inv = 1 / Math.max(Math.hypot(rx, ry), 1e-6);
      this.rayX[i] = rx * inv;
      this.rayY[i] = ry * inv;
    }
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
    // The origin may have moved; let the springs look again.
    this.awake = true;
  }
}
