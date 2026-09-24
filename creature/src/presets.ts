import { ROLE, type ColorSet } from "./roles";
import type { Coat, CreatureParams } from "./params";

const coats: Record<Coat, { fur: [number, number, number]; dark: [number, number, number]; light: [number, number, number]; belly: [number, number, number] }> = {
  brown: { fur: [0.42, 0.33, 0.25], dark: [0.3, 0.23, 0.17], light: [0.52, 0.42, 0.32], belly: [0.72, 0.66, 0.56] },
  grey: { fur: [0.46, 0.45, 0.43], dark: [0.33, 0.32, 0.31], light: [0.57, 0.56, 0.53], belly: [0.76, 0.74, 0.7] },
  white: { fur: [0.9, 0.89, 0.86], dark: [0.8, 0.78, 0.74], light: [0.96, 0.95, 0.93], belly: [0.93, 0.92, 0.9] },
  black: { fur: [0.16, 0.15, 0.15], dark: [0.1, 0.1, 0.1], light: [0.24, 0.23, 0.22], belly: [0.3, 0.28, 0.27] },
};

export function skinFor(coat: Coat, redEyes: boolean, belly: number): ColorSet {
  const c = coats[coat] ?? coats.brown;
  const mix = (a: number[], b: number[], t: number) => a.map((v, i) => v + (b[i] - v) * t) as [number, number, number];
  return {
    [ROLE.FUR]: c.fur, [ROLE.FUR_DARK]: c.dark, [ROLE.FUR_LIGHT]: c.light,
    [ROLE.BELLY]: mix(c.fur, c.belly, Math.max(0, Math.min(1, belly))),
    [ROLE.SKIN]: [0.86, 0.62, 0.6], [ROLE.SKIN_DARK]: [0.68, 0.46, 0.45], [ROLE.CLAW]: [0.85, 0.82, 0.74],
    [ROLE.EYE]: redEyes ? [0.75, 0.12, 0.16] : [0.05, 0.04, 0.05], [ROLE.EYE_SHINE]: [0.95, 0.95, 0.95],
    [ROLE.NOSE]: [0.78, 0.5, 0.52], [ROLE.TOOTH]: [0.93, 0.8, 0.45],
    [ROLE.FAT]: [0.93, 0.86, 0.62], [ROLE.FLESH]: [0.72, 0.26, 0.26], [ROLE.MUSCLE]: [0.55, 0.16, 0.17],
    [ROLE.BONE]: [0.92, 0.9, 0.82], [ROLE.MARROW]: [0.62, 0.2, 0.22], [ROLE.ORGAN]: [0.62, 0.28, 0.36],
    [ROLE.ORGAN_DARK]: [0.42, 0.12, 0.16], [ROLE.BLOOD]: [0.45, 0.04, 0.05],
  };
}

export const RAT: CreatureParams = {
  species: "rat",
  shape: { size: 1.2, bodyLength: 1, girth: 1, headLength: 1, snout: 0.6, ears: 1, legLength: 1.5, legThickness: 1, tailLength: 1, tailThickness: 1 },
  look: { coat: "brown", belly: 0.7, mottle: 0.5, redEyes: false },
  gait: { stride: 1, pace: 1.4, bounce: 1, tailSway: 1 },
};

const derive = (species: string, patch: (p: CreatureParams) => void): CreatureParams => {
  const p: CreatureParams = JSON.parse(JSON.stringify(RAT));
  p.species = species;
  patch(p);
  return p;
};

export const PRESETS: Record<string, CreatureParams> = {
  rat: RAT,
  "grey rat": derive("grey rat", (p) => { p.look.coat = "grey"; }),
  "lab rat": derive("lab rat", (p) => { p.look.coat = "white"; p.look.redEyes = true; p.look.mottle = 0.15; }),
  "black rat": derive("black rat", (p) => { p.look.coat = "black"; p.shape.tailLength = 1.2; p.shape.girth = 0.9; p.shape.ears = 1.2; }),
  "fat rat": derive("fat rat", (p) => { p.shape.girth = 1.3; p.shape.size = 1.15; p.gait.pace = 1.1; p.gait.bounce = 1.3; }),
};
export const PRESET_NAMES = Object.keys(PRESETS);
