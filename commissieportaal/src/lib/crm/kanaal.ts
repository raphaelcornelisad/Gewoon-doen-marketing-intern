/**
 * Mag dit kanaal gebruikt worden? (pure regels, ook server-side vóór elke verzending)
 * - Niet meer benaderen of afgemeld → nooit.
 * - WhatsApp: binnen 24 uur na een inkomend WhatsApp-bericht mag vrije tekst. Daarbuiten alleen met
 *   geregistreerde toestemming én een goedgekeurde template. Een telefoonnummer, gesprek of boeking is geen toestemming.
 * - Sms: geregistreerde toestemming, of een inkomende sms in de laatste 24 uur.
 * - API-verzending kan alleen als de provider is aangesloten; handmatig (eigen telefoon) wordt gelogd, nooit als "verzonden".
 */
export interface KanaalInput {
  kanaal: "whatsapp" | "sms";
  providerAan: boolean;
  nietBenaderen: boolean;
  heeftTelefoon: boolean;
  /** Laatste toestemmingsregistratie voor dit kanaal */
  toestemming: { status: "gegeven" | "ingetrokken"; categorie: string } | null;
  laatsteInkomend: string | null;
  templateGoedgekeurd: boolean;
  nu?: number;
}

export interface Beslissing {
  ok: boolean;
  reden: string | null;
}

export interface KanaalBeslissing {
  api: Beslissing & { modus: "vrij" | "template" | null };
  handmatig: Beslissing;
  vensterOpen: boolean;
}

const nee = (reden: string): KanaalBeslissing => ({ api: { ok: false, reden, modus: null }, handmatig: { ok: false, reden }, vensterOpen: false });

export function beoordeelKanaal(i: KanaalInput): KanaalBeslissing {
  const naam = i.kanaal === "whatsapp" ? "WhatsApp" : "sms";
  if (i.nietBenaderen) return nee("Deze lead staat op niet meer benaderen.");
  if (!i.heeftTelefoon) return nee("Geen geldig telefoonnummer.");
  if (i.toestemming?.status === "ingetrokken") return nee(`De lead heeft zich afgemeld voor ${naam}.`);
  const venster = !!i.laatsteInkomend && (i.nu ?? Date.now()) - new Date(i.laatsteInkomend).getTime() < 24 * 3600000;
  const toestemming = i.toestemming?.status === "gegeven";
  const provider = (b: Beslissing & { modus: "vrij" | "template" | null }) =>
    i.providerAan ? b : { ok: false, reden: `${naam} via het CRM is nog niet aangesloten (Twilio). Je kunt wel handmatig versturen.`, modus: null };

  if (venster) return { api: provider({ ok: true, reden: null, modus: "vrij" }), handmatig: { ok: true, reden: null }, vensterOpen: true };
  if (!toestemming) {
    return nee(
      i.kanaal === "whatsapp"
        ? "Geen geregistreerde WhatsApp-toestemming. Een telefoonnummer, gesprek of Calendly-boeking geldt niet als toestemming. Leg toestemming vast of plan een terugbelmoment."
        : "Geen geregistreerde sms-toestemming. Leg toestemming vast of plan een terugbelmoment.",
    );
  }
  if (i.kanaal === "whatsapp") {
    return {
      api: provider(i.templateGoedgekeurd ? { ok: true, reden: null, modus: "template" } : { ok: false, reden: "Buiten het 24-uursvenster is een goedgekeurde WhatsApp-template nodig; deze template heeft nog geen goedgekeurde template-ID.", modus: null }),
      handmatig: { ok: true, reden: null },
      vensterOpen: false,
    };
  }
  return { api: provider({ ok: true, reden: null, modus: "vrij" }), handmatig: { ok: true, reden: null }, vensterOpen: false };
}

/** Afmeldwoorden in een inkomend bericht. */
export const isAfmelding = (tekst: string) => /^\s*(stop|stoppen|afmelden|uitschrijven|unsubscribe|geen interesse meer)\s*[.!]?\s*$/i.test(tekst);
