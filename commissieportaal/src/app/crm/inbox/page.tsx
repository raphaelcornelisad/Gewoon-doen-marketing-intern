import type { Metadata } from "next";
import Link from "next/link";
import { CrmBar } from "@/components/crm/crm-bar";
import { avatarKleur, initialen } from "@/components/crm/icons";
import { Live } from "@/components/crm/live";
import { MarkeerGelezen } from "@/components/crm/inbox-gelezen";
import { Vinkjes, WaInvoer, WaLijst, WaScroll, type WaGesprek } from "@/components/crm/wa-chat";
import { inbox } from "@/lib/crm/berichten";
import { contactDetail, requireCrmUser } from "@/lib/crm/server";

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

export default async function Inbox({ searchParams }: { searchParams: Promise<{ lead?: string }> }) {
  const user = await requireCrmUser();
  const { lead } = await searchParams;
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
