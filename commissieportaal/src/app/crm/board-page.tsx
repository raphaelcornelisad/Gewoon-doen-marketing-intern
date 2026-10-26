import Link from "next/link";
import { Board, type BoardCard } from "@/components/crm/board";
import { CrmBar } from "@/components/crm/crm-bar";
import { Filters } from "@/components/crm/filters";
import { acqSetters } from "@/lib/acquisitie/server";
import { formatEuro } from "@/lib/commission";
import { faseLabel, fasesVoor, type Pijplijn } from "@/lib/crm/core";
import { all, filterCards, filterOptions, loadCards, requireCrmUser, views, type BoardFilter, type Card } from "@/lib/crm/server";
import { huidigeWerkruimte } from "@/lib/crm/werkruimte";
import { db } from "@/lib/supabase/server";
import { afspraakTekst } from "./format";

export type SP = Promise<Record<string, string | undefined>>;

const WEERGAVEN = ["vandaag", "achterstallig", "nieuw", "mijn", "vrij"] as const;
const kort = (iso: string | null) => (iso ? new Date(iso).toLocaleString("nl-NL", { timeZone: "Europe/Amsterdam", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }) : null);

export async function BoardPage({ pijplijn, searchParams }: { pijplijn: Pijplijn; searchParams: SP }) {
  const user = await requireCrmUser();
  const sp = await searchParams;
  const f: BoardFilter = {
    q: sp.q,
    tag: sp.tag,
    type: sp.type,
    behandeling: sp.behandeling,
    stad: sp.stad,
    provincie: sp.provincie,
    setter: sp.setter,
    weergave: WEERGAVEN.find((w) => w === sp.weergave),
    heeft: sp.heeft === "telefoon" || sp.heeft === "website" || sp.heeft === "email" ? sp.heeft : undefined,
  };
  const tabel = sp.toon === "tabel";
  const gesprekken = sp.toon === "gesprekken";
  const [alle, setters, mijnViews] = await Promise.all([loadCards(pijplijn, user), acqSetters(), views(user)]);
  const naam = new Map(setters.map((s) => [s.id, s.naam]));
  const opties = filterOptions(alle);
  const cards = filterCards(alle, f, user);
  const path = `/crm/${pijplijn}`;

  // Volgende afspraak per lead (sales).
  const afspraken = new Map<string, { start_op: string; status: string; type: string }>();
  if (pijplijn === "sales" && cards.length) {
    const ids = cards.map((c) => c.contact_id);
    for (let i = 0; i < ids.length; i += 300) {
      const { data } = await db().from("crm_appointments").select("contact_id, start_op, status, type").in("contact_id", ids.slice(i, i + 300)).neq("status", "verplaatst").order("start_op", { ascending: false });
      for (const a of (data ?? []) as { contact_id: string; start_op: string; status: string; type: string }[]) if (!afspraken.has(a.contact_id)) afspraken.set(a.contact_id, a);
    }
  }

  // Notities per lead: aantal en de laatste (voor de preview op de kaart).
  const notities = new Map<string, { aantal: number; laatste: { tekst: string; door: string | null; created_at: string } }>();
  if (!gesprekken && cards.length) {
    const ids = cards.map((c) => c.contact_id);
    for (let i = 0; i < ids.length; i += 300) {
      const rows = await all<{ contact_id: string; tekst: string; door: string | null; created_at: string }>((f, t) =>
        db().from("crm_activities").select("contact_id, tekst, door, created_at").eq("type", "notitie").in("contact_id", ids.slice(i, i + 300)).order("created_at", { ascending: false }).order("id").range(f, t),
      );
      for (const n of rows) {
        const g = notities.get(n.contact_id) ?? { aantal: 0, laatste: n };
        g.aantal++;
        notities.set(n.contact_id, g);
      }
    }
  }

  // Open taken per lead (badge op het taakicoon).
  const taken = new Map<string, number>();
  if (!gesprekken && cards.length) {
    const ids = cards.map((c) => c.contact_id);
    for (let i = 0; i < ids.length; i += 300) {
      const rows = await all<{ contact_id: string }>((f, t) => db().from("crm_tasks").select("contact_id").is("gedaan_op", null).in("contact_id", ids.slice(i, i + 300)).order("id").range(f, t));
      for (const r of rows) taken.set(r.contact_id, (taken.get(r.contact_id) ?? 0) + 1);
    }
  }

  // Gesprekken (WhatsApp/sms) van de leads in deze pijplijn.
  const berichten = new Map<string, { laatste: { tekst: string; richting: string; kanaal: string; status: string; created_at: string }; aantal: number; open: number }>();
  if (gesprekken && cards.length) {
    const ids = cards.map((c) => c.contact_id);
    for (let i = 0; i < ids.length; i += 300) {
      const { data } = await db().from("crm_messages").select("contact_id, tekst, richting, kanaal, status, created_at, gelezen_door_team").in("contact_id", ids.slice(i, i + 300)).order("created_at", { ascending: false }).limit(5000);
      for (const m of (data ?? []) as { contact_id: string; tekst: string; richting: string; kanaal: string; status: string; created_at: string; gelezen_door_team: boolean }[]) {
        const g = berichten.get(m.contact_id) ?? { laatste: m, aantal: 0, open: 0 };
        g.aantal++;
        if (m.richting === "in" && !m.gelezen_door_team) g.open++;
        berichten.set(m.contact_id, g);
      }
    }
  }

  const volgendeActie = (c: Card) => {
    const k = c.contact;
    if (k.niet_benaderen) return "Niet meer benaderen";
    if (pijplijn === "sales") {
      const a = afspraken.get(c.contact_id);
      return a ? `${a.type === "kennismaking" ? "Kennismaking" : "Salesgesprek"} ${afspraakTekst(a.start_op)} · ${a.status.replace("_", "-")}` : null;
    }
    if (k.volgende_opvolging_op) return `${new Date(k.volgende_opvolging_op).getTime() < Date.now() ? "⚠ " : ""}Opvolgen ${kort(k.volgende_opvolging_op)}`;
    if (c.fase === "nieuw") return "Nog niet gebeld";
    return null;
  };

  const board: BoardCard[] = cards.map((c) => {
    const k = c.contact;
    const wie = pijplijn === "sales" ? c.setter_id : k.eigenaar_id;
    return {
      id: c.id,
      contactId: k.id,
      fase: c.fase,
      salon: k.salon_naam,
      sub: [k.type_bedrijf, k.stad && (k.provincie ? `${k.stad} (${k.provincie})` : k.stad)].filter(Boolean).join(" · "),
      telefoon: k.telefoon_norm,
      behandelingen: k.behandelingen,
      tags: k.tags,
      waarde: c.waarde_cents ? formatEuro(c.waarde_cents) : null,
      wie: wie ? { id: wie, naam: naam.get(wie) ?? "?" } : null,
      afspraak: volgendeActie(c),
      belpogingen: k.belpogingen,
      notities: notities.get(k.id)?.aantal ?? 0,
      laatsteNotitie: notities.get(k.id)?.laatste ?? null,
      taken: taken.get(k.id) ?? 0,
      vergrendeld: pijplijn === "sales" ? !(user.rol === "admin" || (user.rol === "sales" && c.verkoper_id === user.setter.id) || (user.rol === "setter" && c.setter_id === user.setter.id)) : !(user.rol === "admin" || (user.rol === "setter" && (!k.eigenaar_id || k.eigenaar_id === user.setter.id))),
      bewerkbaar: user.rol === "admin" || (user.rol === "setter" && (!k.eigenaar_id || k.eigenaar_id === user.setter.id)),
    };
  });
  const crm = await huidigeWerkruimte();
  const fases = fasesVoor(pijplijn, crm.soort);
  const waardes = Object.fromEntries(
    fases.map((x) => {
      const sum = cards.filter((c) => c.fase === x.key).reduce((s, c) => s + (c.waarde_cents ?? 0), 0);
      return [x.key, sum ? formatEuro(sum) : ""];
    }),
  );
  const titel = pijplijn === "outbound" ? crm.naam : `${user.rol === "admin" ? "Call geboekt" : "Mijn geboekte calls"} · ${crm.naam}`;

  return (
    <>
      <CrmBar user={user} actief={path} />
      <div className="crm-toolbar">
        <div>
          <h1>{titel}</h1>
          <p className="lead">
            {pijplijn === "outbound"
              ? "Sleep een lead naar een andere fase of open hem. Bellen gaat het snelst via Bellen (automatische wachtrij)."
              : user.rol === "setter"
                ? "Leads die jij hebt ingepland, met de afspraakstatus en wat er na het gesprek gebeurt."
                : "Ingeplande leads. Registreer verschenen/no-show in de agenda of op de leadkaart; bij Offerte en Geaccepteerd vraagt het CRM de verplichte gegevens."}
          </p>
        </div>
        <span className="crm-toolbar__knoppen">
          {pijplijn === "outbound" && user.rol === "setter" && <Link href="/crm/bellen" className="button button--small crm-belknop">📞 Start belsessie</Link>}
          {pijplijn === "outbound" && user.rol !== "sales" && <Link href="/crm/nieuw" className="button button--small">+ Lead toevoegen</Link>}
        </span>
      </div>
      <Filters action={path} f={f} query={sp} opties={opties} setters={user.rol === "admin" ? setters : undefined} pijplijn={pijplijn} tabel={tabel} views={mijnViews.filter((v) => v.pijplijn === pijplijn)} />
      <p className="small muted">{cards.length} van {alle.length} leads</p>
      {gesprekken ? (
        <div className="crm-form">
          {fases.map((f) => {
            const rijen = cards.filter((c) => c.fase === f.key && berichten.has(c.contact_id)).sort((a, b) => berichten.get(b.contact_id)!.laatste.created_at.localeCompare(berichten.get(a.contact_id)!.laatste.created_at));
            if (!rijen.length) return null;
            return (
              <section key={f.key} className="card crm-form">
                <h2 style={{ margin: 0 }}>{f.label} <span className="muted small">{rijen.length} gesprekken</span></h2>
                {rijen.map((c) => {
                  const g = berichten.get(c.contact_id)!;
                  return (
                    <Link key={c.id} href={`/crm/inbox?lead=${c.contact_id}`} className="crm-gesprek">
                      <span className="crm-toolbar">
                        <strong>{c.contact.salon_naam}</strong>
                        <span className="small muted">
                          {kort(g.laatste.created_at)}
                          {g.open > 0 && <span className="crm-badge crm-badge--inline">{g.open}</span>}
                        </span>
                      </span>
                      <span className="small muted">
                        {g.laatste.kanaal === "whatsapp" ? "WhatsApp" : "Sms"} · {g.laatste.richting === "in" ? "← " : "→ "}
                        {g.laatste.tekst.slice(0, 120)} · {g.aantal} berichten
                      </span>
                    </Link>
                  );
                })}
              </section>
            );
          })}
          {berichten.size === 0 && <p className="muted">Nog geen gesprekken met leads in deze selectie.</p>}
        </div>
      ) : tabel ? (
        <div className="table-wrap card">
          <table className="table">
            <thead>
              <tr>
                <th>Salon</th>
                <th>Plaats</th>
                <th>Fase</th>
                <th>{pijplijn === "sales" ? "Setter (tag)" : "Eigenaar"}</th>
                <th>Volgende actie</th>
                <th className="num">Pogingen</th>
                <th className="num">Waarde</th>
                <th>Tags</th>
              </tr>
            </thead>
            <tbody>
              {board.slice(0, 1000).map((c) => (
                <tr key={c.id}>
                  <td><Link href={`/crm/lead/${c.contactId}`}>{c.salon}</Link></td>
                  <td>{c.sub}</td>
                  <td>{fases.find((x) => x.key === c.fase)?.label ?? faseLabel(pijplijn, c.fase)}</td>
                  <td>{c.wie?.naam ?? <span className="muted">–</span>}</td>
                  <td className="small">{c.afspraak ?? "–"}</td>
                  <td className="num">{c.belpogingen}</td>
                  <td className="num">{c.waarde ?? "–"}</td>
                  <td className="small">{c.tags.join(", ")}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {board.length > 1000 && <p className="small muted">Eerste 1000 getoond; gebruik de filters.</p>}
        </div>
      ) : (
        <Board
          pijplijn={pijplijn}
          fases={fases.filter((f) => f.key !== "klant")}
          cards={board}
          waardes={waardes}
          alleTags={opties.tags}
          setters={user.rol === "admin" ? setters.filter((x) => x.actief).map((x) => ({ id: x.id, naam: x.naam })) : null}
          rol={user.rol === "admin" ? "admin" : "setter"}
          mijnId={user.rol === "setter" ? user.setter.id : null}
        />
      )}
    </>
  );
}
