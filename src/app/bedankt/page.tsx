import type { Metadata } from "next";

export const metadata: Metadata = { title: "Bedankt · Gewoon Doen Marketing" };

export default function BedanktPage() {
  return (
    <section className="thanks">
      <div className="thanks__mark" aria-hidden="true">✓</div>
      <h1>Bedankt!</h1>
      <p>
        Hartelijk dank voor het indienen van je lijst. We komen binnen 24–48 uur bij je terug. Na controle wordt
        je commissie uitgekeerd.
      </p>
    </section>
  );
}
