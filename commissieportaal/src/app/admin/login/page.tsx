import type { Metadata } from "next";
import { LoginForm } from "./login-form";

export const metadata: Metadata = { title: "Inloggen · Gewoon Doen Marketing" };

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ fout?: string }> }) {
  const { fout } = await searchParams;
  return (
    <>
      <section className="hero">
        <p className="eyebrow">Admin</p>
        <h1>Inloggen</h1>
        <p className="lead">Vul je e-mailadres in. Je krijgt een inloglink in je mailbox.</p>
      </section>
      {fout && (
        <div className="alert" role="alert" style={{ marginBottom: 16 }}>
          {fout === "verlopen" ? "Deze inloglink is verlopen of al gebruikt. Vraag een nieuwe aan." : "Ongeldige inloglink."}
        </div>
      )}
      <LoginForm />
    </>
  );
}
