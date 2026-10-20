import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { getCrmUser } from "@/lib/crm/server";
import { AanmeldForm } from "./aanmeld-form";

export const metadata: Metadata = { title: "Account aanvragen · Gewoon Sales Doen" };
export const dynamic = "force-dynamic";

export default async function Aanmelden() {
  if (await getCrmUser()) redirect("/crm");
  return (
    <>
      <section className="hero">
        <p className="eyebrow">Gewoon Sales Doen</p>
        <h1>Account aanvragen</h1>
        <p className="lead">Vul je gegevens in. De beheerder keurt je aanvraag goed; daarna krijg je een mail en kun je inloggen.</p>
      </section>
      <AanmeldForm />
      <p className="small"><Link href="/crm/login">Heb je al een account? Inloggen →</Link></p>
    </>
  );
}
