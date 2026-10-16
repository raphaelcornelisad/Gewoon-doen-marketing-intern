import { NextResponse } from "next/server";
import { getAdmin } from "@/lib/auth/session";
import { approveSubmission } from "@/lib/opkomst/server";

export const dynamic = "force-dynamic";

export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!(await getAdmin())) return NextResponse.json({ ok: false, message: "Niet ingelogd." }, { status: 401 });
  const { id } = await params;
  try {
    return NextResponse.json(await approveSubmission(id));
  } catch (e) {
    console.error("Goedkeuren mislukt", id, e);
    return NextResponse.json({ ok: false, message: "Goedkeuren is mislukt. Probeer het opnieuw." }, { status: 500 });
  }
}
