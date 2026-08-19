/**
 * Copies a PNG at `src` onto the clipboard as an image.
 *
 * Safari only honors `clipboard.write` when the `ClipboardItem` is built
 * synchronously inside the user gesture, so the fetch is handed over as a
 * promise first and only awaited if that path throws.
 */
export async function copyImageToClipboard(src: string): Promise<void> {
  if (typeof ClipboardItem === "undefined" || !navigator.clipboard?.write) {
    throw new Error("Clipboard images aren't supported in this browser");
  }

  const blob = fetch(src).then(async (response) => {
    if (!response.ok) {
      throw new Error(`Failed to load ${src}`);
    }
    const data = await response.blob();
    return data.type === "image/png"
      ? data
      : new Blob([data], { type: "image/png" });
  });

  try {
    await navigator.clipboard.write([new ClipboardItem({ "image/png": blob })]);
  } catch {
    await navigator.clipboard.write([
      new ClipboardItem({ "image/png": await blob }),
    ]);
  }
}
