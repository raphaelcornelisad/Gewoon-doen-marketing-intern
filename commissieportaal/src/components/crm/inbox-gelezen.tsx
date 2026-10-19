"use client";

import { useEffect } from "react";
import { post } from "./sheet";

export function MarkeerGelezen({ contactId }: { contactId: string }) {
  useEffect(() => {
    void post("/api/crm/inbox", { contactId });
  }, [contactId]);
  return null;
}
