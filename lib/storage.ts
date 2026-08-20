import "server-only";

import {
  IMAGE_PREFIX,
  META_PREFIX,
  SPEND_PREFIX,
  dayKey,
  type StoredDit,
} from "./generated";

/**
 * Generated Dits are persisted so the gallery survives a refresh.
 *
 * Two adapters share one interface: Vercel Blob in production, and the local
 * filesystem in development so the generator works before a blob store exists.
 * Metadata is one flat object per Dit, keyed by id, so a single Dit can be read
 * or written without touching the others.
 */
export interface DitStore {
  create(dit: StoredDit, image: Buffer): Promise<StoredDit>;
  get(id: string): Promise<StoredDit | null>;
  update(dit: StoredDit): Promise<void>;
  remove(dit: StoredDit): Promise<void>;
  listSaved(): Promise<StoredDit[]>;
  countForDay(day: string): Promise<number>;
}

const metaPath = (id: string) => `${META_PREFIX}${id}.json`;
const imagePath = (id: string) => `${IMAGE_PREFIX}${id}.png`;
const spendPath = (id: string, day: string) => `${SPEND_PREFIX}${day}/${id}.json`;

/* -------------------------------------------------------------------------- */
/* Vercel Blob                                                                 */
/* -------------------------------------------------------------------------- */

function blobStore(): DitStore {
  const writeMeta = async (dit: StoredDit) => {
    const { put } = await import("@vercel/blob");
    await put(metaPath(dit.id), JSON.stringify(dit), {
      access: "public",
      addRandomSuffix: false,
      allowOverwrite: true,
      contentType: "application/json",
    });
  };

  const readMeta = async (pathname: string): Promise<StoredDit | null> => {
    const { list } = await import("@vercel/blob");
    const found = await list({ prefix: pathname, limit: 1 });
    const blob = found.blobs.find((entry) => entry.pathname === pathname);
    if (!blob) return null;
    try {
      const response = await fetch(blob.url, { cache: "no-store" });
      if (!response.ok) return null;
      return normalize(await response.json());
    } catch {
      return null;
    }
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

      const record: StoredDit = { ...dit, url: uploaded.url };
      await writeMeta(record);

      // Recorded last so a failure earlier never charges against the cap.
      await put(
        spendPath(dit.id, dayKey(new Date(dit.createdAt))),
        JSON.stringify({ id: dit.id, at: dit.createdAt }),
        {
          access: "public",
          addRandomSuffix: false,
          allowOverwrite: true,
          contentType: "application/json",
        },
      );

      return record;
    },

    get(id) {
      return readMeta(metaPath(id));
    },

    update(dit) {
      return writeMeta(dit);
    },

    async remove(dit) {
      const { del } = await import("@vercel/blob");
      // The spend marker is deliberately left behind.
      await del([metaPath(dit.id), imagePath(dit.id)]);
    },

    async listSaved() {
      const { list } = await import("@vercel/blob");

      const blobs = [];
      let cursor: string | undefined;
      do {
        const page = await list({ prefix: META_PREFIX, cursor });
        blobs.push(...page.blobs);
        cursor = page.hasMore ? page.cursor : undefined;
      } while (cursor);

      const records = await Promise.all(
        blobs.map(async (blob) => {
          try {
            const response = await fetch(blob.url, { cache: "no-store" });
            if (!response.ok) return null;
            return normalize(await response.json());
          } catch {
            return null;
          }
        }),
      );

      return onlySaved(records);
    },

    async countForDay(day) {
      const { list } = await import("@vercel/blob");

      let total = 0;
      let cursor: string | undefined;
      do {
        const page = await list({ prefix: `${SPEND_PREFIX}${day}/`, cursor });
        total += page.blobs.length;
        cursor = page.hasMore ? page.cursor : undefined;
      } while (cursor);

      return total;
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
    return {
      path,
      fs: await import("node:fs/promises"),
      image: (id: string) =>
        path.join(process.cwd(), LOCAL_IMAGE_DIR, `${id}.png`),
      meta: (id: string) =>
        path.join(process.cwd(), LOCAL_DATA_DIR, "meta", `${id}.json`),
      metaDir: path.join(process.cwd(), LOCAL_DATA_DIR, "meta"),
      spendDir: (day: string) =>
        path.join(process.cwd(), LOCAL_DATA_DIR, "spend", day),
    };
  };

  return {
    async create(dit, image) {
      const { path, fs, ...at } = await io();
      const day = dayKey(new Date(dit.createdAt));

      await fs.mkdir(path.join(process.cwd(), LOCAL_IMAGE_DIR), {
        recursive: true,
      });
      await fs.mkdir(at.metaDir, { recursive: true });
      await fs.mkdir(at.spendDir(day), { recursive: true });

      await fs.writeFile(at.image(dit.id), image);

      const record: StoredDit = { ...dit, url: `/generated/${dit.id}.png` };
      await fs.writeFile(at.meta(dit.id), JSON.stringify(record));
      await fs.writeFile(
        path.join(at.spendDir(day), `${dit.id}.json`),
        JSON.stringify({ id: dit.id, at: dit.createdAt }),
      );

      return record;
    },

    async get(id) {
      const { fs, ...at } = await io();
      try {
        return normalize(JSON.parse(await fs.readFile(at.meta(id), "utf8")));
      } catch {
        return null;
      }
    },

    async update(dit) {
      const { fs, ...at } = await io();
      await fs.writeFile(at.meta(dit.id), JSON.stringify(dit));
    },

    async remove(dit) {
      const { fs, ...at } = await io();
      await fs.rm(at.meta(dit.id), { force: true });
      await fs.rm(at.image(dit.id), { force: true });
    },

    async listSaved() {
      const { path, fs, ...at } = await io();

      let entries: import("node:fs").Dirent[];
      try {
        entries = await fs.readdir(at.metaDir, { withFileTypes: true });
      } catch {
        return [];
      }

      // Metadata used to be nested under a day folder, so look one level down
      // too rather than dropping anything written by an older build.
      const files: string[] = [];
      for (const entry of entries) {
        if (entry.isDirectory()) {
          try {
            const nested = await fs.readdir(path.join(at.metaDir, entry.name));
            files.push(
              ...nested.map((file) => path.join(at.metaDir, entry.name, file)),
            );
          } catch {
            continue;
          }
        } else {
          files.push(path.join(at.metaDir, entry.name));
        }
      }

      const records = await Promise.all(
        files
          .filter((file) => file.endsWith(".json"))
          .map(async (file) => {
            try {
              return normalize(JSON.parse(await fs.readFile(file, "utf8")));
            } catch {
              return null;
            }
          }),
      );

      return onlySaved(records);
    },

    async countForDay(day) {
      const { fs, ...at } = await io();
      try {
        const files = await fs.readdir(at.spendDir(day));
        return files.filter((file) => file.endsWith(".json")).length;
      } catch {
        return 0;
      }
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
  const description =
    typeof record.description === "string" && record.description.trim()
      ? record.description
      : prompt;

  return {
    id: record.id,
    prompt,
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
  return records
    .filter((record): record is StoredDit => record !== null && !record.draft)
    .sort((a, b) => a.createdAt.localeCompare(b.createdAt));
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
