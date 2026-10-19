"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { post } from "@/components/crm/sheet";

export function StartSessie() {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [fout, setFout] = useState<string | null>(null);
  return (
    <div className="crm-form">
      <button
        type="button"
        className="button crm-belknop"
        disabled={busy}
        onClick={async () => {
          setBusy(true);
          try {
            sessionStorage.removeItem("gdm_bel_overslaan");
          } catch {
            /* geen opslag */
          }
          const r = await post("/api/crm/bellen/volgende", { overslaan: [] });
          setBusy(false);
          if (!r.ok) return setFout(r.message ?? "Starten mislukt.");
          if (!r.data.contactId) return setFout("Er staan nu geen leads klaar in de wachtrij.");
          router.push(`/crm/bellen?lead=${r.data.contactId}&sessie=1`);
        }}
      >
        {busy ? "Bezig…" : "Start belsessie"}
      </button>
      {fout && <div className="notice">{fout}</div>}
    </div>
  );
}
