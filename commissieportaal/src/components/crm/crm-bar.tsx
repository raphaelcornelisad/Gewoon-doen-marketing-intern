import Link from "next/link";
import type { CrmUser } from "@/lib/crm/server";

export function CrmBar({ user, actief }: { user: CrmUser; actief: string }) {
  const links: [string, string][] =
    user.rol === "admin"
      ? [["/crm/outbound", "Outbound"], ["/crm/sales", "Sales"], ["/crm/overzicht", "Cijfers"], ["/crm/import", "Importeren"], ["/admin", "Admin"]]
      : [["/crm/outbound", "Outbound"], ["/crm/sales", "Mijn ingeplande"], ["/crm/overzicht", "Mijn cijfers"], ["/acquisitie", "Mijn commissie"]];
  return (
    <div className="admin-bar">
      <span className="admin-bar__links">
        {links.map(([href, label]) => (
          <Link key={href} href={href} aria-current={actief === href ? "page" : undefined} className={actief === href ? "is-actief" : undefined}>
            {label}
          </Link>
        ))}
      </span>
      <span className="admin-bar__right">
        <span className="muted">{user.email}</span>
        <form action={user.rol === "admin" ? "/api/admin/logout" : "/api/acquisitie/logout"} method="post">
          <button type="submit" className="linkbutton">Uitloggen</button>
        </form>
      </span>
    </div>
  );
}
