import "server-only";
import { NextResponse } from "next/server";
import { CrmError, getCrmUser, type CrmUser } from "./server";

/** Gedeelde afhandeling: inlogcheck, JSON-body en nette foutmeldingen. */
export async function crmRoute<B>(req: Request, fn: (user: CrmUser, body: B) => Promise<Record<string, unknown> | void>) {
  const user = await getCrmUser();
  if (!user) return NextResponse.json({ ok: false, message: "Niet ingelogd." }, { status: 401 });
  const body = (await req.json().catch(() => ({}))) as B;
  try {
    return NextResponse.json({ ok: true, ...((await fn(user, body ?? ({} as B))) ?? {}) });
  } catch (e) {
    if (e instanceof CrmError) return NextResponse.json({ ok: false, message: e.message }, { status: e.status });
    console.error("CRM-actie mislukt", e);
    return NextResponse.json({ ok: false, message: "Er ging iets mis. Probeer het opnieuw." }, { status: 500 });
  }
}
