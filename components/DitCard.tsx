"use client";

import Image from "next/image";
import { useEffect, useRef, useState } from "react";
import type { Dit } from "@/lib/dits";
import { copyImageToClipboard } from "@/lib/copyImage";

type CopyState = "idle" | "copied" | "error";

const labels: Record<CopyState, string> = {
  idle: "Copy image",
  copied: "Copied",
  error: "Couldn't copy",
};

export function DitCard({ dit, priority }: { dit: Dit; priority?: boolean }) {
  const [state, setState] = useState<CopyState>("idle");
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => {
      if (timer.current) clearTimeout(timer.current);
    };
  }, []);

  async function copy() {
    if (timer.current) clearTimeout(timer.current);
    try {
      await copyImageToClipboard(dit.file);
      setState("copied");
    } catch {
      setState("error");
    }
    timer.current = setTimeout(() => setState("idle"), 2000);
  }

  return (
    <figure className="card">
      <button
        type="button"
        className="frame"
        onClick={copy}
        aria-label={`Copy ${dit.name} to the clipboard`}
      >
        <Image
          src={dit.file}
          alt={dit.name}
          width={1122}
          height={1402}
          priority={priority}
          sizes="(max-width: 600px) 90vw, (max-width: 1000px) 44vw, 300px"
        />
      </button>

      <figcaption className="meta">
        <div className="text">
          <h2>{dit.name}</h2>
          <p>{dit.description}</p>
        </div>
        <button
          type="button"
          className="copy"
          data-state={state}
          onClick={copy}
        >
          {labels[state]}
        </button>
      </figcaption>
    </figure>
  );
}
