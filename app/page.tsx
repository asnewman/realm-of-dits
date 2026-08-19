import { DitCard } from "@/components/DitCard";
import { dits } from "@/lib/dits";

export default function Home() {
  return (
    <main>
      <header className="masthead">
        <h1>Realm of Dits</h1>
        <p>Every Dit, ready to copy. Select one to copy it to the clipboard.</p>
      </header>

      <div className="grid">
        {dits.map((dit, index) => (
          <DitCard key={dit.slug} dit={dit} priority={index === 0} />
        ))}
      </div>

      <footer className="footer">
        <p>{dits.length} Dits and counting</p>
      </footer>
    </main>
  );
}
