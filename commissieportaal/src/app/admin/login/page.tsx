import { redirect } from "next/navigation";

// Inloggen gaat via de gezamenlijke CRM-login.
export default function AdminLogin() {
  redirect("/crm/login");
}
