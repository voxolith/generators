// The branch skeleton: continuous polylines with radii, grown before any voxel
// is touched.
//
// Three rules do most of the work. Children start on the parent's axis, so the
// first voxel a child writes is already inside solid parent wood and the tree
// stays one connected piece. Child radius follows the pipe model, so a fork
// conserves visual mass instead of looking like pins stuck into a pole. And
// the direction wobble is coherent noise sampled in space, not per-step random
// numbers, which is the difference between character and a wiggly noodle.

import { add, frame, normalize, scale, smoothstep, type Noise } from "@voxolith/engine/build";
import type { Vec3 } from "@voxolith/engine";
import type { ShapeParams } from "./params";
import { REFERENCE_HEIGHT } from "./params";

export interface Stem {
  id: number;
  level: number;
  parent: number;
  points: Vec3[];
  radii: number[];
  /** Arc length from the stem base at each point. */
  arc: number[];
  length: number;
}

export interface Segment {
  stem: number;
  level: number;
  a: Vec3;
  b: Vec3;
  ra: number;
  rb: number;
  /** Arc length at `a`, measured along the stem from its base. */
  u: number;
}

export interface Tip {
  p: Vec3;
  dir: Vec3;
  level: number;
  stem: number;
}

export interface Skeleton {
  stems: Stem[];
  segments: Segment[];
  tips: Tip[];
  /** Highest point reached by wood. */
  topY: number;
  /** Largest horizontal distance from the trunk axis. */
  spread: number;
  /** Conifer whorl plane heights. */
  whorlY: number[];
}

const GOLDEN = 2.399963229728653; // radians, 137.507°
const MAX_STEMS = 20000;
const MAX_SEGMENTS = 60000;

interface Task {
  origin: Vec3;
  dir: Vec3;
  len: number;
  r0: number;
  level: number;
  parent: number;
}

export function growSkeleton(shape: ShapeParams, rng: () => number, noise: Noise): Skeleton {
  const vs = shape.height / REFERENCE_HEIGHT; // voxel-space params are tuned at 192
  const stems: Stem[] = [];
  const segments: Segment[] = [];
  const tips: Tip[] = [];
  const whorlY: number[] = [];
  let azCounter = 0;

  const deg = (d: number) => (d * Math.PI) / 180;
  const jitter = (amount: number) => (rng() * 2 - 1) * amount;

  // Trunk: a small random lean, plus a constant lateral sweep in another
  // direction, so the bole leans and curves rather than wiggling.
  const leanAz = rng() * Math.PI * 2;
  const lean = deg(shape.trunk.leanDeg) * rng();
  const trunkDir: Vec3 = normalize([
    Math.sin(lean) * Math.cos(leanAz),
    Math.cos(lean),
    Math.sin(lean) * Math.sin(leanAz),
  ]);
  const sweepAz = rng() * Math.PI * 2;
  const sweepAxis: Vec3 = [Math.cos(sweepAz), 0, Math.sin(sweepAz)];

  const queue: Task[] = [
    {
      origin: [0, 0, 0],
      dir: trunkDir,
      len: shape.height * shape.trunk.lengthRatio,
      r0: shape.height * shape.trunk.radiusRatio,
      level: 0,
      parent: -1,
    },
  ];

  while (queue.length > 0 && stems.length < MAX_STEMS && segments.length < MAX_SEGMENTS) {
    const task = queue.shift()!;
    const lv = task.level === 0 ? null : shape.levels[Math.min(task.level - 1, shape.levels.length - 1)];
    const segLen = (task.level === 0 ? shape.trunk.segLen : lv!.segLen) * vs;
    const n = Math.max(2, Math.round(task.len / Math.max(0.5, segLen)));
    const step = task.len / n;
    const taper = task.level === 0 ? shape.trunk.taperExp : shape.branchTaper;
    const gravity = task.level === 0 ? 0 : lv!.gravity;
    const photo = task.level === 0 ? 0.002 : lv!.photo;
    const curl = task.level === 0 ? shape.trunk.curl : lv!.curl;
    const sweepRate = task.level === 0 ? deg(shape.trunk.sweepDeg) / Math.max(1, task.len) : 0;

    const radiusAt = (t: number): number =>
      Math.max(shape.minRadius, task.r0 * Math.pow(Math.max(0, 1 - t), taper));

    // Decide where children attach before marching, so the walk stays simple.
    const children: { t: number; az: number }[] = [];
    const canBranch = task.level < shape.levels.length;
    if (canBranch) {
      const start = task.level === 0 ? shape.crownStartRatio : 0.25;
      const end = task.level === 0 ? shape.crownEndRatio : 0.95;
      if (shape.whorl > 0 && task.level === 0) {
        // Conifer: whorls of several branches at fixed intervals up the leader.
        const spacing = Math.max(2, shape.height * shape.whorlSpacingRatio);
        for (let u = start * task.len; u < end * task.len; u += spacing) {
          const t = u / task.len;
          const base = GOLDEN * whorlY.length;
          whorlY.push(u);
          for (let k = 0; k < shape.whorl; k++) {
            children.push({ t, az: base + (k / shape.whorl) * Math.PI * 2 + jitter(deg(shape.azimuthJitterDeg)) });
          }
        }
      } else {
        const next = shape.levels[Math.min(task.level, shape.levels.length - 1)];
        const count = Math.round(next.count[0] + rng() * (next.count[1] - next.count[0]));
        for (let k = 0; k < count; k++) {
          const t = start + ((end - start) * (k + 0.5 + jitter(0.35))) / count;
          children.push({
            t: Math.max(0.05, Math.min(0.98, t)),
            az: GOLDEN * azCounter++ + jitter(deg(shape.azimuthJitterDeg)),
          });
        }
      }
      children.sort((a, b) => a.t - b.t);
    }

    const id = stems.length;
    const points: Vec3[] = [task.origin];
    const radii: number[] = [task.r0];
    const arc: number[] = [0];
    let dir = task.dir;
    let p = task.origin;
    let u = 0;
    let nextChild = 0;

    for (let i = 1; i <= n; i++) {
      const t = i / n;
      const r = radiusAt((i - 0.5) / n);

      // Thin branches droop, tips reach for the light, and a coherent wobble
      // sampled in space gives the stem character without turning it to noodle.
      // Thin branches droop more, but the ratio is capped: uncapped, the tip of
      // every limb nosedives once its radius falls below a voxel.
      const rFactor = Math.min(1.5, Math.pow(1.2 / Math.max(r, 0.6), 0.8));
      const sag = gravity * step * rFactor;
      const lift = photo * step * smoothstep(0.35, 1, t);
      // The wobble is coherent, so its per-step nudge accumulates along the whole
      // stem. Without this scale a curl of 0.03 bends a limb by more than 90°.
      const w = curl * step * 0.12;
      const wob: Vec3 = [
        noise.signed3(p[0] * 0.05, p[1] * 0.05, p[2] * 0.05, 1),
        noise.signed3(p[0] * 0.05, p[1] * 0.05, p[2] * 0.05, 2) * 0.4,
        noise.signed3(p[0] * 0.05, p[1] * 0.05, p[2] * 0.05, 3),
      ];
      dir = normalize([
        dir[0] + wob[0] * w + sweepAxis[0] * sweepRate * step,
        dir[1] - sag + lift + wob[1] * w,
        dir[2] + wob[2] * w + sweepAxis[2] * sweepRate * step,
      ]);

      const prev = p;
      p = add(p, scale(dir, step));
      u += step;
      points.push(p);
      radii.push(radiusAt(t));
      arc.push(u);
      segments.push({ stem: id, level: task.level, a: prev, b: p, ra: radii[i - 1], rb: radii[i], u: arc[i - 1] });

      // Spawn any children whose attachment point we just passed. They start on
      // the parent axis, which is what guarantees connectivity.
      while (canBranch && nextChild < children.length && children[nextChild].t <= t) {
        const c = children[nextChild++];
        const nextLv = shape.levels[Math.min(task.level, shape.levels.length - 1)];
        const childLen = task.len * nextLv.lenRatio * envelopeAt(shape, c.t) * (1 + jitter(nextLv.lenVar));
        const rHere = radiusAt(c.t);
        if (rHere <= shape.minRadius * 1.05) continue; // the parent is already a twig
        const childR = Math.max(
          shape.minRadius,
          Math.min(rHere * 0.9, rHere * Math.pow(Math.max(0.05, childLen / task.len), 1 / shape.pipeExp)),
        );
        if (childLen < 1.5 * segLen) continue;
        const [f, s, up2] = frame(dir);
        const down = deg(nextLv.downDeg + jitter(nextLv.downVarDeg));
        const lat: Vec3 = [
          s[0] * Math.cos(c.az) + up2[0] * Math.sin(c.az),
          s[1] * Math.cos(c.az) + up2[1] * Math.sin(c.az),
          s[2] * Math.cos(c.az) + up2[2] * Math.sin(c.az),
        ];
        const cdir = normalize([
          f[0] * Math.cos(down) + lat[0] * Math.sin(down),
          f[1] * Math.cos(down) + lat[1] * Math.sin(down),
          f[2] * Math.cos(down) + lat[2] * Math.sin(down),
        ]);
        queue.push({ origin: p, dir: cdir, len: childLen, r0: childR, level: task.level + 1, parent: id });
      }
    }

    stems.push({ id, level: task.level, parent: task.parent, points, radii, arc, length: task.len });
    if (task.level >= shape.levels.length - (shape.kind === "conifer" ? 0 : 1)) {
      tips.push({ p, dir, level: task.level, stem: id });
    }
  }

  let topY = 0;
  let spread = 0;
  for (const s of stems)
    for (const pt of s.points) {
      if (pt[1] > topY) topY = pt[1];
      const d = Math.hypot(pt[0], pt[2]);
      if (d > spread) spread = d;
    }

  return { stems, segments, tips, topY, spread, whorlY };
}

/** Crown profile: where along the parent the longest children sit. */
function envelopeAt(shape: ShapeParams, t: number): number {
  if (shape.envelope === "taper") return Math.pow(Math.max(0.06, 1 - t * 0.92), 0.85);
  return 1 - (0.55 * Math.abs(t - 0.45)) / 0.55;
}

/**
 * Uniformly scale the skeleton so its top sits at `targetTop`. Growth is
 * open-ended, so this is what turns `height` into an exact knob.
 */
export function fitHeight(skel: Skeleton, targetTop: number): number {
  if (skel.topY <= 0) return 1;
  const s = targetTop / skel.topY;
  if (Math.abs(s - 1) < 1e-3) return 1;
  // Points are shared: a child's first point is the very point on its parent
  // where it attached, and segments and tips alias the stem polylines. Scaling
  // by identity keeps every point scaled exactly once.
  const scaled = new Set<Vec3>();
  const scalePoint = (p: Vec3) => {
    if (scaled.has(p)) return;
    scaled.add(p);
    p[0] *= s;
    p[1] *= s;
    p[2] *= s;
  };
  // Radii are deliberately left alone: a trunk's thickness comes from
  // `radiusRatio * height`, which is already the value the caller asked for.
  // Scaling it again here is what turned a 13-voxel trunk into a 20-voxel one.
  for (const stem of skel.stems) {
    for (const p of stem.points) scalePoint(p);
    for (let i = 0; i < stem.arc.length; i++) stem.arc[i] *= s;
    stem.length *= s;
  }
  for (const seg of skel.segments) {
    scalePoint(seg.a);
    scalePoint(seg.b);
    seg.u *= s;
  }
  for (const t of skel.tips) scalePoint(t.p);
  for (let i = 0; i < skel.whorlY.length; i++) skel.whorlY[i] *= s;
  skel.topY *= s;
  skel.spread *= s;
  return s;
}
