// XP rules used by both the API layer and the UI. Kept Prisma-free so the
// browser bundle doesn't accidentally pull in @prisma/client.

export const XP_PER_DIFFICULTY = 50;

export function xpFor(difficulty: number): number {
  return Math.max(1, Math.round(difficulty)) * XP_PER_DIFFICULTY;
}
