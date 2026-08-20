import { DitCard } from "@/components/DitCard";
import { GenerateForm } from "@/components/GenerateForm";
import { dits } from "@/lib/dits";
import { getStore, storageReady } from "@/lib/storage";

// Generated Dits land in storage, so the gallery is rendered per request.
export const dynamic = "force-dynamic";

/** Remote Dits are copied through our own origin to keep the clipboard happy. */
function copySrc(url: string) {
  return url.startsWith("http") ? `/api/image?u=${encodeURIComponent(url)}` : url;
}

export default async function Home() {
  const generated = await getStore()
    .list()
    .catch(() => []);

  // Generated Dits join the end of the same list as the originals.
  const gallery = [
    ...dits.map((dit) => ({
      key: dit.slug,
      name: dit.name,
      description: dit.description,
      src: dit.file,
      copySrc: dit.file,
    })),
    ...generated.map((dit) => ({
      key: dit.id,
      name: dit.prompt,
      description: new Date(dit.createdAt).toLocaleDateString(),
      src: dit.url,
      copySrc: copySrc(dit.url),
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
