import { redirect } from "next/navigation";

// Commissie staat nu in het CRM (grootboek).
export default function AcqPage() {
  redirect("/crm/commissie");
}
