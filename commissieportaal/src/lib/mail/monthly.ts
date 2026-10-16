import { brand } from "@/config/brand";
import type { PeriodRange } from "../period";

const esc = (s: string) =>
  s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);

export function submitLink(appUrl: string, email: string) {
  return `${appUrl.replace(/\/$/, "")}/indienen?email=${encodeURIComponent(email)}`;
}

/** Maandelijkse herinnering aan een setter om de leadlijst in te dienen. */
export function buildMonthlyMail(naam: string, email: string, periode: PeriodRange, appUrl: string) {
  const link = submitLink(appUrl, email);
  const C = brand.kleuren;
  const voornaam = naam.trim().split(/\s+/)[0] || naam;
  const subject = `Lever je leadlijst in · ${periode.label}`;
  const text = [
    `Hoi ${voornaam},`,
    ``,
    `De periode ${periode.label} zit erop. Lever je leadlijst in via deze link:`,
    link,
    ``,
    `Zorg dat je Google Sheet gedeeld is: Delen → Algemene toegang → Iedereen met de link → Lezer.`,
    ``,
    `Groet,`,
    brand.naam,
  ].join("\n");
  const html = `<!doctype html><html lang="nl"><body style="margin:0;background:${C.vlak};font-family:-apple-system,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;color:${C.tekst};font-size:16px;line-height:1.5">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td align="center" style="padding:24px 12px">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;background:${C.wit};border:1px solid ${C.rand};border-radius:10px;overflow:hidden">
<tr><td style="background:${C.zwart};color:${C.wit};padding:14px 20px;font-weight:700">Gewoon Doen <span style="color:${C.primair}">Marketing</span></td></tr>
<tr><td style="padding:24px 20px">
<p style="margin:0 0 12px">Hoi ${esc(voornaam)},</p>
<p style="margin:0 0 20px">De periode <strong>${esc(periode.label)}</strong> zit erop. Lever je leadlijst in via de knop hieronder.</p>
<p style="margin:0 0 20px"><a href="${esc(link)}" style="display:inline-block;background:${C.primair};color:${C.wit};text-decoration:none;font-weight:700;padding:13px 20px;border-radius:8px">Leadlijst indienen</a></p>
<p style="margin:0 0 20px;color:${C.tekstZacht};font-size:14px">Zorg dat je Google Sheet gedeeld is: Delen → Algemene toegang → Iedereen met de link → Lezer.</p>
<p style="margin:0">Groet,<br>${esc(brand.naam)}</p>
</td></tr></table></td></tr></table></body></html>`;
  return { subject, text, html };
}
