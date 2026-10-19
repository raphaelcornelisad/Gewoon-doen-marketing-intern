import Link from "next/link";
import { Board, type BoardCard } from "@/components/crm/board";
import { CrmBar } from "@/components/crm/crm-bar";
import { Filters } from "@/components/crm/filters";
import { acqSetters } from "@/lib/acquisitie/server";
import { formatEuro } from "@/lib/commission";
import { FASES, type Pijplijn } from "@/lib/crm/core";
import { filterCards, filterOptions, loadCards, requireCrmUser, type BoardFilter } from "@/lib/crm/server";
import { afspraakTekst } from "./format";

export type SP = Promise<Record<string, string | undefined>>;

export async function BoardPage({ pijplijn, searchParams }: { pijplijn: Pijplijn; searchParams: SP }) {
  const user = await requireCrmUser();
  const sp = await searchParams;
  const f: BoardFilter = { q: sp.q, behandeling: sp.behandeling, stad: sp.stad, provincie: sp.provincie, setter: sp.setter, mijn: sp.mijn === "1" };
  const [alle, setters] = await Promise.all([loadCards(pijplijn, user), acqSetters()]);
  const naam = new Map(setters.map((s) => [s.id, s.naam]));
  const cards = filterCards(alle, f, user);
  const path = `/crm/${pijplijn}`;

  const board: BoardCard[] = cards.map((c) => {
    const k = c.contact;
    const wie = pijplijn === "sales" ? c.setter_id : k.eigenaar_id;
    return {
      id: c.id,
      contactId: k.id,
      fase: c.fase,
      salon: k.salon_naam,
      sub: [k.contactpersoon, k.stad && (k.provincie ? `${k.stad} (${k.provincie})` : k.stad)].filter(Boolean).join(" · "),
      behandelingen: k.behandelingen,
      waarde: c.waarde_cents ? formatEuro(c.waarde_cents) : null,
      tag: wie ? (naam.get(wie) ?? null) : null,
      afspraak: pijplijn === "sales" ? afspraakTekst(c.afspraak_op) : null,
      vergrendeld: pijplijn === "sales" ? user.rol !== "admin" : user.rol === "setter" && !!k.eigenaar_id && k.eigenaar_id !== user.setter.id,
    };
  });
  const waardes = Object.fromEntries(
    FASES[pijplijn].map((x) => {
      const sum = cards.filter((c) => c.fase === x.key).reduce((s, c) => s + (c.waarde_cents ?? 0), 0);
      return [x.key, sum ? formatEuro(sum) : ""];
    }),
  );
  const titel = pijplijn === "outbound" ? "Outbound" : user.rol === "admin" ? "Sales" : "Mijn ingeplande leads";
  const intro =
    pijplijn === "outbound"
      ? "Sleep een lead naar de volgende fase, of open hem om te bellen en notities te maken. Een lead die jij oppakt, wordt van jou."
      : user.rol === "admin"
        ? "Alle ingeplande gesprekken. Vul na het gesprek de fase en de waarde in. Gewonnen met een setter-tag telt mee in haar commissie."
        : "Leads die jij hebt ingepland en wat ermee gebeurt na het gesprek.";

  return (
    <>
      <CrmBar user={user} actief={path} />
      <div className="crm-toolbar">
        <div>
          <h1>{titel}</h1>
          <p className="lead">{intro}</p>
        </div>
        {pijplijn === "outbound" && <Link href="/crm/nieuw" className="button button--small">+ Lead toevoegen</Link>}
      </div>
      <Filters action={path} f={f} opties={filterOptions(alle)} setters={user.rol === "admin" ? setters : undefined} toonMijn={user.rol === "setter" && pijplijn === "outbound"} />
      <p className="small muted">{cards.length} van {alle.length} leads</p>
      <Board fases={FASES[pijplijn]} cards={board} waardes={waardes} />
    </>
  );
}
