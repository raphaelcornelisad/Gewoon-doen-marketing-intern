import { redirect } from "next/navigation";

// Setters loggen in via de acquisitie-login (komen daarna in het CRM); de admin via /admin/login.
export default function CrmLogin() {
  redirect("/acquisitie/login");
}
