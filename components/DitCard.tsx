"use client";

import Image from "next/image";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { copyImageToClipboard } from "@/lib/copyImage";

type CopyState = "idle" | "copied" | "error";

const labels: Record<CopyState, string> = {
  idle: "Copy image",
  copied: "Copied",
  error: "Couldn't copy",
};

export type DitCardProps = {
  name: string;
  description: string;
  src: string;
  /** Where the clipboard reads bytes from, if that differs from the display src. */
  copySrc?: string;
  priority?: boolean;
  /** Generated Dits are served from blob storage and can't be optimized locally. */
  unoptimized?: boolean;
  /** Set only on generated Dits this visitor made, which they can remove. */
  deletableId?: string;
};

export function DitCard({
  name,
  description,
  src,
  copySrc,
  priority,
  unoptimized,
  deletableId,
}: DitCardProps) {
  const router = useRouter();
  const [state, setState] = useState<CopyState>("idle");
  const [confirming, setConfirming] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const armed = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => {
      if (timer.current) clearTimeout(timer.current);
      if (armed.current) clearTimeout(armed.current);
    };
  }, []);

  /** Deleting is irreversible, so the button disarms itself if left alone. */
  function arm() {
    setConfirming(true);
    if (armed.current) clearTimeout(armed.current);
    armed.current = setTimeout(() => setConfirming(false), 3000);
  }

  async function copy() {
    if (timer.current) clearTimeout(timer.current);
    try {
      await copyImageToClipboard(copySrc ?? src);
      setState("copied");
    } catch {
      setState("error");
    }
    timer.current = setTimeout(() => setState("idle"), 2000);
  }

  async function remove() {
    if (!deletableId || deleting) return;
    if (armed.current) clearTimeout(armed.current);
    setDeleting(true);
    try {
      const response = await fetch(`/api/dits/${deletableId}`, {
        method: "DELETE",
      });
      if (!response.ok && response.status !== 404) {
        setDeleting(false);
        setConfirming(false);
        return;
      }
      router.refresh();
    } catch {
      setDeleting(false);
      setConfirming(false);
    }
  }

  return (
    <figure className="card">
      <button
        type="button"
        className="frame"
        onClick={copy}
        aria-label={`Copy ${name} to the clipboard`}
      >
        <Image
          src={src}
          alt={name}
          fill
          priority={priority}
          unoptimized={unoptimized}
          sizes="(max-width: 600px) 90vw, (max-width: 1000px) 44vw, 300px"
        />
      </button>

      <figcaption className="meta">
        <div className="text">
          <h3>{name}</h3>
          <p>{description}</p>
        </div>
        <div className="actions">
          <button type="button" className="copy" data-state={state} onClick={copy}>
            {labels[state]}
          </button>

          {deletableId && (
            <button
              type="button"
              className="remove"
              data-confirming={confirming || undefined}
              disabled={deleting}
              onClick={() => (confirming ? remove() : arm())}
              onBlur={() => setConfirming(false)}
              aria-label={confirming ? `Confirm deleting ${name}` : `Delete ${name}`}
            >
              {deleting ? "Deleting…" : confirming ? "Sure?" : "Delete"}
            </button>
          )}
        </div>
      </figcaption>
    </figure>
  );
}
