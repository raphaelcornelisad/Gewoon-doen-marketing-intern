import type { Metadata } from "next";
import { CrmBar } from "@/components/crm/crm-bar";
import { IgBoard, type IgCard } from "@/components/crm/ig-board";
import { requireCrmUser } from "@/lib/crm/server";
import { IG_PIJPLIJN, IG_TEGELS, tegelWaarde } from "@/lib/ig/core";
import { igThreads, laatsteIgDag, laatsteIgSync, magIgBewerken } from "@/lib/ig/server";

export const metadata: Metadata = { title: "Instagram · CRM" };
export const dynamic = "force-dynamic";

const datum = (d: string) => new Date(`${d}T12:00:00Z`).toLocaleDateString("nl-NL", { timeZone: "Europe/Amsterdam", weekday: "long", day: "numeric", month: "long" });
const tijdstip = (iso: string) => new Date(iso).toLocaleString("nl-NL", { timeZone: "Europe/Amsterdam", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });

/** Setter-pijplijn voor Instagram-DM's: kolommen per fase, cijfers van de laatste rapportdag bovenaan. */
export default async function Instagram() {
  const user = await requireCrmUser();
  const [threads, dag, sync] = await Promise.all([igThreads(), laatsteIgDag(), laatsteIgSync()]);
  const nu = new Date();
  const cards: IgCard[] = threads.map((t) => ({
    id: t.id,
    fase: t.fase,
    gebruikersnaam: t.lead_gebruikersnaam,
    laatsteTekst: t.laatste_tekst,
    laatsteVan: t.laatste_van === "wij" || t.laatste_van === "lead" ? t.laatste_van : null,
    laatsteOp: t.laatste_bericht_op,
    wachtSinds: t.wacht_op_ons_sinds,
    handmatig: t.fase_bron === "handmatig",
    bestaandeKlant: t.bestaande_klant,
  }));
  const bewerkbaar = magIgBewerken(user);

  return (
    <>
      <CrmBar user={user} actief="/crm/instagram" />
      <div className="crm-toolbar">
        <div>
          <h1>Instagram</h1>
          <p className="lead">
            {bewerkbaar
              ? "DM-gesprekken van Instagram per fase. Sleep een gesprek naar een andere fase; die keuze blijft staan, ook na de volgende sync. Antwoorden gaat via Instagram."
              : "DM-gesprekken van Instagram per fase. Alleen lezen."}
          </p>
        </div>
        <span className="small muted">{sync ? `Laatste sync: ${tijdstip(sync.gestart_op)}${sync.fouten ? " (mislukt)" : ""}` : "Nog geen sync ontvangen."}</span>
      </div>

      <section className="crm-form">
        <h2 style={{ margin: 0 }}>
          Dagcijfers <span className="small muted">{dag ? `rapportdag ${datum(dag.rapportdag)} (08:00 tot 08:00)` : "nog geen rapportdag"}</span>
        </h2>
        {dag && (
          <div className="crm-tegels">
            {IG_TEGELS.map((t) => (
              <div key={t.key} className="card crm-tegel">
                <span className="small muted">{t.label}</span>
                <span className={dag[t.key] === null || dag[t.key] === undefined ? "small muted" : "crm-tegel__waarde"}>{tegelWaarde(dag[t.key], t.pct)}</span>
              </div>
            ))}
          </div>
        )}
      </section>

      <p className="small muted">{cards.length} gesprekken (intern en spam niet getoond)</p>
      <IgBoard fases={IG_PIJPLIJN.map((f) => ({ key: f.key, label: f.label }))} cards={cards} bewerkbaar={bewerkbaar} nuIso={nu.toISOString()} />
    </>
  );
}
