import Link from "next/link";
import type { CrmUser } from "@/lib/crm/server";

export function CrmBar({ user, actief, open }: { user: CrmUser; actief: string; open?: { beoordelen?: number; inbox?: number } }) {
  const links: [string, string][] =
    user.rol === "admin"
      ? [["/crm", "Dashboard"], ["/crm/outbound", "Outbound"], ["/crm/sales", "Sales"], ["/crm/agenda", "Agenda"], ["/crm/inbox", "Inbox"], ["/crm/overzicht", "Cijfers"], ["/crm/commissie", "Commissie"], ["/crm/beoordelen", "Beoordelen"], ["/crm/import", "Importeren"], ["/crm/instellingen", "Instellingen"], ["/admin", "Salonsetters"]]
      : user.rol === "setter"
        ? [["/crm", "Mijn dashboard"], ["/crm/bellen", "Bellen"], ["/crm/outbound", "Leads"], ["/crm/sales", "Mijn ingeplande"], ["/crm/agenda", "Agenda"], ["/crm/inbox", "Inbox"], ["/crm/commissie", "Mijn commissie"]]
        : [["/crm", "Dashboard"], ["/crm/sales", "Mijn salesleads"], ["/crm/agenda", "Agenda"], ["/crm/inbox", "Inbox"]];
  const teller = (href: string) => (href === "/crm/beoordelen" ? open?.beoordelen : href === "/crm/inbox" ? open?.inbox : undefined);
  return (
    <div className="admin-bar">
      <nav className="admin-bar__links crm-nav" aria-label="CRM">
        {links.map(([href, label]) => (
          <Link key={href} href={href} aria-current={actief === href ? "page" : undefined} className={actief === href ? "is-actief" : undefined}>
            {label}
            {teller(href) ? <span className="crm-badge crm-badge--inline">{teller(href)}</span> : null}
          </Link>
        ))}
      </nav>
      <span className="admin-bar__right">
        <span className="muted">{user.setter?.naam ?? "Admin"} · {user.email}</span>
        <form action={user.rol === "admin" ? "/api/admin/logout" : "/api/acquisitie/logout"} method="post">
          <button type="submit" className="linkbutton">Uitloggen</button>
        </form>
      </span>
    </div>
  );
}
