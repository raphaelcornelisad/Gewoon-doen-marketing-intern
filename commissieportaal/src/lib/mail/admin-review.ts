import { brand } from "@/config/brand";
import { formatEuro } from "../commission";
import type { SubmittedDetails } from "../submissions/submit";
import type { Warning } from "../sheets/types";

export interface AdminReviewOptions {
  submissionId: string;
  appUrl: string;
  vervangen: boolean;
  nieuweSetter: boolean;
  /** Tabs met groene leads waarvan de salon niet is herkend */
  nietHerkend?: { tab: string; groen: number }[];
}

const esc = (s: string | number) =>
  String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);

const C = brand.kleuren;
const TH = `style="text-align:left;padding:6px 8px;border-bottom:2px solid ${C.rand};font-size:12px;color:${C.tekstZacht};text-transform:uppercase;letter-spacing:.04em"`;
const THR = TH.replace("text-align:left", "text-align:right");
const TD = `style="padding:6px 8px;border-bottom:1px solid ${C.rand}"`;
const TDR = `style="padding:6px 8px;border-bottom:1px solid ${C.rand};text-align:right;font-variant-numeric:tabular-nums"`;

const WARNING_LABEL: Record<Warning["type"], string> = {
  telling_wijkt_af: "Eigen telling wijkt af",
  te_veel_pogingen: "Meer dan 4 x",
  kolom_ontbreekt: "Kolom ontbreekt",
  ongekleurd: "Ongekleurde rij",
};
const WARNING_ORDER: Warning["type"][] = ["telling_wijkt_af", "te_veel_pogingen", "kolom_ontbreekt", "ongekleurd"];

function formula(d: SubmittedDetails, key: string, aantal: number, tarief: number): string {
  switch (key) {
    case "admin":
      return "vast bedrag";
    case "leads":
      return `${aantal} × ${formatEuro(tarief)} (${d.commission.instellingen.countedColors.join(" + ")})`;
    case "staffel":
      return `floor(${d.commission.meetellendeLeads} / 100) = ${aantal} × ${formatEuro(tarief)}`;
    case "opkomst":
      return aantal ? `${aantal} verschenen × ${formatEuro(tarief)}` : "nog geen bevestigde opkomst";
    default:
      return "";
  }
}

export function buildAdminReviewMail(d: SubmittedDetails, o: AdminReviewOptions) {
  const link = `${o.appUrl.replace(/\/$/, "")}/admin/indiening/${o.submissionId}`;
  const t = d.parsed.totaal;
  const tabs = d.parsed.tabs.filter((x) => !x.overgeslagen);
  const skipped = d.parsed.tabs.filter((x) => x.overgeslagen);
  const warnings = [...d.parsed.waarschuwingen].sort(
    (a, b) => WARNING_ORDER.indexOf(a.type) - WARNING_ORDER.indexOf(b.type),
  );
  const totaal = formatEuro(d.commission.totaalCents);

  const subject = `Te controleren: ${d.setterNaam} · ${d.periode.label} · ${totaal}`;

  const badges = [
    o.nieuweSetter ? "Nieuwe setter" : null,
    o.vervangen ? "Vervangt een eerdere indiening" : null,
  ].filter(Boolean) as string[];

  const html = `<!doctype html><html lang="nl"><body style="margin:0;background:${C.vlak};font-family:-apple-system,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;color:${C.tekst};font-size:15px;line-height:1.5">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${C.vlak}"><tr><td align="center" style="padding:24px 12px">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:640px;background:${C.wit};border:1px solid ${C.rand};border-radius:10px;overflow:hidden">
<tr><td style="background:${C.zwart};color:${C.wit};padding:14px 20px;font-weight:700">Gewoon Doen <span style="color:${C.primair}">Marketing</span> <span style="color:#BDBDBD;font-weight:400;font-size:13px">· ${esc(brand.portaalNaam)}</span></td></tr>
<tr><td style="padding:20px">
<p style="margin:0 0 6px"><span style="display:inline-block;background:#FEF4D6;color:#8A5A00;font-size:12px;font-weight:700;letter-spacing:.04em;text-transform:uppercase;padding:3px 9px;border-radius:999px">Moet gecontroleerd worden</span></p>
<h1 style="font-size:22px;margin:8px 0 4px">${esc(d.setterNaam)}</h1>
<p style="margin:0;color:${C.tekstZacht}">${esc(d.setterEmail)}${badges.length ? ` · <strong style="color:${C.primair}">${badges.map(esc).join(" · ")}</strong>` : ""}</p>
<p style="margin:8px 0 0">Periode <strong>${esc(d.periode.label)}</strong> · Sheet <a href="${esc(d.sheetUrl)}" style="color:${C.primair}">${esc(d.parsed.titel || "openen")}</a></p>

<p style="margin:20px 0 8px;font-size:30px;font-weight:800">${esc(totaal)}</p>
<p style="margin:0 0 16px"><a href="${esc(link)}" style="display:inline-block;background:${C.primair};color:${C.wit};text-decoration:none;font-weight:700;padding:11px 18px;border-radius:8px">Open controlepagina</a></p>

<h2 style="font-size:16px;margin:20px 0 6px">Berekening</h2>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse">
${d.commission.regels
  .map(
    (r) =>
      `<tr><td ${TD}>${esc(r.label)}<br><span style="color:${C.tekstZacht};font-size:13px">${esc(formula(d, r.key, r.aantal, r.tariefCents))}</span></td><td ${TDR}>${esc(formatEuro(r.bedragCents))}</td></tr>`,
  )
  .join("")}
<tr><td style="padding:8px;font-weight:700">Totaal</td><td style="padding:8px;text-align:right;font-weight:700">${esc(totaal)}</td></tr>
</table>

<h2 style="font-size:16px;margin:20px 0 6px">Totalen</h2>
<p style="margin:0">Groen <strong>${t.groen}</strong> · Geel <strong>${t.geel}</strong> · Rood <strong>${t.rood}</strong> · Ongekleurd <strong>${t.ongekleurd}</strong> · Contactpogingen <strong>${t.pogingen}</strong></p>

<h2 style="font-size:16px;margin:20px 0 6px">Telling per tab</h2>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;font-size:14px">
<tr><th ${TH}>Tab</th><th ${THR}>G</th><th ${THR}>Y</th><th ${THR}>R</th><th ${THR}>Wit</th><th ${THR}>x</th><th ${THR}>Eigen</th></tr>
${tabs
  .map((x) => {
    const afwijkend = x.eigenTelling !== null && x.eigenTelling !== x.counts.groen;
    return `<tr><td ${TD}>${esc(x.tab)}</td><td ${TDR}>${x.counts.groen}</td><td ${TDR}>${x.counts.geel}</td><td ${TDR}>${x.counts.rood}</td><td ${TDR}>${x.counts.ongekleurd}</td><td ${TDR}>${x.counts.pogingen}</td><td ${TDR}>${afwijkend ? `<strong style="color:${C.primair}">${x.eigenTelling}</strong>` : (x.eigenTelling ?? "–")}</td></tr>`;
  })
  .join("")}
<tr><td style="padding:6px 8px;font-weight:700">Totaal</td><td ${TDR}><strong>${t.groen}</strong></td><td ${TDR}><strong>${t.geel}</strong></td><td ${TDR}><strong>${t.rood}</strong></td><td ${TDR}><strong>${t.ongekleurd}</strong></td><td ${TDR}><strong>${t.pogingen}</strong></td><td ${TDR}></td></tr>
</table>
${skipped.length ? `<p style="margin:8px 0 0;color:${C.tekstZacht};font-size:13px">Overgeslagen: ${skipped.map((x) => `${esc(x.tab)} (${esc(x.reden ?? "")})`).join(", ")}</p>` : ""}

${o.nietHerkend?.length ? `<h2 style="font-size:16px;margin:20px 0 6px;color:${C.primair}">Salon niet herkend (${o.nietHerkend.length})</h2><p style="margin:0 0 6px">Deze tabs krijgen geen afvinklijst. Tabnaam moet de volledige salonnaam zijn (bijv. "Babeau Huidinstituut - Laser").</p><ul style="margin:0;padding-left:18px">${o.nietHerkend.map((u) => `<li>${esc(u.tab)} (${u.groen} groen)</li>`).join("")}</ul>` : ""}
<h2 style="font-size:16px;margin:20px 0 6px">Waarschuwingen (${warnings.length})</h2>
${
  warnings.length
    ? `<ul style="margin:0;padding-left:18px">${warnings
        .map((w) => `<li style="margin:2px 0"><strong>${esc(WARNING_LABEL[w.type])}</strong> · ${esc(w.tab)}: ${esc(w.bericht.replace(/^Tabblad "[^"]+":\s*/, ""))}</li>`)
        .join("")}</ul>`
    : `<p style="margin:0">Geen waarschuwingen.</p>`
}

<p style="margin:24px 0 0"><a href="${esc(link)}" style="color:${C.primair};font-weight:700">Open de controlepagina →</a></p>
</td></tr></table>
</td></tr></table></body></html>`;

  const text = [
    `Moet gecontroleerd worden`,
    ``,
    `Setter: ${d.setterNaam} <${d.setterEmail}>${badges.length ? ` (${badges.join(", ")})` : ""}`,
    `Periode: ${d.periode.label}`,
    `Sheet: ${d.parsed.titel} – ${d.sheetUrl}`,
    ``,
    `BEREKENING`,
    ...d.commission.regels.map(
      (r) => `- ${r.label}: ${formatEuro(r.bedragCents)} (${formula(d, r.key, r.aantal, r.tariefCents)})`,
    ),
    `Totaal: ${totaal}`,
    ``,
    `TOTALEN`,
    `Groen ${t.groen} · Geel ${t.geel} · Rood ${t.rood} · Ongekleurd ${t.ongekleurd} · Contactpogingen ${t.pogingen}`,
    ``,
    `PER TAB (G/Y/R/wit/x)`,
    ...tabs.map(
      (x) =>
        `- ${x.tab}: ${x.counts.groen}/${x.counts.geel}/${x.counts.rood}/${x.counts.ongekleurd}/${x.counts.pogingen}` +
        (x.eigenTelling !== null ? ` · eigen telling ${x.eigenTelling}` : ""),
    ),
    ...(skipped.length ? [`Overgeslagen: ${skipped.map((x) => x.tab).join(", ")}`] : []),
    ``,
    ...(o.nietHerkend?.length
      ? [`SALON NIET HERKEND (${o.nietHerkend.length})`, ...o.nietHerkend.map((u) => `- ${u.tab} (${u.groen} groen)`), ``]
      : []),
    `WAARSCHUWINGEN (${warnings.length})`,
    ...(warnings.length ? warnings.map((w) => `- ${WARNING_LABEL[w.type]} · ${w.tab}: ${w.bericht}`) : ["Geen."]),
    ``,
    `Controlepagina: ${link}`,
  ].join("\n");

  return { subject, html, text };
}
