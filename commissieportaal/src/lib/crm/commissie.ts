/**
 * Commissiegrootboek (pure logica).
 *
 * Regels (huidige afspraak, per periode van de 14e tot de 14e, Europe/Amsterdam):
 * - Basisvergoeding per periode.
 * - Showvergoeding: één keer per lead, voor de eerste kennismaking waarop de lead echt verscheen,
 *   toegekend aan de setter die die afspraak heeft ingepland. Verplaatsen of een tweede gesprek telt niet extra.
 * - Bonus: één keer per periode bij minimaal X shows in die periode (bij 2X niet dubbel).
 * - Close: % van de definitieve dealwaarde (excl. btw) bij “Geaccepteerd”, voor de toegeschreven setter.
 *
 * Bedragen worden nooit stilzwijgend aangepast: een verschil na uitbetaling of goedkeuring wordt een correctieregel.
 */
import { acqPeriodFor, amsterdamDate, periodsFor } from "../acquisitie/period";

export interface Regels {
  basisCents: number;
  showCents: number;
  bonusDrempel: number;
  bonusCents: number;
  closePercentage: number;
}

export const regelVersie = (r: Regels) =>
  `v1: basis €${r.basisCents / 100}, show €${r.showCents / 100}, bonus €${r.bonusCents / 100} bij ${r.bonusDrempel}, close ${r.closePercentage}%`;

export interface SetterIn {
  id: string;
  start_datum: string;
  actief: boolean;
  rol: string;
}
export interface AfspraakIn {
  id: string;
  contact_id: string;
  type: "kennismaking" | "salesgesprek";
  status: string;
  start_op: string;
  setter_id: string | null;
}
export interface DealIn {
  id: string;
  contact_id: string;
  fase: string;
  waarde_cents: number | null;
  sluitdatum: string | null;
  setter_id: string | null;
}

export interface Regel {
  sleutel: string;
  setter_id: string;
  soort: "basis" | "show" | "bonus" | "close" | "correctie" | "uitbetaling";
  contact_id: string | null;
  opp_id: string | null;
  appointment_id: string | null;
  periode_start: string;
  datum: string;
  grondslag_cents: number | null;
  percentage: number | null;
  bedrag_cents: number;
  uitleg: string;
}

export interface Bestaand extends Regel {
  id: string;
  status: "verdiend" | "goedgekeurd" | "uitbetaald" | "vervallen";
  gecorrigeerd_van: string | null;
}

const euro = (c: number) => `€${(c / 100).toFixed(2).replace(".", ",")}`;
const periodeVan = (datum: string) => acqPeriodFor(new Date(`${datum}T12:00:00Z`)).start;

/** Alle periodes (start) vanaf de startdatum t/m de periode van `vandaag`, oudste eerst. */
const periodesTot = (start: string, vandaag: string) =>
  periodsFor({ start_datum: start }, new Date(`${vandaag}T12:00:00Z`)).map((p) => p.start).reverse();

/** Wat er volgens de regels in het grootboek hoort te staan (zonder correcties/uitbetalingen). */
export function gewenst(input: { setters: SetterIn[]; afspraken: AfspraakIn[]; deals: DealIn[]; regels: Regels; vandaag: string }): Regel[] {
  const { regels: r } = input;
  const out: Regel[] = [];
  // Alleen echte setters verdienen commissie (salesmedewerkers zoals Raphael niet).
  const setters = new Map(input.setters.filter((s) => s.rol === "setter").map((s) => [s.id, s]));

  for (const s of input.setters) {
    if (s.rol !== "setter" || !s.actief || !r.basisCents) continue;
    for (const p of periodesTot(s.start_datum, input.vandaag)) {
      out.push({ sleutel: `basis:${s.id}:${p}`, setter_id: s.id, soort: "basis", contact_id: null, opp_id: null, appointment_id: null, periode_start: p, datum: p < s.start_datum ? s.start_datum : p, grondslag_cents: null, percentage: null, bedrag_cents: r.basisCents, uitleg: "Vaste vergoeding per periode" });
    }
  }

  // Show: eerste verschenen kennismaking per lead.
  const eersteShow = new Map<string, AfspraakIn>();
  for (const a of [...input.afspraken].sort((x, y) => x.start_op.localeCompare(y.start_op))) {
    if (a.type !== "kennismaking" || a.status !== "verschenen") continue;
    if (!eersteShow.has(a.contact_id)) eersteShow.set(a.contact_id, a);
  }
  const showsPerPeriode = new Map<string, { datum: string; n: number }[]>();
  for (const a of eersteShow.values()) {
    const s = a.setter_id ? setters.get(a.setter_id) : null;
    const datum = amsterdamDate(a.start_op);
    if (!s || datum < s.start_datum) continue;
    const p = periodeVan(datum);
    out.push({ sleutel: `show:${a.contact_id}`, setter_id: s.id, soort: "show", contact_id: a.contact_id, opp_id: null, appointment_id: a.id, periode_start: p, datum, grondslag_cents: null, percentage: null, bedrag_cents: r.showCents, uitleg: `Verschenen bij kennismaking op ${datum}` });
    const k = `${s.id}|${p}`;
    showsPerPeriode.set(k, [...(showsPerPeriode.get(k) ?? []), { datum, n: 1 }]);
  }

  // Bonus: één keer per periode bij ≥ drempel shows.
  for (const [k, shows] of showsPerPeriode) {
    if (shows.length < r.bonusDrempel || !r.bonusCents) continue;
    const [setterId, p] = k.split("|");
    const datum = shows.map((x) => x.datum).sort()[r.bonusDrempel - 1];
    out.push({ sleutel: `bonus:${setterId}:${p}`, setter_id: setterId, soort: "bonus", contact_id: null, opp_id: null, appointment_id: null, periode_start: p, datum, grondslag_cents: shows.length, percentage: null, bedrag_cents: r.bonusCents, uitleg: `${shows.length} shows in deze periode (drempel ${r.bonusDrempel})` });
  }

  // Close: geaccepteerde deal met definitieve waarde en sluitdatum.
  for (const d of input.deals) {
    if (d.fase !== "geaccepteerd" || !d.waarde_cents || !d.sluitdatum || !d.setter_id || !setters.has(d.setter_id)) continue;
    const bedrag = Math.round((d.waarde_cents * r.closePercentage) / 100);
    out.push({ sleutel: `close:${d.id}`, setter_id: d.setter_id, soort: "close", contact_id: d.contact_id, opp_id: d.id, appointment_id: null, periode_start: periodeVan(d.sluitdatum), datum: d.sluitdatum, grondslag_cents: d.waarde_cents, percentage: r.closePercentage, bedrag_cents: bedrag, uitleg: `${r.closePercentage}% van ${euro(d.waarde_cents)} (excl. btw)` });
  }
  return out;
}

export type Actie =
  | { soort: "toevoegen"; regel: Regel }
  | { soort: "vervallen"; id: string; reden: string }
  | { soort: "heractiveren"; id: string }
  | { soort: "correctie"; regel: Regel; van: string };

/**
 * Vergelijkt het grootboek met wat het hoort te zijn. Idempotent: tweede keer uitvoeren levert geen acties.
 * - Nieuw → toevoegen.
 * - Niet meer van toepassing en nog niet uitbetaald → vervallen.
 * - Ander bedrag, of niet meer van toepassing na uitbetaling → correctieregel met het verschil.
 */
export function vergelijk(bestaand: Bestaand[], doel: Regel[], vandaag: string): Actie[] {
  const acties: Actie[] = [];
  const perSleutel = new Map(bestaand.filter((b) => !b.gecorrigeerd_van && b.soort !== "uitbetaling").map((b) => [b.sleutel, b]));
  const correcties = new Map<string, Bestaand[]>();
  for (const b of bestaand) if (b.gecorrigeerd_van) correcties.set(b.gecorrigeerd_van, [...(correcties.get(b.gecorrigeerd_van) ?? []), b]);
  const doelMap = new Map(doel.map((d) => [d.sleutel, d]));

  for (const d of doel) if (!perSleutel.has(d.sleutel)) acties.push({ soort: "toevoegen", regel: d });

  for (const [sleutel, orig] of perSleutel) {
    const d = doelMap.get(sleutel);
    const corr = (correcties.get(orig.id) ?? []).filter((c) => c.status !== "vervallen");
    const doelBedrag = d?.bedrag_cents ?? 0;
    const allesOnbetaald = orig.status !== "uitbetaald" && corr.every((c) => c.status !== "uitbetaald");

    if (orig.status === "vervallen") {
      if (d && corr.length === 0) {
        if (orig.bedrag_cents === doelBedrag) acties.push({ soort: "heractiveren", id: orig.id });
        else acties.push({ soort: "correctie", van: orig.id, regel: correctie(orig, doelBedrag, d, vandaag, corr.length) });
      }
      continue;
    }
    const netto = orig.bedrag_cents + corr.reduce((s, c) => s + c.bedrag_cents, 0);
    if (netto === doelBedrag) continue;
    if (doelBedrag === 0 && allesOnbetaald) {
      acties.push({ soort: "vervallen", id: orig.id, reden: "niet meer van toepassing" });
      for (const c of corr) acties.push({ soort: "vervallen", id: c.id, reden: "niet meer van toepassing" });
      continue;
    }
    acties.push({ soort: "correctie", van: orig.id, regel: correctie(orig, doelBedrag - netto, d, vandaag, corr.length) });
  }
  return acties;
}

function correctie(orig: Bestaand, verschil: number, d: Regel | undefined, vandaag: string, n: number): Regel {
  return {
    sleutel: `corr:${orig.sleutel}:${n + 1}`,
    setter_id: orig.setter_id,
    soort: "correctie",
    contact_id: orig.contact_id,
    opp_id: orig.opp_id,
    appointment_id: orig.appointment_id,
    periode_start: periodeVan(vandaag),
    datum: vandaag,
    grondslag_cents: d?.grondslag_cents ?? null,
    percentage: d?.percentage ?? null,
    bedrag_cents: verschil,
    uitleg: d ? `Correctie ${orig.soort}: ${d.uitleg} (verschil ${euro(verschil)})` : `Correctie ${orig.soort}: niet meer van toepassing (${euro(verschil)})`,
  };
}
