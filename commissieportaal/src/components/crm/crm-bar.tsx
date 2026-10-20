import Link from "next/link";
import type { CrmUser } from "@/lib/crm/server";
import { VergrendelKnop } from "./vergrendel";

type L = [string, string];

/** Hoofdmenu kort en per rol; beheer (alleen admin) en commissie apart rechts. */
export function CrmBar({ user, actief, open }: { user: CrmUser; actief: string; open?: { beoordelen?: number; inbox?: number } }) {
  const hoofd: L[] =
    user.rol === "admin"
      ? [["/crm", "Dashboard"], ["/crm/outbound", "Outbound"], ["/crm/sales", "Sales"], ["/crm/agenda", "Agenda"], ["/crm/inbox", "Inbox"]]
      : user.rol === "setter"
        ? [["/crm", "Dashboard"], ["/crm/bellen", "Bellen"], ["/crm/outbound", "Outbound"], ["/crm/sales", "Sales"], ["/crm/agenda", "Agenda"], ["/crm/inbox", "Inbox"]]
        : [["/crm", "Dashboard"], ["/crm/sales", "Sales"], ["/crm/agenda", "Agenda"], ["/crm/inbox", "Inbox"]];
  const beheer: L[] = [
    ["/crm/overzicht", "Cijfers"],
    ["/crm/commissie", "Commissie setters"],
    ["/crm/beoordelen", "Beoordelen"],
    ["/crm/import", "Leads importeren"],
    ["/crm/instellingen", "Instellingen"],
    ["/admin", "Commissieportaal (salons)"],
  ];
  const teller = (href: string) => (href === "/crm/beoordelen" ? open?.beoordelen : href === "/crm/inbox" ? open?.inbox : undefined);
  const link = ([href, label]: L) => (
    <Link key={href} href={href} aria-current={actief === href ? "page" : undefined} className={actief === href ? "is-actief" : undefined}>
      {label}
      {teller(href) ? <span className="crm-badge crm-badge--inline">{teller(href)}</span> : null}
    </Link>
  );
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
              Beheer{open?.beoordelen ? <span className="crm-badge crm-badge--inline">{open.beoordelen}</span> : null}
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
            <form action={user.rol === "admin" ? "/api/admin/logout" : "/api/acquisitie/logout"} method="post">
              <button type="submit" className="linkbutton">Uitloggen</button>
            </form>
          </div>
        </details>
      </div>
    </header>
  );
}
