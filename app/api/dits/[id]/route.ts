import { MAX_DESCRIPTION, MAX_NAME, toPublic } from "@/lib/generated";
import { currentOwner } from "@/lib/owner";
import { getStore } from "@/lib/storage";

export const runtime = "nodejs";

type Context = { params: Promise<{ id: string }> };

function fail(message: string, status: number) {
  return Response.json({ error: message }, { status });
}

/**
 * Only the visitor who generated a Dit can save or remove it. A missing record
 * and someone else's record both answer 404, so this can't be used to probe for
 * which ids exist.
 */
async function ownDit(id: string) {
  const owner = await currentOwner();
  if (!owner) return { owner: null, dit: null };

  const dit = await getStore().get(id);
  if (!dit || dit.owner !== owner) return { owner, dit: null };

  return { owner, dit };
}

/** Saves a draft into the gallery, or edits the text of a saved Dit. */
export async function PATCH(request: Request, { params }: Context) {
  const { id } = await params;

  let body: { name?: unknown; description?: unknown };
  try {
    body = await request.json();
  } catch {
    return fail("Add a name and a description", 400);
  }

  const { name, description } = body;

  if (typeof name !== "string" || !name.trim()) {
    return fail("Add a name", 400);
  }
  if (name.trim().length > MAX_NAME) {
    return fail(`Keep the name under ${MAX_NAME} characters`, 400);
  }
  if (typeof description !== "string" || !description.trim()) {
    return fail("Add a description", 400);
  }
  if (description.trim().length > MAX_DESCRIPTION) {
    return fail(`Keep the description under ${MAX_DESCRIPTION} characters`, 400);
  }

  const { owner, dit } = await ownDit(id);
  if (!dit) return fail("That Dit is gone", 404);

  const saved = {
    ...dit,
    name: name.trim(),
    description: description.trim(),
    draft: false,
  };
  await getStore().publish(saved);

  return Response.json({ dit: toPublic(saved, owner) });
}

/** Cancels a draft or deletes a saved Dit. Same operation either way. */
export async function DELETE(_request: Request, { params }: Context) {
  const { id } = await params;

  const { dit } = await ownDit(id);
  if (!dit) return fail("That Dit is gone", 404);

  await getStore().remove(dit);

  return new Response(null, { status: 204 });
}
