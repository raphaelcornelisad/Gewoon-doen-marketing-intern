import type { Metadata } from "next";

export const metadata: Metadata = { title: "Controlepagina · Gewoon Doen Marketing" };

// Tijdelijk: de controlepagina (met login voor de admin) wordt in stap 3 gebouwd.
// Hier staat bewust geen indieningsdata, zodat niemand zonder login iets kan zien.
export default function ControlepaginaPlaceholder() {
  return (
    <section className="thanks">
      <h1>Controlepagina komt eraan</h1>
      <p>
        De indiening is opgeslagen. De controlepagina met tellingen, correcties en de knop Goedkeuren is nog in
        aanbouw. Tot die tijd staat alles wat je nodig hebt in de controlemail.
      </p>
    </section>
  );
}
