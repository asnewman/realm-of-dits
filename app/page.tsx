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

  return (
    <main>
      <header className="masthead">
        <h1>Realm of Dits</h1>
        <p>Every Dit, ready to copy. Select one to copy it to the clipboard.</p>
      </header>

      <GenerateForm
        enabled={Boolean(process.env.OPENAI_API_KEY) && storageReady()}
      />

      {generated.length > 0 && (
        <section className="section">
          <h2>Made by the realm</h2>
          <div className="grid">
            {generated.map((dit) => (
              <DitCard
                key={dit.id}
                name={dit.prompt}
                description={new Date(dit.createdAt).toLocaleDateString()}
                src={dit.url}
                copySrc={copySrc(dit.url)}
              />
            ))}
          </div>
        </section>
      )}

      <section className="section">
        <h2>The originals</h2>
        <div className="grid">
          {dits.map((dit, index) => (
            <DitCard
              key={dit.slug}
              name={dit.name}
              description={dit.description}
              src={dit.file}
              priority={index === 0}
            />
          ))}
        </div>
      </section>

      <footer className="footer">
        <p>{dits.length + generated.length} Dits and counting</p>
      </footer>
    </main>
  );
}
