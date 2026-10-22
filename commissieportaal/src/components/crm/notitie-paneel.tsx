"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { NotitieLijst, type NotitieItem } from "./notities";
import { QuickNote, Sheet } from "./sheet";

type Ruw = { id: string; tekst: string; wie: string; op: string; bron?: string };
const tijd = (op: string) => new Date(op).toLocaleString("nl-NL", { timeZone: "Europe/Amsterdam", weekday: "short", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });

/** Notitiepaneel: nieuwe notitie bovenin, alle opgeslagen notities direct eronder. */
export function NotitiePaneel({ contactId, titel, onSluit }: { contactId: string; titel: string; onSluit: () => void }) {
  const router = useRouter();
  const [items, setItems] = useState<NotitieItem[] | null>(null);
  const laad = useCallback(async () => {
    const d = await fetch(`/api/crm/contact/${contactId}/notitie`).then((r) => r.json()).catch(() => null);
    setItems(d?.ok ? (d.notities as Ruw[]).map((n) => ({ id: n.id, tekst: n.tekst, wie: n.wie, wanneer: tijd(n.op), bron: n.bron })) : []);
  }, [contactId]);
  useEffect(() => {
    void laad();
  }, [laad]);
  return (
    <Sheet titel={titel} onClose={onSluit}>
      <QuickNote contactId={contactId} onDone={() => { void laad(); router.refresh(); }} />
      <strong className="small muted">Notities{items?.length ? ` (${items.length})` : ""}</strong>
      {items === null ? <p className="muted" style={{ margin: 0 }}>Laden…</p> : <NotitieLijst items={items} />}
    </Sheet>
  );
}
