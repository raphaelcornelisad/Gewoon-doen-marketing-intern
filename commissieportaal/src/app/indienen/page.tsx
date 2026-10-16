import type { Metadata } from "next";
import { SubmitForm } from "./submit-form";

export const metadata: Metadata = { title: "Lijst indienen · Gewoon Doen Marketing" };

export default async function IndienenPage({
  searchParams,
}: {
  searchParams: Promise<{ email?: string | string[] }>;
}) {
  const { email } = await searchParams;
  return (
    <>
      <section className="hero">
        <p className="eyebrow">Voor salonsetters</p>
        <h1>Lever je leadlijst in</h1>
        <p className="lead">Plak de link naar je Google Sheet van deze periode. Wij doen de rest.</p>
      </section>
      <SubmitForm defaultEmail={typeof email === "string" ? email : ""} />
    </>
  );
}
