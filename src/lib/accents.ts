/**
 * The accent colours on offer.
 *
 * In its own module rather than beside the action that validates it, because
 * `theme-actions.ts` is a `"use server"` file and those may only export async
 * functions — a plain array there is a build-time error. Same reasoning as
 * `genres.ts`: shared constants are not server code.
 *
 * The ids have to match the `:root[data-accent="…"]` rules in `globals.css`.
 */
export const ACCENTS = [
  { id: "violet", label: "Violet", swatch: "#8b5cf6" },
  { id: "blue", label: "Blue", swatch: "#3b82f6" },
  { id: "cyan", label: "Cyan", swatch: "#06b6d4" },
  { id: "emerald", label: "Emerald", swatch: "#10b981" },
  { id: "amber", label: "Amber", swatch: "#f59e0b" },
  { id: "rose", label: "Rose", swatch: "#f43f5e" },
] as const;

export function isAccent(value: string) {
  return ACCENTS.some((option) => option.id === value);
}
