import type { Metadata } from "next";

export const metadata: Metadata = { title: "Inloggen · Gewoon Sales Doen" };
export const dynamic = "force-dynamic";

/** Tussenstap uit de inlogmail: pas met deze klik wordt de eenmalige link gebruikt (scanners klikken niet op knoppen). */
export default async function Bevestig({ searchParams }: { searchParams: Promise<{ rol?: string; token_hash?: string }> }) {
  const sp = await searchParams;
  const actie = sp.rol === "admin" ? "/api/admin/callback" : "/api/acquisitie/callback";
  return (
    <>
      <section className="hero">
        <p className="eyebrow">Gewoon Sales Doen</p>
        <h1>Inloggen</h1>
        <p className="lead">Klik op de knop om in te loggen.</p>
      </section>
      {sp.token_hash ? (
        <form method="post" action={actie} className="form">
          <input type="hidden" name="token_hash" value={sp.token_hash} />
          <button type="submit" className="button">Inloggen</button>
        </form>
      ) : (
        <div className="alert">Ongeldige inloglink. <a href="/crm/login">Vraag een nieuwe aan.</a></div>
      )}
    </>
  );
}
