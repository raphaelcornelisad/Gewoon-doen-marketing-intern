import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { getCrmUser } from "@/lib/crm/server";
import { CrmLoginForm } from "./login-form";

export const metadata: Metadata = { title: "Inloggen · Gewoon Sales Doen" };
export const dynamic = "force-dynamic";

export default async function CrmLogin({ searchParams }: { searchParams: Promise<{ fout?: string }> }) {
  if (await getCrmUser()) redirect("/crm");
  const { fout } = await searchParams;
  return (
    <>
      <section className="hero">
        <p className="eyebrow">Gewoon Sales Doen</p>
        <h1>Inloggen</h1>
        <p className="lead">Vul je e-mailadres in. Je krijgt een inloglink in je mailbox.</p>
      </section>
      {fout && <div className="alert" role="alert">{fout === "verlopen" ? "Deze inloglink is verlopen of al gebruikt. Vraag een nieuwe aan." : "Ongeldige inloglink."}</div>}
      <CrmLoginForm />
      <p className="small"><Link href="/crm/aanmelden">Nog geen account? Account aanvragen →</Link></p>
    </>
  );
}
