import { NextResponse } from "next/server";
import { autorisatieUrl, googleAan } from "@/lib/crm/google";
import { getCrmUser } from "@/lib/crm/server";
import { env } from "@/lib/env";

export const dynamic = "force-dynamic";

/** Stuurt de ingelogde setter naar Google om de agenda te koppelen. */
export async function GET() {
  const user = await getCrmUser();
  const terug = (q: string) => NextResponse.redirect(`${env("APP_URL").replace(/\/$/, "")}/crm/koppelingen?${q}`);
  if (!user) return NextResponse.redirect(`${env("APP_URL").replace(/\/$/, "")}/crm/login`);
  if (!user.setter) return terug("fout=alleen-setters");
  if (!googleAan()) return terug("fout=niet-ingesteld");
  return NextResponse.redirect(autorisatieUrl(user.setter.id, user.email));
}
