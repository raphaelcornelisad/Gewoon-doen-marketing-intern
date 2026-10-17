import Link from "next/link";

export function AdminBar({ email }: { email: string }) {
  return (
    <div className="admin-bar">
      <span className="admin-bar__links">
        <Link href="/admin">Salonsetters</Link>
        <Link href="/admin/acquisitie">Acquisitie</Link>
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
