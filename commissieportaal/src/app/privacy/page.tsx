import type { Metadata } from "next";

export const metadata: Metadata = { title: "Privacyverklaring · Gewoon Sales Doen", robots: { index: true, follow: true } };

/** Openbare privacyverklaring (nodig voor de Google-koppeling). */
export default function Privacy() {
  return (
    <article className="hero" style={{ maxWidth: 760 }}>
      <p className="eyebrow">Gewoon Doen Marketing</p>
      <h1>Privacyverklaring Gewoon Sales Doen</h1>
      <p className="lead">Gewoon Sales Doen is het interne CRM van Gewoon Doen Marketing voor medewerkers (setters en salesmedewerkers). Deze verklaring legt uit welke gegevens de app gebruikt en waarvoor.</p>
      <h2>Welke gegevens</h2>
      <ul>
        <li>Van medewerkers: naam, e-mailadres en, indien opgegeven, telefoonnummer, om in te loggen en het werk te registreren.</li>
        <li>Van zakelijke leads: bedrijfsnaam, contactpersoon, telefoonnummer, e-mailadres, plaats en de contactgeschiedenis (belpogingen, notities, afspraken).</li>
      </ul>
      <h2>Google Agenda</h2>
      <p>Als een medewerker zijn Google Agenda koppelt, gebruikt de app alleen de toestemming om <strong>afspraken in de agenda aan te maken, bij te werken en te verwijderen</strong>. Zo komen terugbelmomenten en taken uit het CRM met een herinnering in de eigen agenda. De app leest geen andere afspraken, deelt geen agendagegevens met derden en gebruikt ze niet voor advertenties. Het e-mailadres van het Google-account wordt alleen opgeslagen om te tonen welk account gekoppeld is.</p>
      <p>De koppeling is altijd in te trekken via Koppelingen → Ontkoppelen in het CRM, of via <a href="https://myaccount.google.com/permissions">myaccount.google.com/permissions</a>. De opgeslagen toegang wordt dan verwijderd.</p>
      <p>Het gebruik van gegevens uit Google API&apos;s voldoet aan de <a href="https://developers.google.com/terms/api-services-user-data-policy">Google API Services User Data Policy</a>, inclusief de eisen voor beperkt gebruik (Limited Use).</p>
      <h2>Bewaren en beveiliging</h2>
      <p>Gegevens worden opgeslagen bij onze verwerkers Supabase (database, EU) en Vercel (hosting). Toegangssleutels van gekoppelde accounts worden versleuteld opgeslagen. Gegevens worden niet langer bewaard dan nodig voor het werk.</p>
      <h2>Contact</h2>
      <p>Vragen of een verzoek om inzage of verwijdering: <a href="mailto:raphaelcornelis@gewoondoenmarketing.nl">raphaelcornelis@gewoondoenmarketing.nl</a>.</p>
      <p className="small muted">Laatst bijgewerkt: 22 oktober 2026.</p>
    </article>
  );
}
