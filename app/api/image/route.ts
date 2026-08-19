/**
 * Same-origin proxy for generated Dits.
 *
 * The clipboard path fetches the PNG before writing it, and a cross-origin
 * blob host would need permissive CORS for that to work. Serving the bytes from
 * our own origin sidesteps it. Only the blob host is proxied, so this can't be
 * used as an open relay.
 */
const ALLOWED_HOST = /(^|\.)public\.blob\.vercel-storage\.com$/;

export async function GET(request: Request) {
  const target = new URL(request.url).searchParams.get("u");
  if (!target) return new Response("Missing image", { status: 400 });

  let parsed: URL;
  try {
    parsed = new URL(target);
  } catch {
    return new Response("Bad image", { status: 400 });
  }

  if (parsed.protocol !== "https:" || !ALLOWED_HOST.test(parsed.hostname)) {
    return new Response("Bad image", { status: 400 });
  }

  const upstream = await fetch(parsed, { cache: "force-cache" });
  if (!upstream.ok || !upstream.body) {
    return new Response("Not found", { status: 404 });
  }

  return new Response(upstream.body, {
    headers: {
      "Content-Type": "image/png",
      "Cache-Control": "public, max-age=31536000, immutable",
    },
  });
}
