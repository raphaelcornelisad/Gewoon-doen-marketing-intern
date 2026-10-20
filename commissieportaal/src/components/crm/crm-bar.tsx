import Link from "next/link";
import type { CrmUser } from "@/lib/crm/server";
import { openAanvragen } from "@/lib/crm/aanvragen";
import { huidigeWerkruimte, werkruimtes } from "@/lib/crm/werkruimte";
import { CrmWissel } from "./crm-wissel";
import { VergrendelKnop } from "./vergrendel";

type L = [string, string];

/** Hoofdmenu kort en per rol; beheer (alleen admin) en commissie apart rechts. */
export async function CrmBar({ user, actief, open }: { user: CrmUser; actief: string; open?: { beoordelen?: number; inbox?: number } }) {
  const hoofd: L[] =
    user.rol === "admin"
      ? [["/crm", "Dashboard"], ["/crm/outbound", "CRM Outbound"], ["/crm/sales", "CRM Sales"], ["/crm/agenda", "Agenda"], ["/crm/inbox", "Inbox"]]
      : user.rol === "setter"
        ? [["/crm", "Dashboard"], ["/crm/bellen", "Bellen"], ["/crm/outbound", "CRM Outbound"], ["/crm/sales", "CRM Sales"], ["/crm/agenda", "Agenda"], ["/crm/inbox", "Inbox"]]
        : [["/crm", "Dashboard"], ["/crm/sales", "CRM Sales"], ["/crm/agenda", "Agenda"], ["/crm/inbox", "Inbox"]];
  const beheer: L[] = [
    ["/crm/overzicht", "Cijfers"],
    ["/crm/belsessies", "Belsessies"],
    ["/crm/commissie", "Commissie setters"],
    ["/crm/beoordelen", "Beoordelen"],
    ["/crm/contacten", "Contacten"],
    ["/crm/aanvragen", "Accountaanvragen"],
    ["/crm/import", "Leads importeren"],
    ["/crm/instellingen", "Instellingen"],
    ["/admin", "Commissieportaal (salons)"],
  ];
  const [huidig, lijst, aanvragen] = await Promise.all([huidigeWerkruimte(), werkruimtes(), user.rol === "admin" ? openAanvragen().catch(() => 0) : Promise.resolve(0)]);
  const teller = (href: string) => (href === "/crm/beoordelen" ? open?.beoordelen : href === "/crm/inbox" ? open?.inbox : href === "/crm/aanvragen" ? aanvragen : undefined);
  const beheerTeller = (open?.beoordelen ?? 0) + aanvragen;
  const link = ([href, label]: L) => {
    // CRM Outbound / CRM Sales: eerst het CRM kiezen (Laser ontharen, ...), dan het bord openen.
    if (href === "/crm/outbound" || href === "/crm/sales") {
      return <CrmWissel key={href} label={label} href={href} actief={actief === href} huidig={huidig} lijst={lijst} magMaken={user.rol === "admin" && href === "/crm/outbound"} />;
    }
    return (
      <Link key={href} href={href} aria-current={actief === href ? "page" : undefined} className={actief === href ? "is-actief" : undefined}>
        {label}
        {teller(href) ? <span className="crm-badge crm-badge--inline">{teller(href)}</span> : null}
      </Link>
    );
  };
  return (
    <header className="crm-top">
      <nav className="crm-top__hoofd" aria-label="Hoofdmenu">{hoofd.map(link)}</nav>
      <div className="crm-top__rechts">
        {user.rol === "setter" && (
          <Link href="/crm/commissie" className={`crm-top__commissie${actief === "/crm/commissie" ? " is-actief" : ""}`}>Mijn commissie</Link>
        )}
        {user.rol === "admin" && (
          <details className="crm-menu">
            <summary className={beheer.some(([h]) => h === actief) ? "is-actief" : undefined}>
              Beheer{beheerTeller ? <span className="crm-badge crm-badge--inline">{beheerTeller}</span> : null}
            </summary>
            <div className="crm-menu__lijst">
              <span className="small muted crm-menu__email">🔒 Vraagt het beheerwachtwoord</span>
              {beheer.map(link)}
              <div className="crm-menu__voet"><VergrendelKnop /></div>
            </div>
          </details>
        )}
        <details className="crm-menu">
          <summary className="crm-menu__gebruiker">{user.setter?.naam ?? "Admin"}</summary>
          <div className="crm-menu__lijst">
            <span className="small muted crm-menu__email">{user.email}</span>
            {user.rol === "setter" && <Link href="/crm/overzicht">Mijn cijfers</Link>}
            <Link href="/crm/koppelingen">Koppelingen (Google Agenda)</Link>
            <form action={user.rol === "admin" ? "/api/admin/logout" : "/api/acquisitie/logout"} method="post">
              <button type="submit" className="linkbutton">Uitloggen</button>
            </form>
          </div>
        </details>
      </div>
    </header>
  );
}
