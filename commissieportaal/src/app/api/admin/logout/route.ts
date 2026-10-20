import { NextResponse } from "next/server";
import { SESSION_COOKIE } from "@/lib/auth/session";
import { env } from "@/lib/env";

export async function POST() {
  const res = NextResponse.redirect(`${env("APP_URL").replace(/\/$/, "")}/crm/login`, 303);
  res.cookies.set(SESSION_COOKIE, "", { path: "/", maxAge: 0 });
  return res;
}
