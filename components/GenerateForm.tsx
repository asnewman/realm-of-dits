"use client";

import Image from "next/image";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { MAX_DESCRIPTION, type PublicDit } from "@/lib/generated";

const MAX_PROMPT = 400;

type Draft = PublicDit;

export function GenerateForm({ enabled }: { enabled: boolean }) {
  const router = useRouter();
  const [prompt, setPrompt] = useState("");
  const [draft, setDraft] = useState<Draft | null>(null);
  const [description, setDescription] = useState("");
  const [busy, setBusy] = useState<false | "generating" | "saving" | "discarding">(
    false,
  );
  const [error, setError] = useState<string | null>(null);

  if (!enabled) return null;

  async function generate(event: React.FormEvent) {
    event.preventDefault();
    if (busy || !prompt.trim()) return;

    setBusy("generating");
    setError(null);

    try {
      const response = await fetch("/api/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prompt }),
      });
      const body = await response.json().catch(() => ({}));

      if (!response.ok) {
        setError(body.error ?? "The Dit didn't come out. Try again");
        return;
      }

      setDraft(body.dit);
      // The prompt is the obvious first draft of a description.
      setDescription(prompt.trim().slice(0, MAX_DESCRIPTION));
    } catch {
      setError("The Dit didn't come out. Try again");
    } finally {
      setBusy(false);
    }
  }

  async function save(event: React.FormEvent) {
    event.preventDefault();
    if (busy || !draft || !description.trim()) return;

    setBusy("saving");
    setError(null);

    try {
      const response = await fetch(`/api/dits/${draft.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ description }),
      });
      const body = await response.json().catch(() => ({}));

      if (!response.ok) {
        setError(body.error ?? "Couldn't save that Dit");
        return;
      }

      setDraft(null);
      setPrompt("");
      setDescription("");
      router.refresh();
    } catch {
      setError("Couldn't save that Dit");
    } finally {
      setBusy(false);
    }
  }

  async function discard() {
    if (busy || !draft) return;

    setBusy("discarding");
    setError(null);

    try {
      await fetch(`/api/dits/${draft.id}`, { method: "DELETE" });
    } catch {
      // The draft is invisible to the gallery either way, so a failed cleanup
      // is not worth blocking on.
    } finally {
      setDraft(null);
      setDescription("");
      setBusy(false);
    }
  }

  if (draft) {
    return (
      <form className="generate review" onSubmit={save}>
        <div className="preview">
          <Image
            src={draft.url}
            alt={draft.prompt}
            width={512}
            height={768}
            unoptimized
          />
        </div>

        <div className="fields">
          <label htmlFor="description">Description</label>
          <input
            id="description"
            type="text"
            value={description}
            maxLength={MAX_DESCRIPTION}
            required
            autoFocus
            onChange={(event) => setDescription(event.target.value)}
            disabled={busy !== false}
          />
          <p className="hint">This Dit isn&apos;t in the realm until you save it.</p>

          <div className="row">
            <button type="submit" disabled={busy !== false || !description.trim()}>
              {busy === "saving" ? "Saving…" : "Save"}
            </button>
            <button
              type="button"
              className="ghost"
              onClick={discard}
              disabled={busy !== false}
            >
              {busy === "discarding" ? "Discarding…" : "Cancel"}
            </button>
          </div>

          {error && <p className="error">{error}</p>}
        </div>
      </form>
    );
  }

  return (
    <form className="generate" onSubmit={generate}>
      <label htmlFor="prompt">Make a new Dit</label>
      <div className="row">
        <input
          id="prompt"
          type="text"
          value={prompt}
          maxLength={MAX_PROMPT}
          placeholder="a Dit in a chef's hat holding a tiny pan"
          onChange={(event) => setPrompt(event.target.value)}
          disabled={busy !== false}
        />
        <button type="submit" disabled={busy !== false || !prompt.trim()}>
          {busy === "generating" ? "Making it…" : "Generate"}
        </button>
      </div>
      {busy === "generating" && <p className="hint">This takes up to a minute.</p>}
      {error && <p className="error">{error}</p>}
    </form>
  );
}
