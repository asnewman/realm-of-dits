import "server-only";

import {
  IMAGE_PREFIX,
  META_PREFIX,
  dayKey,
  type GeneratedDit,
} from "./generated";

/**
 * Generated Dits are persisted so the gallery survives a refresh.
 *
 * Two adapters share one interface: Vercel Blob in production, and the local
 * filesystem in development so the generator works before a blob store exists.
 * Metadata lives in its own per-day JSON object rather than a single manifest,
 * which keeps concurrent generations from clobbering each other's writes.
 */
export interface DitStore {
  save(dit: Omit<GeneratedDit, "url">, image: Buffer): Promise<GeneratedDit>;
  list(): Promise<GeneratedDit[]>;
  countForDay(day: string): Promise<number>;
}

/* -------------------------------------------------------------------------- */
/* Vercel Blob                                                                 */
/* -------------------------------------------------------------------------- */

function blobStore(): DitStore {
  return {
    async save(dit, image) {
      const { put } = await import("@vercel/blob");

      const uploaded = await put(`${IMAGE_PREFIX}${dit.id}.png`, image, {
        access: "public",
        addRandomSuffix: false,
        contentType: "image/png",
      });

      const record: GeneratedDit = { ...dit, url: uploaded.url };

      await put(
        `${META_PREFIX}${dayKey(new Date(dit.createdAt))}/${dit.id}.json`,
        JSON.stringify(record),
        {
          access: "public",
          addRandomSuffix: false,
          contentType: "application/json",
        },
      );

      return record;
    },

    async list() {
      const { list } = await import("@vercel/blob");

      const metaBlobs = [];
      let cursor: string | undefined;
      do {
        const page = await list({ prefix: META_PREFIX, cursor });
        metaBlobs.push(...page.blobs);
        cursor = page.hasMore ? page.cursor : undefined;
      } while (cursor);

      const records = await Promise.all(
        metaBlobs.map(async (blob) => {
          try {
            const response = await fetch(blob.url, { cache: "no-store" });
            if (!response.ok) return null;
            return (await response.json()) as GeneratedDit;
          } catch {
            return null;
          }
        }),
      );

      return sortNewestFirst(records.filter(Boolean) as GeneratedDit[]);
    },

    async countForDay(day) {
      const { list } = await import("@vercel/blob");

      let total = 0;
      let cursor: string | undefined;
      do {
        const page = await list({ prefix: `${META_PREFIX}${day}/`, cursor });
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
const LOCAL_META_DIR = ".dits-data/meta";

function localStore(): DitStore {
  const paths = async () => {
    const path = await import("node:path");
    return {
      path,
      fs: await import("node:fs/promises"),
      images: path.join(process.cwd(), LOCAL_IMAGE_DIR),
      meta: path.join(process.cwd(), LOCAL_META_DIR),
    };
  };

  return {
    async save(dit, image) {
      const { path, fs, images, meta } = await paths();
      const day = dayKey(new Date(dit.createdAt));

      await fs.mkdir(images, { recursive: true });
      await fs.mkdir(path.join(meta, day), { recursive: true });

      await fs.writeFile(path.join(images, `${dit.id}.png`), image);

      const record: GeneratedDit = { ...dit, url: `/generated/${dit.id}.png` };
      await fs.writeFile(
        path.join(meta, day, `${dit.id}.json`),
        JSON.stringify(record),
      );

      return record;
    },

    async list() {
      const { path, fs, meta } = await paths();

      let days: string[];
      try {
        days = await fs.readdir(meta);
      } catch {
        return [];
      }

      const records: GeneratedDit[] = [];
      for (const day of days) {
        let files: string[];
        try {
          files = await fs.readdir(path.join(meta, day));
        } catch {
          continue;
        }
        for (const file of files) {
          if (!file.endsWith(".json")) continue;
          try {
            const raw = await fs.readFile(path.join(meta, day, file), "utf8");
            records.push(JSON.parse(raw) as GeneratedDit);
          } catch {
            /* skip unreadable records rather than breaking the gallery */
          }
        }
      }

      return sortNewestFirst(records);
    },

    async countForDay(day) {
      const { path, fs, meta } = await paths();
      try {
        const files = await fs.readdir(path.join(meta, day));
        return files.filter((f) => f.endsWith(".json")).length;
      } catch {
        return 0;
      }
    },
  };
}

/* -------------------------------------------------------------------------- */

function sortNewestFirst(records: GeneratedDit[]): GeneratedDit[] {
  return records.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
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
