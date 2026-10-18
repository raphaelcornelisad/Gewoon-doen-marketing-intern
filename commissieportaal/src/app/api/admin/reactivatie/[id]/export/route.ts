import { getAdmin } from "@/lib/auth/session";
import { toCsv } from "@/lib/reactivatie/build";
import { campaignLists } from "@/lib/reactivatie/server";

export const dynamic = "force-dynamic";

/** CSV-export. ?filter=ja | nee | open | alle */
export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!(await getAdmin())) return new Response("Niet ingelogd.", { status: 401 });
  const { id } = await params;
  const filter = new URL(req.url).searchParams.get("filter") ?? "alle";
  const rows = (await campaignLists(id)).flatMap((l) =>
    l.items_json
      .filter((i) => filter === "alle" || (filter === "ja" ? i.verschenen === true : filter === "nee" ? i.verschenen === false : i.verschenen === null))
      .map((i) => ({ salon: l.clinic.naam, naam: i.naam, campagne: i.campagne, bron: i.bron, verschenen: i.verschenen })),
  );
  return new Response(toCsv(rows), {
    headers: { "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": `attachment; filename="reactivatie-${filter}.csv"` },
  });
}
