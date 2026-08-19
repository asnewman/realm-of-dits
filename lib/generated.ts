/** A Dit produced by the generator, as opposed to one curated in `lib/dits.ts`. */
export type GeneratedDit = {
  id: string;
  prompt: string;
  url: string;
  createdAt: string;
};

/** Blob key layout. Metadata is keyed by day so the daily cap is one list call. */
export const META_PREFIX = "dits/meta/";
export const IMAGE_PREFIX = "dits/img/";

export function dayKey(date = new Date()): string {
  return date.toISOString().slice(0, 10);
}
