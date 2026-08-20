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
  /** Both are empty while the Dit is a draft, and both are required to save. */
  name: string;
  description: string;
  url: string;
  createdAt: string;
  /** SHA-256 of the owner cookie. Never sent to the browser. */
  owner: string;
  draft: boolean;
};

/** What the browser is allowed to see. */
export type PublicDit = Omit<StoredDit, "owner" | "draft"> & { mine: boolean };

/**
 * Draft and saved records live at different pathnames rather than sharing one
 * that gets rewritten. Vercel caches blob content for up to a month and an
 * overwrite takes up to a minute to propagate, so a rewritten record reads back
 * stale — which used to hide a Dit the moment it was saved. The pathname is the
 * state, and `list()` reads pathnames consistently.
 */
export const DRAFT_PREFIX = "dits/draft/";
export const SAVED_PREFIX = "dits/saved/";
/** Written by an earlier build that kept both states at one pathname. */
export const LEGACY_META_PREFIX = "dits/meta/";
export const IMAGE_PREFIX = "dits/img/";
/**
 * One marker per generation, partitioned by day, so the daily cap counts money
 * spent rather than Dits kept. Markers outlive the Dit on purpose: deleting a
 * generation must not refund a slot, or the cap is trivial to bypass.
 */
export const SPEND_PREFIX = "dits/spend/";

export const MAX_NAME = 60;
export const MAX_DESCRIPTION = 120;

export function dayKey(date = new Date()): string {
  return date.toISOString().slice(0, 10);
}

export function toPublic(dit: StoredDit, owner: string | null): PublicDit {
  const { owner: recordOwner, draft, ...rest } = dit;
  void draft;
  return { ...rest, mine: Boolean(owner) && recordOwner === owner };
}
