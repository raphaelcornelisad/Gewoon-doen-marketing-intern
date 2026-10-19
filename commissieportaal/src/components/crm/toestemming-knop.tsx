"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { ToestemmingForm } from "./acties";

export function ToestemmingFormKnop({ contactId }: { contactId: string }) {
  const router = useRouter();
  const [kanaal, setKanaal] = useState<string | null>(null);
  if (!kanaal) {
    return (
      <span className="inline-form__row">
        {["whatsapp", "sms", "email", "bellen"].map((k) => (
          <button key={k} type="button" className="linkbutton small" onClick={() => setKanaal(k)}>+ {k}</button>
        ))}
      </span>
    );
  }
  return <ToestemmingForm contactId={contactId} kanaal={kanaal} onKlaar={() => { setKanaal(null); router.refresh(); }} />;
}
