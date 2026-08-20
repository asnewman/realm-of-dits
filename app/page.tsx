import { DitCard } from "@/components/DitCard";
import { GenerateForm } from "@/components/GenerateForm";
import { dits } from "@/lib/dits";
import { toPublic } from "@/lib/generated";
import { currentOwner } from "@/lib/owner";
import { getStore, storageReady } from "@/lib/storage";

// Generated Dits land in storage, so the gallery is rendered per request.
export const dynamic = "force-dynamic";

/** Remote Dits are copied through our own origin to keep the clipboard happy. */
function copySrc(url: string) {
  return url.startsWith("http") ? `/api/image?u=${encodeURIComponent(url)}` : url;
}

export default async function Home() {
  const owner = await currentOwner();
  const saved = await getStore()
    .listSaved()
    .catch(() => []);
  const generated = saved.map((dit) => toPublic(dit, owner));

  // Generated Dits join the end of the same list as the originals.
  const gallery = [
    ...dits.map((dit) => ({
      key: dit.slug,
      name: dit.name,
      description: dit.description,
      src: dit.file,
      copySrc: dit.file,
      deletableId: undefined as string | undefined,
    })),
    ...generated.map((dit) => ({
      key: dit.id,
      name: dit.name,
      // Dits saved before descriptions existed fall back to their date.
      description:
        dit.description || new Date(dit.createdAt).toLocaleDateString(),
      src: dit.url,
      copySrc: copySrc(dit.url),
      deletableId: dit.mine ? dit.id : undefined,
    })),
  ];

  return (
    <main>
      <header className="masthead">
        <h1>Realm of Dits</h1>
        <p>Every Dit, ready to copy. Select one to copy it to the clipboard.</p>
      </header>

      <GenerateForm
        enabled={Boolean(process.env.OPENAI_API_KEY) && storageReady()}
      />

      <div className="grid">
        {gallery.map((dit, index) => (
          <DitCard
            key={dit.key}
            name={dit.name}
            description={dit.description}
            src={dit.src}
            copySrc={dit.copySrc}
            deletableId={dit.deletableId}
            priority={index === 0}
          />
        ))}
      </div>

      <footer className="footer">
        <p>{gallery.length} Dits and counting</p>
      </footer>
    </main>
  );
}
