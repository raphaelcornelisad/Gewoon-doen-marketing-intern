"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { post } from "./sheet";

export function BewaarWeergave({ pijplijn, query }: { pijplijn: string; query: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [naam, setNaam] = useState("");
  if (!query) return null;
  return open ? (
    <span className="inline-form__row">
      <input value={naam} onChange={(e) => setNaam(e.target.value)} placeholder="Naam weergave" aria-label="Naam weergave" />
      <button
        type="button"
        className="button button--small button--ghost"
        onClick={async () => {
          const r = await post("/api/crm/views", { naam, pijplijn, query });
          if (r.ok) {
            setOpen(false);
            router.refresh();
          }
        }}
      >
        Bewaren
      </button>
    </span>
  ) : (
    <button type="button" className="linkbutton small" onClick={() => setOpen(true)}>Weergave opslaan</button>
  );
}
