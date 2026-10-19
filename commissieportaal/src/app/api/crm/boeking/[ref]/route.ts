import { NextResponse } from "next/server";
import { boekingStatus } from "@/lib/crm/calendly";
import { CrmError, getCrmUser } from "@/lib/crm/server";

export const dynamic = "force-dynamic";

export async function GET(_req: Request, { params }: { params: Promise<{ ref: string }> }) {
  const user = await getCrmUser();
  if (!user) return NextResponse.json({ ok: false }, { status: 401 });
  try {
    return NextResponse.json({ ok: true, ...(await boekingStatus(user, (await params).ref)) });
  } catch (e) {
    return NextResponse.json({ ok: false, message: e instanceof CrmError ? e.message : "Fout" }, { status: e instanceof CrmError ? e.status : 500 });
  }
}
