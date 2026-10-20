"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { BelKnop } from "./bel-knop";
import { BerichtVenster, FaseVenster, InplanVenster, TaakVenster } from "./acties";
import { Icon, type IconName } from "./icons";
import { post, QuickNote, Sheet } from "./sheet";

type Opp = { id: string; fase: string } | null;

export function LeadBalk(p: {
  contactId: string;
  telefoon: string | null;
  rol: "admin" | "setter" | "sales";
  nietBenaderen: boolean;
  outbound: Opp;
  sales: Opp;
  magOutbound: boolean;
  magSales: boolean;
  fasesOutbound: { key: string; label: string }[];
  fasesSales: { key: string; label: string }[];
  setters: { id: string; naam: string }[];
  eigenaar: string | null;
}) {
  const router = useRouter();
  const [open, setOpen] = useState<null | "whatsapp" | "sms" | "calendly" | "notitie" | "taak" | "toewijzen" | "fase-outbound" | "fase-sales">(null);
  const sluit = () => setOpen(null);
  const knop = (naam: IconName, label: string, onClick: (() => void) | null, extra?: string) =>
    onClick ? (
      <button type="button" className={`crm-actie${extra ? ` ${extra}` : ""}`} onClick={onClick}>
        <Icon name={naam} size={20} />
        <span>{label}</span>
      </button>
    ) : null;
  const tel = p.telefoon;
  const geblokkeerd = p.nietBenaderen;

  return (
    <>
      <div className="crm-acties" role="toolbar" aria-label="Acties">
        {!geblokkeerd && tel &&
          (p.rol === "setter" && p.magOutbound ? (
            <Link href={`/crm/bellen?lead=${p.contactId}`} className="crm-actie crm-actie--groen"><Icon name="phone" size={20} /><span>Bellen</span></Link>
          ) : (
            <BelKnop telefoon={tel} className="crm-actie crm-actie--groen"><Icon name="phone" size={20} /><span>Bellen</span></BelKnop>
          ))}
        {!geblokkeerd && tel && knop("chat", "WhatsApp", () => setOpen("whatsapp"))}
        {!geblokkeerd && tel && knop("sms", "Sms", () => setOpen("sms"))}
        {!geblokkeerd && (p.magOutbound || p.magSales || p.rol === "admin") && knop("calendar", "Calendly", () => setOpen("calendly"), "crm-actie--groen")}
        {knop("note", "Notitie", () => setOpen("notitie"))}
        {knop("taak", "Taak", () => setOpen("taak"))}
        {p.rol === "admin" && knop("user", "Toewijzen", () => setOpen("toewijzen"))}
        {p.outbound && p.magOutbound && knop("move", "Fase outbound", () => setOpen("fase-outbound"))}
        {p.sales && p.magSales && knop("move", "Fase call geboekt", () => setOpen("fase-sales"))}
      </div>
      {geblokkeerd && <div className="alert">Niet meer benaderen: bellen en berichten zijn uitgeschakeld.</div>}

      {(open === "whatsapp" || open === "sms") && <BerichtVenster contactId={p.contactId} kanaal={open} doel="algemeen" onSluit={sluit} />}
      {open === "calendly" && <InplanVenster contactId={p.contactId} type={p.sales ? "salesgesprek" : "kennismaking"} onSluit={sluit} />}
      {open === "notitie" && (
        <Sheet titel="Notitie" onClose={sluit}>
          <QuickNote contactId={p.contactId} onDone={() => { sluit(); router.refresh(); }} />
        </Sheet>
      )}
      {open === "taak" && <TaakVenster contactId={p.contactId} onSluit={sluit} />}
      {open === "toewijzen" && (
        <Sheet titel="Toewijzen (huidige eigenaar)" onClose={sluit}>
          <p className="small muted" style={{ margin: 0 }}>Commissie van eerdere boekingen blijft bij de setter die toen heeft ingepland.</p>
          <div className="crm-sheet__list">
            {p.setters.map((s) => (
              <button key={s.id} type="button" className="crm-stage" aria-pressed={p.eigenaar === s.id} onClick={async () => { await post(`/api/crm/contact/${p.contactId}`, { eigenaar_id: s.id }); sluit(); router.refresh(); }}>
                {s.naam}
              </button>
            ))}
            <button type="button" className="crm-stage" onClick={async () => { await post(`/api/crm/contact/${p.contactId}`, { eigenaar_id: null }); sluit(); router.refresh(); }}>Niemand</button>
          </div>
        </Sheet>
      )}
      {open === "fase-outbound" && p.outbound && <FaseVenster oppId={p.outbound.id} fase={p.outbound.fase} fases={p.fasesOutbound} pijplijn="outbound" onSluit={sluit} />}
      {open === "fase-sales" && p.sales && <FaseVenster oppId={p.sales.id} fase={p.sales.fase} fases={p.fasesSales} pijplijn="sales" onSluit={sluit} />}
    </>
  );
}

export function BerichtKnop({ contactId }: { contactId: string }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button type="button" className="button button--small" onClick={() => setOpen(true)}>Nieuw bericht</button>
      {open && <BerichtVenster contactId={contactId} doel="algemeen" onSluit={() => setOpen(false)} />}
    </>
  );
}

export function TaakKnop({ contactId }: { contactId: string }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button type="button" className="button button--small" onClick={() => setOpen(true)}>Taak toevoegen</button>
      {open && <TaakVenster contactId={contactId} onSluit={() => setOpen(false)} />}
    </>
  );
}
