"use client";

import { useRouter } from "next/navigation";
import { post } from "./sheet";

export function OntkoppelKnop() {
  const router = useRouter();
  return (
    <button
      type="button"
      className="button button--small button--ghost"
      onClick={async () => {
        if (!confirm("Google Agenda ontkoppelen? Nieuwe terugbelmomenten komen dan niet meer in je agenda.")) return;
        await post("/api/google/ontkoppel", {});
        router.refresh();
      }}
    >
      Ontkoppelen
    </button>
  );
}
