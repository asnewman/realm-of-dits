import "server-only";

import {
  DRAFT_PREFIX,
  IMAGE_PREFIX,
  LEGACY_META_PREFIX,
  SAVED_PREFIX,
  SPEND_PREFIX,
  dayKey,
  type StoredDit,
} from "./generated";

/**
 * Generated Dits are persisted so the gallery survives a refresh.
 *
 * Two adapters share one interface: Vercel Blob in production, and the local
 * filesystem in development so the generator works before a blob store exists.
 *
 * Records are immutable. Saving writes a new object under the saved prefix and
 * deletes the draft, rather than rewriting one object in place, because blob
 * content is CDN-cached for up to a month and an overwrite reads back stale.
 */
export interface DitStore {
  create(dit: StoredDit, image: Buffer): Promise<StoredDit>;
  get(id: string): Promise<StoredDit | null>;
  publish(dit: StoredDit): Promise<void>;
  remove(dit: StoredDit): Promise<void>;
  listSaved(): Promise<StoredDit[]>;
  countForDay(day: string): Promise<number>;
}

const draftPath = (id: string) => `${DRAFT_PREFIX}${id}.json`;
const savedPath = (id: string) => `${SAVED_PREFIX}${id}.json`;
const legacyPath = (id: string) => `${LEGACY_META_PREFIX}${id}.json`;
const imagePath = (id: string) => `${IMAGE_PREFIX}${id}.png`;
const spendPath = (id: string, day: string) => `${SPEND_PREFIX}${day}/${id}.json`;

/* -------------------------------------------------------------------------- */
/* Vercel Blob                                                                 */
/* -------------------------------------------------------------------------- */

function blobStore(): DitStore {
  const writeJson = async (pathname: string, body: unknown) => {
    const { put } = await import("@vercel/blob");
    await put(pathname, JSON.stringify(body), {
      access: "public",
      addRandomSuffix: false,
      allowOverwrite: true,
      contentType: "application/json",
    });
  };

  const drop = async (pathnames: string[]) => {
    const { del } = await import("@vercel/blob");
    try {
      await del(pathnames);
    } catch {
      // Deleting something already gone is not a failure worth surfacing.
    }
  };

  /**
   * `uploadedAt` changes whenever a pathname is rewritten, so using it as a
   * query parameter guarantees the fetch reflects the current object instead of
   * a cached earlier one. Legacy records were rewritten in place and need it.
   */
  const readJson = async (url: string, version?: Date | string) => {
    const bust = version
      ? `${url}${url.includes("?") ? "&" : "?"}v=${encodeURIComponent(
          typeof version === "string" ? version : version.toISOString(),
        )}`
      : url;
    try {
      const response = await fetch(bust, { cache: "no-store" });
      if (!response.ok) return null;
      return await response.json();
    } catch {
      return null;
    }
  };

  const listAll = async (prefix: string) => {
    const { list } = await import("@vercel/blob");
    const blobs = [];
    let cursor: string | undefined;
    do {
      const page = await list({ prefix, cursor });
      blobs.push(...page.blobs);
      cursor = page.hasMore ? page.cursor : undefined;
    } while (cursor);
    return blobs;
  };

  const findOne = async (pathname: string) => {
    const { list } = await import("@vercel/blob");
    const found = await list({ prefix: pathname, limit: 1 });
    return found.blobs.find((entry) => entry.pathname === pathname) ?? null;
  };

  return {
    async create(dit, image) {
      const { put } = await import("@vercel/blob");

      const uploaded = await put(imagePath(dit.id), image, {
        access: "public",
        addRandomSuffix: false,
        allowOverwrite: true,
        contentType: "image/png",
      });

      const record: StoredDit = { ...dit, url: uploaded.url, draft: true };
      await writeJson(draftPath(dit.id), record);

      // Recorded last so a failure earlier never charges against the cap.
      await writeJson(spendPath(dit.id, dayKey(new Date(dit.createdAt))), {
        id: dit.id,
        at: dit.createdAt,
      });

      return record;
    },

    async get(id) {
      for (const [pathname, draft] of [
        [savedPath(id), false],
        [draftPath(id), true],
        [legacyPath(id), null],
      ] as const) {
        const blob = await findOne(pathname);
        if (!blob) continue;
        const raw = await readJson(blob.url, blob.uploadedAt);
        const record = normalize(raw);
        if (!record) continue;
        // The pathname decides the state, not the stored flag.
        return draft === null ? record : { ...record, draft };
      }
      return null;
    },

    async publish(dit) {
      await writeJson(savedPath(dit.id), { ...dit, draft: false });
      await drop([draftPath(dit.id), legacyPath(dit.id)]);
    },

    async remove(dit) {
      // The spend marker is deliberately left behind.
      await drop([
        savedPath(dit.id),
        draftPath(dit.id),
        legacyPath(dit.id),
        imagePath(dit.id),
      ]);
    },

    async listSaved() {
      const [saved, legacy] = await Promise.all([
        listAll(SAVED_PREFIX),
        listAll(LEGACY_META_PREFIX),
      ]);

      const records = await Promise.all([
        // Written once, so the cached copy is always the current one.
        ...saved.map(async (blob) => {
          const record = normalize(await readJson(blob.url));
          return record ? { ...record, draft: false } : null;
        }),
        // Rewritten in place by an older build, so read past the cache.
        ...legacy.map(async (blob) =>
          normalize(await readJson(blob.url, blob.uploadedAt)),
        ),
      ]);

      return onlySaved(records);
    },

    async countForDay(day) {
      return (await listAll(`${SPEND_PREFIX}${day}/`)).length;
    },
  };
}

/* -------------------------------------------------------------------------- */
/* Local filesystem (development)                                              */
/* -------------------------------------------------------------------------- */

const LOCAL_IMAGE_DIR = "public/generated";
const LOCAL_DATA_DIR = ".dits-data";

function localStore(): DitStore {
  const io = async () => {
    const path = await import("node:path");
    const root = path.join(process.cwd(), LOCAL_DATA_DIR);
    return {
      path,
      fs: await import("node:fs/promises"),
      imageDir: path.join(process.cwd(), LOCAL_IMAGE_DIR),
      image: (id: string) =>
        path.join(process.cwd(), LOCAL_IMAGE_DIR, `${id}.png`),
      savedDir: path.join(root, "saved"),
      draftDir: path.join(root, "draft"),
      legacyDir: path.join(root, "meta"),
      spendDir: (day: string) => path.join(root, "spend", day),
    };
  };

  const readDir = async (
    fs: typeof import("node:fs/promises"),
    path: typeof import("node:path"),
    dir: string,
  ): Promise<string[]> => {
    let entries: import("node:fs").Dirent[];
    try {
      entries = await fs.readdir(dir, { withFileTypes: true });
    } catch {
      return [];
    }
    const files: string[] = [];
    for (const entry of entries) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        // An older build nested records under a day folder.
        files.push(...(await readDir(fs, path, full)));
      } else if (entry.name.endsWith(".json")) {
        files.push(full);
      }
    }
    return files;
  };

  const readJson = async (
    fs: typeof import("node:fs/promises"),
    file: string,
  ) => {
    try {
      return JSON.parse(await fs.readFile(file, "utf8"));
    } catch {
      return null;
    }
  };

  return {
    async create(dit, image) {
      const { path, fs, ...at } = await io();
      const day = dayKey(new Date(dit.createdAt));

      await fs.mkdir(at.imageDir, { recursive: true });
      await fs.mkdir(at.draftDir, { recursive: true });
      await fs.mkdir(at.spendDir(day), { recursive: true });

      await fs.writeFile(at.image(dit.id), image);

      const record: StoredDit = {
        ...dit,
        url: `/generated/${dit.id}.png`,
        draft: true,
      };
      await fs.writeFile(
        path.join(at.draftDir, `${dit.id}.json`),
        JSON.stringify(record),
      );
      await fs.writeFile(
        path.join(at.spendDir(day), `${dit.id}.json`),
        JSON.stringify({ id: dit.id, at: dit.createdAt }),
      );

      return record;
    },

    async get(id) {
      const { path, fs, ...at } = await io();
      for (const [dir, draft] of [
        [at.savedDir, false],
        [at.draftDir, true],
        [at.legacyDir, null],
      ] as const) {
        const record = normalize(
          await readJson(fs, path.join(dir, `${id}.json`)),
        );
        if (record) return draft === null ? record : { ...record, draft };
      }
      return null;
    },

    async publish(dit) {
      const { path, fs, ...at } = await io();
      await fs.mkdir(at.savedDir, { recursive: true });
      await fs.writeFile(
        path.join(at.savedDir, `${dit.id}.json`),
        JSON.stringify({ ...dit, draft: false }),
      );
      await fs.rm(path.join(at.draftDir, `${dit.id}.json`), { force: true });
      await fs.rm(path.join(at.legacyDir, `${dit.id}.json`), { force: true });
    },

    async remove(dit) {
      const { path, fs, ...at } = await io();
      await fs.rm(path.join(at.savedDir, `${dit.id}.json`), { force: true });
      await fs.rm(path.join(at.draftDir, `${dit.id}.json`), { force: true });
      await fs.rm(path.join(at.legacyDir, `${dit.id}.json`), { force: true });
      await fs.rm(at.image(dit.id), { force: true });
    },

    async listSaved() {
      const { path, fs, ...at } = await io();

      const records = await Promise.all([
        ...(await readDir(fs, path, at.savedDir)).map(async (file) => {
          const record = normalize(await readJson(fs, file));
          return record ? { ...record, draft: false } : null;
        }),
        ...(await readDir(fs, path, at.legacyDir)).map(async (file) =>
          normalize(await readJson(fs, file)),
        ),
      ]);

      return onlySaved(records);
    },

    async countForDay(day) {
      const { path, fs, ...at } = await io();
      return (await readDir(fs, path, at.spendDir(day))).length;
    },
  };
}

/* -------------------------------------------------------------------------- */

/**
 * Records written before descriptions and ownership existed are still readable.
 * They fall back to their prompt for a caption, count as saved rather than
 * draft, and have no owner, so nobody can delete them through the UI.
 */
export function normalize(raw: unknown): StoredDit | null {
  if (!raw || typeof raw !== "object") return null;
  const record = raw as Record<string, unknown>;
  if (typeof record.id !== "string" || typeof record.url !== "string") {
    return null;
  }

  const prompt = typeof record.prompt === "string" ? record.prompt : "";
  const text = (value: unknown) =>
    typeof value === "string" && value.trim() ? value : "";

  // Records predating the name field kept a single caption. Promote it to the
  // name so those Dits still read correctly, and leave them no description.
  const named = text(record.name);
  const name = named || text(record.description) || prompt;
  const description = named ? text(record.description) : "";

  return {
    id: record.id,
    prompt,
    name,
    description,
    url: record.url,
    createdAt:
      typeof record.createdAt === "string"
        ? record.createdAt
        : new Date(0).toISOString(),
    owner: typeof record.owner === "string" ? record.owner : "",
    draft: record.draft === true,
  };
}

/** Drafts never reach the gallery. Oldest first, so saves land at the end. */
function onlySaved(records: (StoredDit | null)[]): StoredDit[] {
  const byId = new Map<string, StoredDit>();
  for (const record of records) {
    if (!record || record.draft) continue;
    // A record present under both prefixes is the same Dit; keep one.
    if (!byId.has(record.id)) byId.set(record.id, record);
  }
  return [...byId.values()].sort((a, b) =>
    a.createdAt.localeCompare(b.createdAt),
  );
}

export function getStore(): DitStore {
  return process.env.BLOB_READ_WRITE_TOKEN ? blobStore() : localStore();
}

/**
 * The local adapter writes to disk, which a serverless host won't allow. Catch
 * that before an image is paid for rather than after it fails to save.
 */
export function storageReady(): boolean {
  return Boolean(process.env.BLOB_READ_WRITE_TOKEN) || !process.env.VERCEL;
}
