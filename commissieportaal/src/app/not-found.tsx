import Link from "next/link";

export default function NotFound() {
  return (
    <section className="thanks">
      <h1>Pagina niet gevonden</h1>
      <p>Deze pagina bestaat niet (meer). Controleer de link of ga naar de indienpagina.</p>
      <p>
        <Link href="/indienen">Naar de indienpagina</Link>
      </p>
    </section>
  );
}
