import Link from "next/link";

export function AdminBar({ email }: { email: string }) {
  return (
    <div className="admin-bar">
      <span className="admin-bar__links">
        <Link href="/crm">← CRM</Link>
        <Link href="/admin">Salonsetters</Link>
        <Link href="/crm/commissie">Commissie acquisitie</Link>
        <Link href="/admin/reactivatie">Reactivatie</Link>
        <Link href="/crm">CRM</Link>
      </span>
      <span className="admin-bar__right">
        <span className="muted">{email}</span>
        <form action="/api/admin/logout" method="post">
          <button type="submit" className="linkbutton">Uitloggen</button>
        </form>
      </span>
    </div>
  );
}
