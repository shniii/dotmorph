import { DynamicDrawUsage, Float32BufferAttribute, Matrix4, Vector3, type BufferGeometry, type Camera, type IUniform, type Object3D } from 'three';

/**
 * Hover building blocks for the built-in shapes. There are two families:
 *
 * - Parting (burst, wave): the pointer pushes tips aside against springs. The
 *   clearing holds while the pointer rests and bounces back when it goes. Each
 *   tip keeps a view-space offset and velocity on the CPU (`TipSprings`), fed
 *   to the shaders as a dynamic `aHover` attribute.
 * - Stirring (globe, fan): moving the pointer swirls nearby points around it.
 *   It only reacts to movement and fades by itself. `HoverSwirl` keeps a
 *   smoothed centre and an energy level; both shapes' shaders work the swirl
 *   out from those with `dmSwirl`, on the canvas around the centre.
 */

/**
 * Energy a stirring shape gains per second of continuous pointer movement.
 * With the drain running at the same time, about a fifth of a second of
 * movement fills it (the first move counts as `SWIRL_CHARGE_GAP`).
 */
const SWIRL_CHARGE_RATE = 4.5;
/**
 * Longest stretch of time, in seconds, one pointer move can be credited with.
 * A move after a pause (or the first one) counts as this much movement.
 */
const SWIRL_CHARGE_GAP = 0.04;
/** Time constant, in seconds, of the energy draining away (a half-life of about 0.7 s). */
const SWIRL_FADE = 1;
/**
 * Natural frequency (rad/s) of the swirl centre, which follows the pointer as a
 * critically damped spring: no overshoot, trailing a steady sweep by 2 / 9 s
 * (about 0.22 s).
 */
const SWIRL_FOLLOW = 9;
/** Energy below this counts as none. */
const SWIRL_EMPTY = 1e-3;

/**
 * Spring slice length, in seconds: every frame is cut into steps no longer than
 * this, so springs feel the same at 60, 120 or 144 Hz.
 */
const SPRING_SLICE = 1 / 120;

/**
 * Splits a frame into spring steps: the frame is capped at `cap` seconds (so a
 * hitch never makes tips jump; the engine already bounds every frame, so the
 * default adds no cap of its own) and cut into slices no longer than
 * `SPRING_SLICE`. Returns the slice count; the slice length is
 * `min(delta, cap) / count`.
 */
export function springSlices(delta: number, cap = Infinity): number {
  return Math.max(1, Math.ceil(Math.min(delta, cap) / SPRING_SLICE - 1e-6));
}

/**
 * One implicit-midpoint step of a damped spring along one axis:
 * x'' = force - stiffness * x - damping * x'. The spring and damping terms are
 * implicit, so the step stays stable for any stiffness, damping or slice
 * length without adding damping of its own; `force` is taken as constant over
 * the slice. Returns the new velocity; the new position is
 * `x + h * (v + returned) / 2`.
 */
export function springVelocity(x: number, v: number, force: number, stiffness: number, damping: number, h: number): number {
  const implicit = h * (h * stiffness * 0.25 + damping * 0.5);
  return (v * (1 - implicit) + h * (force - stiffness * x)) / (1 + implicit);
}

/**
 * State of a stirring shape: the swirl centre (following the pointer) and the
 * energy (charged by time spent moving the pointer, draining exponentially).
 * Both are written into `uniform` as (centre x, centre y, energy), which the
 * shape's materials share by reference.
 */
export class HoverSwirl {
  readonly uniform: IUniform<Vector3> = { value: new Vector3() };
  private targetX = 0;
  private targetY = 0;
  private speedX = 0;
  private speedY = 0;
  /** `performance.now()` of the last live move, or -Infinity. */
  private lastMove = -Infinity;

  get energy(): number {
    return this.uniform.value.z;
  }

  /**
   * The pointer moved. Only a live move (the shape animating and listening)
   * charges the energy; otherwise just the target is kept, so moves made while
   * paused never come back as a swirl. Energy grows with how long the pointer
   * keeps moving, whatever the event rate: each move is credited with the time
   * since the previous one, up to `SWIRL_CHARGE_GAP`.
   */
  move(x: number, y: number, live: boolean, now: number = performance.now()) {
    this.targetX = x;
    this.targetY = y;
    const state = this.uniform.value;
    // With no energy left the centre is invisible; put it on the pointer rather than sweep across.
    if (state.z < 0.01) {
      state.x = x;
      state.y = y;
      this.speedX = 0;
      this.speedY = 0;
    }
    if (!live) return;
    const credit = Math.min(Math.max((now - this.lastMove) / 1000, 0), SWIRL_CHARGE_GAP);
    this.lastMove = now;
    state.z = Math.min(1, state.z + SWIRL_CHARGE_RATE * credit);
  }

  /** Move the centre and drain the energy. Returns whether any energy is left. */
  step(delta: number): boolean {
    const state = this.uniform.value;
    if (state.z <= 0) return false;
    // The engine already bounds `delta`, so the frame is only sliced, not capped again.
    const slices = springSlices(delta);
    const h = Math.max(delta, 0) / slices;
    const stiffness = SWIRL_FOLLOW * SWIRL_FOLLOW;
    const damping = 2 * SWIRL_FOLLOW;
    for (let i = 0; i < slices; i++) {
      const offX = state.x - this.targetX;
      const offY = state.y - this.targetY;
      const vx = springVelocity(offX, this.speedX, 0, stiffness, damping, h);
      const vy = springVelocity(offY, this.speedY, 0, stiffness, damping, h);
      state.x += (h * (this.speedX + vx)) / 2;
      state.y += (h * (this.speedY + vy)) / 2;
      this.speedX = vx;
      this.speedY = vy;
    }
    state.z *= Math.exp(-delta / SWIRL_FADE);
    if (state.z < SWIRL_EMPTY) state.z = 0;
    return state.z > 0;
  }

  reset() {
    this.uniform.value.z = 0;
    this.speedX = 0;
    this.speedY = 0;
    this.lastMove = -Infinity;
  }
}

/**
 * Keeps a shape's model-view matrix and projection scale for its CPU mirror,
 * and says when they changed (a resize, or the group being moved).
 */
export class ViewMirror {
  readonly modelView = new Matrix4();
  /** Projection scale on x and y: NDC = scale * view / depth. */
  scaleX = 1;
  scaleY = 1;
  private readonly next = new Matrix4();

  /** Refresh from the camera. Returns true when anything changed since the last call. */
  sync(camera: Camera, object: Object3D): boolean {
    this.next.multiplyMatrices(camera.matrixWorldInverse, object.matrixWorld);
    const projection = camera.projectionMatrix.elements;
    if (this.next.equals(this.modelView) && projection[0] === this.scaleX && projection[5] === this.scaleY) return false;
    this.modelView.copy(this.next);
    this.scaleX = projection[0];
    this.scaleY = projection[5];
    return true;
  }
}

/**
 * One view-space offset (x, y, world units) per tip, fed to the shaders.
 * `attach` adds a dynamic `aHover` attribute to a geometry, repeating each
 * tip's offset over the vertices that belong to it; `upload` refreshes them all.
 */
export class TipOffsets {
  readonly count: number;
  readonly offsetX: Float32Array;
  readonly offsetY: Float32Array;
  private readonly targets: { attribute: Float32BufferAttribute; perTip: number }[] = [];
  /** True while the uploaded offsets are all zero, so `reset()` has nothing to upload. */
  private atRest = true;

  constructor(count: number) {
    this.count = count;
    this.offsetX = new Float32Array(count);
    this.offsetY = new Float32Array(count);
  }

  /** Adds `aHover` to `geometry`, with `perTip` consecutive vertices per tip. */
  attach(geometry: BufferGeometry, perTip: number) {
    const attribute = new Float32BufferAttribute(new Float32Array(this.count * perTip * 2), 2);
    attribute.setUsage(DynamicDrawUsage);
    geometry.setAttribute('aHover', attribute);
    this.targets.push({ attribute, perTip });
  }

  upload() {
    for (const { attribute, perTip } of this.targets) {
      const out = attribute.array as Float32Array;
      for (let i = 0, v = 0; i < this.count; i++) {
        const x = this.offsetX[i];
        const y = this.offsetY[i];
        for (let e = 0; e < perTip; e++, v += 2) {
          out[v] = x;
          out[v + 1] = y;
        }
      }
      attribute.needsUpdate = true;
    }
    this.atRest = false;
  }

  /** Back to rest, at once. Uploads only if the GPU still holds offsets other than zero. */
  reset() {
    this.offsetX.fill(0);
    this.offsetY.fill(0);
    if (this.atRest) return;
    this.upload();
    this.atRest = true;
  }
}

/** Spring memory for a parting shape: `TipOffsets` plus a velocity per tip. */
export class TipSprings extends TipOffsets {
  readonly speedX: Float32Array;
  readonly speedY: Float32Array;

  constructor(count: number) {
    super(count);
    this.speedX = new Float32Array(count);
    this.speedY = new Float32Array(count);
  }

  reset() {
    this.speedX.fill(0);
    this.speedY.fill(0);
    super.reset();
  }
}

// GPU-matching noise, so a CPU mirror can follow motion the shaders add on
// their own. Same bit mixer and value noise as `dmMix` / `dmHash2` / `dmNoise`.
const floatView = new Float32Array(1);
const bitsView = new Uint32Array(floatView.buffer);

function floatBits(value: number): number {
  floatView[0] = value;
  return bitsView[0];
}

/** `dmMix` on the CPU ("lowbias32" by Chris Wellons, public domain). */
export function mix32(x: number): number {
  x = (x ^ (x >>> 16)) >>> 0;
  x = Math.imul(x, 0x7feb352d) >>> 0;
  x = (x ^ (x >>> 15)) >>> 0;
  x = Math.imul(x, 0x846ca68b) >>> 0;
  return (x ^ (x >>> 16)) >>> 0;
}

function hash2(x: number, y: number): number {
  return mix32((floatBits(x) ^ mix32((floatBits(y) + 0x9e37) >>> 0)) >>> 0) / 4294967295;
}

/** `dmNoise` on the CPU: value noise in -1..1. Pass float32 inputs (`Math.fround`) to match the GPU. */
export function noise2(px: number, py: number): number {
  const cx = Math.floor(px);
  const cy = Math.floor(py);
  const fx = Math.fround(px - cx);
  const fy = Math.fround(py - cy);
  const wx = fx * fx * (3 - 2 * fx);
  const wy = fy * fy * (3 - 2 * fy);
  const a = hash2(cx, cy);
  const b = hash2(cx + 1, cy);
  const c = hash2(cx, cy + 1);
  const d = hash2(cx + 1, cy + 1);
  const bottom = a + (b - a) * wx;
  const top = c + (d - c) * wx;
  return (bottom + (top - bottom) * wy) * 2 - 1;
}

/** Smooth 1D value noise in -1..1 for slow per-tip drifts (CPU only). */
export function drift1(x: number, salt: number): number {
  const cell = Math.floor(x);
  const f = x - cell;
  const w = f * f * (3 - 2 * f);
  const a = mix32(((cell | 0) ^ salt) >>> 0) / 4294967295;
  const b = mix32((((cell + 1) | 0) ^ salt) >>> 0) / 4294967295;
  return (a + (b - a) * w) * 2 - 1;
}
