import type { Metadata } from "next";
import { BoardPage, type SP } from "../board-page";

export const metadata: Metadata = { title: "Outbound · CRM" };
export const dynamic = "force-dynamic";

export default function Outbound({ searchParams }: { searchParams: SP }) {
  return <BoardPage pijplijn="outbound" searchParams={searchParams} />;
}
