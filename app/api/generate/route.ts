import fs from "node:fs";
import path from "node:path";
import OpenAI, { toFile } from "openai";

import { dayKey } from "@/lib/generated";
import { checkRateLimit, clientIp } from "@/lib/rateLimit";
import { getStore, storageReady } from "@/lib/storage";

export const runtime = "nodejs";
// Image edits can take a while. Vercel caps this at 60s on Hobby, 300s on Pro.
export const maxDuration = 60;

const REFERENCE = path.join(process.cwd(), "public/dits/thedit.png");
const MAX_PROMPT = 400;
const DAILY_CAP = Number(process.env.DIT_DAILY_CAP ?? 50);
const SIZE = process.env.DIT_SIZE ?? "1024x1536";
const QUALITY = process.env.DIT_QUALITY ?? "low";

function fail(message: string, status: number, extra?: HeadersInit) {
  return Response.json({ error: message }, { status, headers: extra });
}

export async function POST(request: Request) {
  if (!process.env.OPENAI_API_KEY || !storageReady()) {
    return fail("Generating is turned off right now", 503);
  }

  let prompt: unknown;
  try {
    ({ prompt } = await request.json());
  } catch {
    return fail("Describe the Dit you want", 400);
  }

  if (typeof prompt !== "string" || !prompt.trim()) {
    return fail("Describe the Dit you want", 400);
  }
  if (prompt.length > MAX_PROMPT) {
    return fail(`Keep it under ${MAX_PROMPT} characters`, 400);
  }

  const limit = checkRateLimit(clientIp(request));
  if (!limit.ok) {
    return fail("Too many Dits at once. Try again in a minute", 429, {
      "Retry-After": String(limit.retryAfter),
    });
  }

  const store = getStore();
  const today = dayKey();

  if ((await store.countForDay(today)) >= DAILY_CAP) {
    return fail("The Realm has hit its daily limit. Try again tomorrow", 429);
  }

  let image: Buffer;
  try {
    const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

    const response = await client.images.edit({
      model: process.env.DIT_MODEL ?? "gpt-image-2",
      image: await toFile(fs.createReadStream(REFERENCE), "thedit.png", {
        type: "image/png",
      }),
      prompt: [
        "This is The Dit: a small, round, matte-yellow vinyl figure with a large",
        "smooth head, simple black dot eyes and a thin neutral mouth.",
        "Create a new version of this exact character, keeping its body shape,",
        "proportions and yellow colour identical. Photograph it as a collectible",
        "vinyl toy, full body, centred, on a plain neutral studio backdrop with",
        "soft even lighting, matching the reference photo's style.",
        `The new version: ${prompt.trim()}`,
      ].join(" "),
      size: SIZE as "1024x1536",
      quality: QUALITY as "low",
      n: 1,
    });

    const encoded = response.data?.[0]?.b64_json;
    if (!encoded) return fail("The Dit didn't come out. Try again", 502);

    image = Buffer.from(encoded, "base64");
  } catch (error) {
    const code =
      error && typeof error === "object" && "code" in error
        ? String((error as { code: unknown }).code)
        : "";

    if (code === "moderation_blocked") {
      return fail("That request was blocked. Try describing something else", 400);
    }

    console.error("Dit generation failed", error);
    return fail("The Dit didn't come out. Try again", 502);
  }

  try {
    const dit = await store.save(
      {
        id: crypto.randomUUID(),
        prompt: prompt.trim(),
        createdAt: new Date().toISOString(),
      },
      image,
    );
    return Response.json({ dit }, { status: 201 });
  } catch (error) {
    console.error("Saving the Dit failed", error);
    return fail("The Dit was made but couldn't be saved", 500);
  }
}
