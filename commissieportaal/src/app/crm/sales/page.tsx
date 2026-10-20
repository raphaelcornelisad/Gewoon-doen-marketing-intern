import type { Metadata } from "next";
import { BoardPage, type SP } from "../board-page";

export const metadata: Metadata = { title: "Call geboekt · Gewoon Sales Doen" };
export const dynamic = "force-dynamic";

export default function Sales({ searchParams }: { searchParams: SP }) {
  return <BoardPage pijplijn="sales" searchParams={searchParams} />;
}
