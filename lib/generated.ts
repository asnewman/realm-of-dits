/**
 * A Dit produced by the generator, as opposed to one curated in `lib/dits.ts`.
 *
 * Generation writes a draft. Drafts are invisible to the gallery until the
 * person who made one saves it with a description, so "cancel" and "delete"
 * are the same operation on the same record.
 */
export type StoredDit = {
  id: string;
  prompt: string;
  /** Empty while the Dit is still a draft. Required to save. */
  description: string;
  url: string;
  createdAt: string;
  /** SHA-256 of the owner cookie. Never sent to the browser. */
  owner: string;
  draft: boolean;
};

/** What the browser is allowed to see. */
export type PublicDit = Omit<StoredDit, "owner" | "draft"> & { mine: boolean };

export const META_PREFIX = "dits/meta/";
export const IMAGE_PREFIX = "dits/img/";
/**
 * One marker per generation, partitioned by day, so the daily cap counts money
 * spent rather than Dits kept. Markers outlive the Dit on purpose: deleting a
 * generation must not refund a slot, or the cap is trivial to bypass.
 */
export const SPEND_PREFIX = "dits/spend/";

export const MAX_DESCRIPTION = 120;

export function dayKey(date = new Date()): string {
  return date.toISOString().slice(0, 10);
}

export function toPublic(dit: StoredDit, owner: string | null): PublicDit {
  const { owner: recordOwner, draft, ...rest } = dit;
  void draft;
  return { ...rest, mine: Boolean(owner) && recordOwner === owner };
}
