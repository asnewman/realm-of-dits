"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

const MAX_PROMPT = 400;

export function GenerateForm({ enabled }: { enabled: boolean }) {
  const router = useRouter();
  const [prompt, setPrompt] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (busy || !prompt.trim()) return;

    setBusy(true);
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

      setPrompt("");
      router.refresh();
    } catch {
      setError("The Dit didn't come out. Try again");
    } finally {
      setBusy(false);
    }
  }

  if (!enabled) return null;

  return (
    <form className="generate" onSubmit={submit}>
      <label htmlFor="prompt">Make a new Dit</label>
      <div className="row">
        <input
          id="prompt"
          type="text"
          value={prompt}
          maxLength={MAX_PROMPT}
          placeholder="a Dit in a chef's hat holding a tiny pan"
          onChange={(event) => setPrompt(event.target.value)}
          disabled={busy}
        />
        <button type="submit" disabled={busy || !prompt.trim()}>
          {busy ? "Making it…" : "Generate"}
        </button>
      </div>
      {busy && <p className="hint">This takes up to a minute.</p>}
      {error && <p className="error">{error}</p>}
    </form>
  );
}
