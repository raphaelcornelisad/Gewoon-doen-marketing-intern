import { NextResponse } from "next/server";
import { controleerKanaal, templates, variabelen } from "@/lib/crm/berichten";
import { vulTemplate } from "@/lib/crm/core";
import { CrmError, getContact, getCrmUser } from "@/lib/crm/server";

export const dynamic = "force-dynamic";

/** Kanaalcontrole + voorgestelde tekst voor het berichtvenster. */
export async function GET(req: Request) {
  const user = await getCrmUser();
  if (!user) return NextResponse.json({ ok: false }, { status: 401 });
  const u = new URL(req.url);
  const kanaal = u.searchParams.get("kanaal") === "sms" ? "sms" : "whatsapp";
  try {
    const c = await getContact(String(u.searchParams.get("contactId")));
    const tpls = (await templates()).filter((t) => t.kanaal === kanaal);
    const gekozen = tpls.find((t) => t.id === u.searchParams.get("templateId")) ?? tpls.find((t) => t.doel === (u.searchParams.get("doel") ?? "wavo")) ?? tpls[0] ?? null;
    const b = await controleerKanaal(c, kanaal, gekozen?.id);
    return NextResponse.json({
      ok: true,
      beslissing: b,
      templates: tpls.map((t) => ({ id: t.id, naam: t.naam, goedgekeurd: !!t.provider_template_id })),
      templateId: gekozen?.id ?? null,
      tekst: gekozen ? vulTemplate(gekozen.tekst, variabelen(c, user.setter?.naam ?? null)) : "",
      telefoon: c.telefoon_norm,
    });
  } catch (e) {
    return NextResponse.json({ ok: false, message: e instanceof CrmError ? e.message : "Fout" }, { status: e instanceof CrmError ? e.status : 500 });
  }
}
