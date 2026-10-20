"use client";

import { useRouter } from "next/navigation";
import { post } from "./sheet";

export function VergrendelKnop() {
  const router = useRouter();
  return (
    <button type="button" className="linkbutton" onClick={async () => { await post("/api/crm/beheer", { vergrendel: true }); router.push("/crm"); router.refresh(); }}>
      🔒 Beheer vergrendelen
    </button>
  );
}
