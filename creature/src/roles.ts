// Colour roles a creature emits. The first eleven are what you see on a whole
// animal; the rest are its inside, only ever visible through damage.

import type { RGB, Role } from "@voxolith/engine";

export const ROLE = {
  FUR: 1,
  FUR_DARK: 2,
  FUR_LIGHT: 3,
  BELLY: 4,
  /** Bare skin: ears, feet, tail. */
  SKIN: 5,
  SKIN_DARK: 6,
  CLAW: 7,
  EYE: 8,
  EYE_SHINE: 9,
  NOSE: 10,
  TOOTH: 11,
  // --- inside ---
  FAT: 12,
  FLESH: 13,
  MUSCLE: 14,
  BONE: 15,
  MARROW: 16,
  ORGAN: 17,
  ORGAN_DARK: 18,
  BLOOD: 19,
} as const;

export const ROLE_COUNT = 19;
/** Roles that belong to the inside; they never show on an undamaged animal. */
export const INTERIOR = new Set<number>([ROLE.FAT, ROLE.FLESH, ROLE.MUSCLE, ROLE.BONE, ROLE.MARROW, ROLE.ORGAN, ROLE.ORGAN_DARK, ROLE.BLOOD]);

const ID = ["fur", "fur.dark", "fur.light", "belly", "skin", "skin.dark", "claw", "eye", "eye.shine", "nose", "tooth",
  "fat", "flesh", "muscle", "bone", "marrow", "organ", "organ.dark", "blood"];
const NAME = ["Fur", "Fur dark", "Fur light", "Belly", "Skin", "Skin dark", "Claw", "Eye", "Eye shine", "Nose", "Tooth",
  "Fat", "Flesh", "Muscle", "Bone", "Marrow", "Organ", "Organ dark", "Blood"];

export type ColorSet = Record<number, RGB>;

export function buildRoles(colors: ColorSet): Role[] {
  return ID.map((id, i): Role => {
    const v = i + 1;
    const role: Role = { id, name: NAME[i], color: colors[v] ?? [1, 0, 1] };
    if (v === ROLE.EYE) role.material = { kind: "metal", metal: 0.2, rough: 0.1, spec: 0.9 };
    if (v === ROLE.BLOOD || v === ROLE.ORGAN) role.material = { kind: "metal", metal: 0.05, rough: 0.35, spec: 0.5 };
    return role;
  });
}
