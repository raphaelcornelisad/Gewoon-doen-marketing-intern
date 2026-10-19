import { crmRoute } from "@/lib/crm/api";
import { CrmError } from "@/lib/crm/server";
import { db } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  return crmRoute<{ naam?: string; pijplijn?: string; query?: string; verwijder?: string }>(req, async (user, b) => {
    if (b.verwijder) {
      await db().from("crm_views").delete().eq("id", b.verwijder).eq("eigenaar", user.email);
      return;
    }
    const naam = String(b.naam ?? "").trim().slice(0, 60);
    if (!naam) throw new CrmError("Geef de weergave een naam.");
    const pijplijn = b.pijplijn === "sales" ? "sales" : "outbound";
    const r = await db().from("crm_views").upsert({ eigenaar: user.email, naam, pijplijn, query: String(b.query ?? "").slice(0, 1000) }, { onConflict: "eigenaar,pijplijn,naam" });
    if (r.error) throw new Error(r.error.message);
  });
}
