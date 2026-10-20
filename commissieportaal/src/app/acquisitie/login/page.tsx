import { redirect } from "next/navigation";

// Oude link: inloggen gaat nu via de gezamenlijke CRM-login.
export default function AcqLogin() {
  redirect("/crm/login");
}
