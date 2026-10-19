"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";

/** Ververst de pagina periodiek zolang het tabblad zichtbaar is (live agenda/inbox). */
export function Live({ sec = 30 }: { sec?: number }) {
  const router = useRouter();
  useEffect(() => {
    const t = setInterval(() => document.visibilityState === "visible" && router.refresh(), sec * 1000);
    return () => clearInterval(t);
  }, [router, sec]);
  return null;
}
