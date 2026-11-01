import type { Metadata } from "next";
import Link from "next/link";
import { CrmBar } from "@/components/crm/crm-bar";
import { avatarKleur, initialen } from "@/components/crm/icons";
import { Live } from "@/components/crm/live";
import { MarkeerGelezen } from "@/components/crm/inbox-gelezen";
import { Vinkjes, WaInvoer, WaLijst, WaScroll, type WaGesprek } from "@/components/crm/wa-chat";
import { inbox } from "@/lib/crm/berichten";
import { contactDetail, requireCrmUser } from "@/lib/crm/server";
import { instagramLink, wachtMinuten } from "@/lib/ig/core";
import { igGesprek, igThreads } from "@/lib/ig/server";

export const metadata: Metadata = { title: "Inbox · CRM" };
export const dynamic = "force-dynamic";

const TZ = "Europe/Amsterdam";
const dag = (d: Date) => d.toLocaleDateString("sv-SE", { timeZone: TZ });
const klok = (iso: string) => new Date(iso).toLocaleTimeString("nl-NL", { timeZone: TZ, hour: "2-digit", minute: "2-digit" });

/** Zoals WhatsApp: tijd vandaag, "Gisteren", weekdag deze week, anders de datum. */
function lijstTijd(iso: string) {
  const d = new Date(iso);
  const verschil = Math.round((Date.parse(dag(new Date())) - Date.parse(dag(d))) / 86400000);
  if (verschil === 0) return klok(iso);
  if (verschil === 1) return "Gisteren";
  if (verschil < 7) return d.toLocaleDateString("nl-NL", { timeZone: TZ, weekday: "long" });
  return d.toLocaleDateString("nl-NL", { timeZone: TZ, day: "2-digit", month: "2-digit", year: "2-digit" });
}

function dagLabel(iso: string) {
  const d = new Date(iso);
  const verschil = Math.round((Date.parse(dag(new Date())) - Date.parse(dag(d))) / 86400000);
  if (verschil === 0) return "Vandaag";
  if (verschil === 1) return "Gisteren";
  return d.toLocaleDateString("nl-NL", { timeZone: TZ, weekday: verschil < 7 ? "long" : undefined, day: "numeric", month: "long", year: verschil > 300 ? "numeric" : undefined });
}

/** WhatsApp of Instagram bovenaan de chatlijst. */
function KanaalKeuze({ actief }: { actief: "whatsapp" | "instagram" }) {
  return (
    <div className="wa-filters" role="tablist" aria-label="Kanaal">
      <Link href="/crm/inbox" role="tab" aria-selected={actief === "whatsapp"} className={actief === "whatsapp" ? "is-actief" : undefined}>WhatsApp</Link>
      <Link href="/crm/inbox?kanaal=instagram" role="tab" aria-selected={actief === "instagram"} className={actief === "instagram" ? "is-actief" : undefined}>Instagram</Link>
    </div>
  );
}

/** Instagram-DM's in de inbox: alleen lezen, antwoorden gaat via Instagram (Seyed 5890). */
async function InstagramInbox({ id }: { id?: string }) {
  const nu = new Date();
  const [threads, detail] = await Promise.all([igThreads(), id ? igGesprek(id) : Promise.resolve(null)]);
  const gesprekken: WaGesprek[] = threads
    .filter((t) => t.laatste_bericht_op)
    .map((t) => ({
      id: t.id,
      naam: t.lead_gebruikersnaam ? `@${t.lead_gebruikersnaam}` : "Onbekend",
      laatste: (t.laatste_tekst ?? "").replace(/\s+/g, " ").slice(0, 90),
      richting: t.laatste_van === "wij" ? "uit" : "in",
      status: "",
      tijd: lijstTijd(t.laatste_bericht_op!),
      open: !t.bestaande_klant && wachtMinuten(t.wacht_op_ons_sinds, nu) !== null ? 1 : 0,
    }));
  const t = detail?.thread;
  const berichten = detail?.berichten ?? [];
  const naam = t?.lead_gebruikersnaam ? `@${t.lead_gebruikersnaam}` : "Onbekend";
  return (
    <div className={`wa${t ? " wa--open" : ""}`}>
      <aside className="wa-links" aria-label="Chats">
        <header className="wa-kop">
          <strong>Chats</strong>
          <KanaalKeuze actief="instagram" />
        </header>
        <WaLijst
          gesprekken={gesprekken}
          actief={t?.id ?? null}
          href={(x) => `/crm/inbox?kanaal=instagram&ig=${x}`}
          leeg="Nog geen Instagram-gesprekken gesynchroniseerd."
          openLabel="Wacht op ons"
        />
      </aside>
      <section className="wa-rechts" aria-label="Gesprek">
        {!t ? (
          <div className="wa-welkom">
            <div className="wa-welkom__icoon" aria-hidden="true">💬</div>
            <h2>Instagram</h2>
            <p className="muted">Kies links een gesprek. Je leest hier mee; antwoorden doe je in Instagram.</p>
          </div>
        ) : (
          <>
            <header className="wa-kop wa-kop--chat">
              <Link href="/crm/inbox?kanaal=instagram" className="wa-terug" aria-label="Terug naar chats">←</Link>
              <span className="wa-avatar" style={{ background: avatarKleur(t.id) }}>{initialen(t.lead_gebruikersnaam ?? "?")}</span>
              <span className="wa-kop__naam">
                <strong>{naam}</strong>
                <span className="small">Instagram-DM</span>
              </span>
            </header>
            <WaScroll sleutel={`${t.id}:${berichten.length}`}>
              <div className="wa-melding wa-melding--info">Gesprek uit Instagram, ververst elke paar minuten. Antwoorden gaat via Instagram.</div>
              {berichten.length === 0 && <div className="wa-dag"><span>Nog geen berichten</span></div>}
              {berichten.map((m, i) => (
                <div key={m.id} className="wa-blok">
                  {(i === 0 || dag(new Date(berichten[i - 1].verzonden_op)) !== dag(new Date(m.verzonden_op))) && (
                    <div className="wa-dag"><span>{dagLabel(m.verzonden_op)}</span></div>
                  )}
                  <div className={`wa-bubbel${m.van === "wij" ? " wa-bubbel--uit" : ""}`}>
                    <span className="wa-bubbel__tekst">{m.tekst || (m.extra.length ? `[${m.extra.join(", ")}]` : "[geen tekst]")}</span>
                    <span className="wa-bubbel__meta">
                      {m.is_autoreply && <span className="wa-kanaal-label">autoreply</span>}
                      {klok(m.verzonden_op)}
                    </span>
                  </div>
                </div>
              ))}
            </WaScroll>
            <div className="wa-invoer">
              <a className="button" style={{ justifySelf: "center" }} href={instagramLink(t.lead_gebruikersnaam)} target="_blank" rel="noopener noreferrer">Antwoorden in Instagram</a>
            </div>
          </>
        )}
      </section>
    </div>
  );
}

export default async function Inbox({ searchParams }: { searchParams: Promise<{ lead?: string; kanaal?: string; ig?: string }> }) {
  const user = await requireCrmUser();
  const { lead, kanaal, ig } = await searchParams;
  if (kanaal === "instagram") {
    return (
      <>
        <CrmBar user={user} actief="/crm/inbox" />
        <Live sec={30} />
        <InstagramInbox id={ig} />
      </>
    );
  }
  const [lijst, detail] = await Promise.all([inbox(user), lead ? contactDetail(lead, user) : Promise.resolve(null)]);
  const gesprekken: WaGesprek[] = lijst.map((g) => ({
    id: g.contact.id,
    naam: g.contact.salon_naam,
    laatste: g.laatste.tekst.replace(/\s+/g, " ").slice(0, 90),
    richting: g.laatste.richting === "in" ? "in" : "uit",
    status: g.laatste.status,
    tijd: lijstTijd(g.laatste.created_at),
    open: g.open,
  }));
  // Een lead zonder berichten (geopend vanaf de leadkaart) bovenaan zetten, zodat je een nieuw gesprek kunt beginnen.
  if (detail && !gesprekken.some((g) => g.id === detail.contact.id)) {
    gesprekken.unshift({ id: detail.contact.id, naam: detail.contact.salon_naam, laatste: "Nieuw gesprek", richting: "in", status: "", tijd: "", open: 0 });
  }
  const k = detail?.contact;
  const berichten = detail?.berichten ?? [];

  return (
    <>
      <CrmBar user={user} actief="/crm/inbox" />
      <Live sec={10} />
      <div className={`wa${k ? " wa--open" : ""}`}>
        <aside className="wa-links" aria-label="Chats">
          <header className="wa-kop">
            <strong>Chats</strong>
            <KanaalKeuze actief="whatsapp" />
          </header>
          <WaLijst gesprekken={gesprekken} actief={k?.id ?? null} />
        </aside>
        <section className="wa-rechts" aria-label="Gesprek">
          {!k ? (
            <div className="wa-welkom">
              <div className="wa-welkom__icoon" aria-hidden="true">💬</div>
              <h2>Berichten</h2>
              <p className="muted">Kies links een chat. Een nieuw gesprek begin je met het chat-icoon op een lead in het CRM.</p>
            </div>
          ) : (
            <>
              <header className="wa-kop wa-kop--chat">
                <Link href="/crm/inbox" className="wa-terug" aria-label="Terug naar chats">←</Link>
                <span className="wa-avatar" style={{ background: avatarKleur(k.id) }}>{initialen(k.salon_naam)}</span>
                <Link href={`/crm/lead/${k.id}`} className="wa-kop__naam">
                  <strong>{k.salon_naam}</strong>
                  <span className="small">{[k.contactpersoon, k.telefoon_norm].filter(Boolean).join(" · ") || "Geen telefoonnummer"}</span>
                </Link>
              </header>
              <MarkeerGelezen contactId={k.id} />
              <WaScroll sleutel={`${k.id}:${berichten.length}`}>
                <div className="wa-melding wa-melding--info">Alle berichten met deze lead worden hier en op de leadkaart bewaard.</div>
                {berichten.length === 0 && <div className="wa-dag"><span>Nog geen berichten</span></div>}
                {berichten.map((m, i) => (
                  <div key={m.id} className="wa-blok">
                    {(i === 0 || dag(new Date(berichten[i - 1].created_at)) !== dag(new Date(m.created_at))) && (
                      <div className="wa-dag"><span>{dagLabel(m.created_at)}</span></div>
                    )}
                    <div className={`wa-bubbel${m.richting === "uit" ? " wa-bubbel--uit" : ""}${m.status === "mislukt" ? " wa-bubbel--fout" : ""}`}>
                      <span className="wa-bubbel__tekst">{m.tekst}</span>
                      <span className="wa-bubbel__meta">
                        {m.kanaal === "sms" && <span className="wa-kanaal-label">sms</span>}
                        {klok(m.created_at)}
                        {m.richting === "uit" && <Vinkjes status={m.status} />}
                      </span>
                      {m.fout && <span className="wa-bubbel__fout">{m.fout}</span>}
                    </div>
                  </div>
                ))}
              </WaScroll>
              <WaInvoer key={k.id} contactId={k.id} uit={k.niet_benaderen} />
            </>
          )}
        </section>
      </div>
    </>
  );
}
