import { brand } from "@/config/brand";

const esc = (s: string) =>
  s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);

/** Mail aan de kliniek met de link naar de afvinklijst. Bevat geen setterinformatie. */
export function buildClinicMail(o: { kliniek: string; aantal: number; periode: string; link: string; contactpersoon?: string | null }) {
  const C = brand.kleuren;
  const aanhef = o.contactpersoon ? `Hoi ${o.contactpersoon}` : `Beste team van ${o.kliniek}`;
  const subject = `Opkomst bevestigen: ${o.aantal} afspraken (${o.periode})`;
  const text = [
    `${aanhef},`,
    ``,
    `Via ${brand.naam} zijn er van ${o.periode} ${o.aantal} afspraken bij jullie ingepland. Wil je per klant aangeven of ze is verschenen? Dat kost een paar minuten.`,
    ``,
    `Afvinklijst: ${o.link}`,
    ``,
    `Je hoeft niet in te loggen. Tussendoor opslaan mag; klik op Indienen als je klaar bent.`,
    ``,
    `Met vriendelijke groet,`,
    brand.naam,
  ].join("\n");
  const html = `<!doctype html><html lang="nl"><body style="margin:0;background:${C.vlak};font-family:-apple-system,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;color:${C.tekst};font-size:16px;line-height:1.5">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td align="center" style="padding:24px 12px">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;background:${C.wit};border:1px solid ${C.rand};border-radius:10px;overflow:hidden">
<tr><td style="background:${C.zwart};color:${C.wit};padding:14px 20px;font-weight:700">Gewoon Doen <span style="color:${C.primair}">Marketing</span></td></tr>
<tr><td style="padding:24px 20px">
<p style="margin:0 0 12px">${esc(aanhef)},</p>
<p style="margin:0 0 20px">Via ${esc(brand.naam)} zijn er van <strong>${esc(o.periode)}</strong> <strong>${o.aantal} afspraken</strong> bij jullie ingepland. Wil je per klant aangeven of ze is verschenen? Dat kost een paar minuten.</p>
<p style="margin:0 0 20px"><a href="${esc(o.link)}" style="display:inline-block;background:${C.primair};color:${C.wit};text-decoration:none;font-weight:700;padding:13px 20px;border-radius:8px">Afvinklijst openen</a></p>
<p style="margin:0 0 20px;color:${C.tekstZacht};font-size:14px">Je hoeft niet in te loggen. Tussendoor opslaan mag; klik op Indienen als je klaar bent.</p>
<p style="margin:0">Met vriendelijke groet,<br>${esc(brand.naam)}</p>
</td></tr></table></td></tr></table></body></html>`;
  return { subject, text, html };
}
