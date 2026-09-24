// The rat's animations, generated from its gait parameters.
//
// Clips are keyed at 12 frames per second, like sprite animation: it suits
// voxels (a limb only moves a whole voxel or so between keys anyway) and lets
// a host cache baked poses per frame. Loops repeat their first key at the end,
// so they close exactly.
//
// Rotations are relative to rest, about each bone's head, in its parent's
// frame. Legs swing about x (positive swings the foot back), the spine and
// tail yaw about y (positive turns the nose towards +x, the rat's left) and
// pitch about x.

import type { Clip, ClipEvent, ClipTrack } from "@voxolith/engine";
import { LEGS, type Leg } from "./body";
import type { CreatureParams } from "./params";

type Quat = [number, number, number, number];
const FPS = 12;
const DEG = Math.PI / 180;

const qAxis = (x: number, y: number, z: number, deg: number): Quat => {
  const h = (deg * DEG) / 2, s = Math.sin(h);
  return [x * s, y * s, z * s, Math.cos(h)];
};
const qMul = (a: Quat, b: Quat): Quat => [
  a[3] * b[0] + a[0] * b[3] + a[1] * b[2] - a[2] * b[1],
  a[3] * b[1] - a[0] * b[2] + a[1] * b[3] + a[2] * b[0],
  a[3] * b[2] + a[0] * b[1] - a[1] * b[0] + a[2] * b[3],
  a[3] * b[3] - a[0] * b[0] - a[1] * b[1] - a[2] * b[2],
];
/** Yaw (about y), then pitch (about x), then roll (about z), degrees. */
const euler = (yaw: number, pitch: number, roll = 0): Quat => qMul(qMul(qAxis(0, 1, 0, yaw), qAxis(1, 0, 0, pitch)), qAxis(0, 0, 1, roll));

type PoseFn = (t: number) => Record<string, Quat | undefined>;

/** Sample a pose function into a clip, one key per frame. */
function build(id: string, duration: number, loop: boolean, bone: Record<string, number>, pose: PoseFn, root?: (t: number) => [number, number, number], events?: ClipEvent[]): Clip {
  const frames = Math.max(2, Math.round(duration * FPS));
  const times = Array.from({ length: frames + 1 }, (_, k) => (k / frames) * duration);
  const keys = times.map((t, k) => pose(loop && k === frames ? 0 : t));
  const tracks: ClipTrack[] = [];
  const names = new Set(keys.flatMap((k) => Object.keys(k)));
  for (const name of names) {
    if (bone[name] === undefined) continue;
    const rotations: number[] = [];
    for (const k of keys) rotations.push(...(k[name] ?? [0, 0, 0, 1]));
    tracks.push({ bone: bone[name], times, rotations });
  }
  const clip: Clip = { id, duration, loop, tracks, events: events ?? [] };
  if (root) {
    const offsets: number[] = [];
    times.forEach((t, k) => offsets.push(...root(loop && k === frames ? 0 : t)));
    clip.root = { times, offsets };
  }
  return clip;
}

const TAU = Math.PI * 2;

/** One leg's swing at a phase: upper swings, lower folds on the way forward, foot stays level. */
function legPose(leg: Leg, phase: number, amp: number, lift: number): Record<string, Quat> {
  const fore = leg[0] === "F";
  const swing = amp * Math.cos(TAU * phase); // + = foot back
  const up = Math.max(0, Math.sin(TAU * phase)); // moving forward: foot off the ground
  const fold = lift * up * (fore ? -1 : 1);
  return {
    [`${leg}.upper`]: euler(0, swing),
    [`${leg}.lower`]: euler(0, fold),
    [`${leg}.foot`]: euler(0, -(swing + fold) * 0.6),
  };
}

export function buildClips(p: CreatureParams, bone: Record<string, number>): Clip[] {
  const g = p.gait;
  const tailBones = Object.keys(bone).filter((b) => b.startsWith("tail")).sort();
  const tailWave = (t: number, period: number, amp: number, yawBias = 0) => {
    const out: Record<string, Quat> = {};
    tailBones.forEach((b, k) => {
      // Positive pitch lifts a bone pointing back (-z): the base is carried a
      // little up and the rest curves gently back down, never into the ground.
      out[b] = euler(yawBias * (k ? 0.5 : 1) + amp * g.tailSway * (0.35 + 0.18 * k) * Math.sin(TAU * (t / period - k * 0.11)), k === 0 ? 5 : -0.7);
    });
    return out;
  };
  const clips: Clip[] = [];

  // --- walk: diagonal pairs ---------------------------------------------------
  const walk = (id: string, turn: number) => {
    const T = 1 / Math.max(0.2, g.pace);
    const offset: Record<Leg, number> = { FL: 0, HR: 0, FR: 0.5, HL: 0.5 };
    const events: ClipEvent[] = LEGS.map((leg) => ({ t: (((0.5 - offset[leg]) % 1 + 1) % 1) * T, name: `foot.${leg}` }));
    clips.push(build(id, T, true, bone, (t) => {
      const ph = t / T;
      const pose: Record<string, Quat> = {};
      for (const leg of LEGS) Object.assign(pose, legPose(leg, ph + offset[leg], 24 * g.stride, 26));
      const sway = 3 * Math.sin(TAU * ph);
      pose.spine = euler(turn + sway, 0);
      pose.chest = euler(turn - sway, 0);
      pose.neck = euler(turn * 0.8, 2 * Math.sin(TAU * ph * 2));
      pose.head = euler(turn * 0.6 + sway * 0.6, -3);
      Object.assign(pose, tailWave(t, T, 10, -turn * 0.6));
      return pose;
    }, (t) => [0, 0.35 * g.bounce * (1 - Math.cos(TAU * 2 * (t / T))) / 2, 0], events));
  };
  walk("walk", 0);
  walk("turn-left", 9);
  walk("turn-right", -9);

  // --- run: a bounding gallop, spine flexing ----------------------------------
  {
    const T = 1 / Math.max(0.3, g.pace * 2.1);
    const offset: Record<Leg, number> = { FL: 0, FR: 0.07, HL: 0.5, HR: 0.57 };
    const events: ClipEvent[] = [{ t: 0.5 * T, name: "foot.front" }, { t: 0, name: "foot.hind" }];
    clips.push(build("run", T, true, bone, (t) => {
      const ph = t / T;
      const pose: Record<string, Quat> = {};
      for (const leg of LEGS) Object.assign(pose, legPose(leg, ph + offset[leg], 38 * g.stride, 40));
      const flex = 11 * Math.sin(TAU * ph);
      pose.pelvis = euler(0, flex * 0.5);
      pose.spine = euler(0, -flex);
      pose.chest = euler(0, -flex * 0.6);
      pose.neck = euler(0, flex * 0.8);
      pose.head = euler(0, flex * 0.4);
      pose["ear.L"] = euler(0, 28);
      pose["ear.R"] = euler(0, 28);
      Object.assign(pose, tailWave(t, T, 5));
      return pose;
    }, (t) => [0, 1.2 * g.bounce * Math.max(0, Math.sin(TAU * (t / T))), 0], events));
  }

  // --- idle: breathing, bursts of sniffing, an ear twitch --------------------
  clips.push(build("idle", 3, true, bone, (t) => {
    const breathe = 1.2 * Math.sin(TAU * (t / 1.5));
    const burst = Math.max(0, Math.sin(Math.PI * Math.min(1, Math.max(0, (t - 0.6) / 1.2))));
    const twitch = Math.max(0, 1 - Math.abs(t - 2.3) * 5);
    return {
      spine: euler(0, breathe),
      chest: euler(0, -breathe * 0.6),
      neck: euler(4 * Math.sin(TAU * t / 3), 0),
      head: euler(0, -3 + 2.5 * burst * Math.sin(TAU * t * 7)),
      "ear.L": euler(0, 0, 14 * twitch),
      "ear.R": euler(0, 0, -6 * twitch),
      ...tailWave(t, 3, 4),
    };
  }));

  // --- sniff: rear up on the hind legs and look around ------------------------
  clips.push(build("sniff", 2, true, bone, (t) => {
    const look = 22 * Math.sin(TAU * (t / 2));
    const pose: Record<string, Quat> = {
      pelvis: euler(0, -28),
      spine: euler(0, -4),
      neck: euler(look * 0.5, -6),
      head: euler(look * 0.6, -8 + 4 * Math.sin(TAU * t * 5)),
    };
    for (const leg of ["HL", "HR"] as const) {
      pose[`${leg}.upper`] = euler(0, 32);
      pose[`${leg}.lower`] = euler(0, 6);
      pose[`${leg}.foot`] = euler(0, -12);
    }
    for (const leg of ["FL", "FR"] as const) {
      pose[`${leg}.upper`] = euler(0, -18);
      pose[`${leg}.lower`] = euler(0, -60);
      pose[`${leg}.foot`] = euler(0, 40);
    }
    Object.assign(pose, tailWave(t, 2, 3));
    // The tail hangs off the pelvis: undo the pelvis pitch so it stays on
    // the ground instead of swinging down into it.
    pose.tail0 = euler(0, 30);
    return pose;
  }, () => [0, 0.3, 0]));

  // --- death: roll onto the side and go limp ----------------------------------
  {
    const T = 1.2;
    const ease = (t: number) => { const x = Math.min(1, t / (T * 0.7)); return x * x * (3 - 2 * x); };
    clips.push(build("death", T, false, bone, (t) => {
      const e = ease(t);
      const pose: Record<string, Quat> = {
        pelvis: euler(0, 0, 82 * e),
        neck: euler(0, 12 * e),
        head: euler(8 * e, 18 * e),
      };
      for (const leg of LEGS) {
        pose[`${leg}.upper`] = euler(0, (leg[0] === "F" ? -25 : 20) * e);
        pose[`${leg}.lower`] = euler(0, (leg[0] === "F" ? 15 : -10) * e);
      }
      Object.assign(pose, tailWave(0, 1, 0));
      return pose;
    }, (t) => [0.6 * ease(t), -2.6 * ease(t) * p.shape.girth * p.shape.size, 0]));
  }

  return clips;
}
