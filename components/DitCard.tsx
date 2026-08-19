"use client";

import Image from "next/image";
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
};

export function DitCard({
  name,
  description,
  src,
  copySrc,
  priority,
  unoptimized,
}: DitCardProps) {
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
      await copyImageToClipboard(copySrc ?? src);
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
        <button type="button" className="copy" data-state={state} onClick={copy}>
          {labels[state]}
        </button>
      </figcaption>
    </figure>
  );
}
