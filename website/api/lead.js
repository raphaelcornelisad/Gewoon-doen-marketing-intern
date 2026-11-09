// Vercel serverless function: POST /api/lead
// Aanmelding voor de gratis videotraining (lead magnet).
//  1) Mailt de lead naar het team (LEAD_TO) via Resend.
//  2) Mailt de aanmelder de link naar de training (als MAIL_FROM is ingesteld).
//  3) Stuurt de lead optioneel door naar een webhook (LEAD_WEBHOOK_URL), bijv. het CRM of Zapier/Make.
// Environment Variables in Vercel:
//   RESEND_API_KEY    – API-key van Resend
//   MAIL_FROM         – geverifieerde afzender, bijv. "Gewoon Doen Marketing <info@gewoondoenmarketing.nl>"
//   LEAD_TO           – ontvanger(s) bij Gewoon Doen, komma-gescheiden
//   SITE_URL          – (optioneel) basis-URL voor de link in de bevestigingsmail, standaard https://gewoondoenmarketing.nl
//   LEAD_WEBHOOK_URL  – (optioneel) URL die de lead als JSON ontvangt
//   LEAD_WEBHOOK_SECRET – (optioneel) wordt meegestuurd als header x-webhook-secret

const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const list = (s) => String(s || '').split(',').map((x) => x.trim()).filter(Boolean);
const clean = (v, n) => String(v || '').trim().slice(0, n);

async function resend(body) {
  const r = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: `Bearer ${process.env.RESEND_API_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!r.ok) throw new Error(`resend ${r.status}: ${await r.text()}`);
}

module.exports = async (req, res) => {
  if (req.method !== 'POST') return res.status(405).json({ ok: false, error: 'method' });

  let d = req.body;
  if (typeof d === 'string') { try { d = JSON.parse(d); } catch { d = null; } }
  if (!d || typeof d !== 'object') return res.status(400).json({ ok: false, error: 'body' });
  if (d.website) return res.status(200).json({ ok: true }); // honeypot: bots vullen dit veld

  const voornaam = clean(d.voornaam, 80);
  const email = clean(d.email, 200).toLowerCase();
  if (!voornaam || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return res.status(400).json({ ok: false, error: 'invalid' });

  const lead = {
    voornaam,
    email,
    salon: clean(d.salon, 120),
    telefoon: clean(d.telefoon, 40),
    pagina: clean(d.pagina, 200),
    bron: clean(d.src, 40).toLowerCase().replace(/[^\w.-]/g, '') || 'direct',
    soort: 'videotraining',
    tijdstip: new Date().toISOString(),
  };

  const { RESEND_API_KEY, MAIL_FROM, LEAD_TO, LEAD_WEBHOOK_URL, LEAD_WEBHOOK_SECRET } = process.env;
  const site = (process.env.SITE_URL || 'https://gewoondoenmarketing.nl').replace(/\/$/, '');
  const canMail = Boolean(RESEND_API_KEY && MAIL_FROM);
  if (!(canMail && LEAD_TO) && !LEAD_WEBHOOK_URL) return res.status(500).json({ ok: false, error: 'config' });

  const taken = [];
  if (canMail && LEAD_TO) {
    const rows = [['Voornaam', lead.voornaam], ['E-mail', lead.email], ['Salon', lead.salon || '-'], ['Bron', lead.bron], ['Pagina', lead.pagina],
      ['Tijdstip', new Date().toLocaleString('nl-NL', { timeZone: 'Europe/Amsterdam' })]];
    taken.push(resend({
      from: MAIL_FROM,
      to: list(LEAD_TO),
      reply_to: lead.email,
      subject: `Nieuwe aanmelding videotraining – ${lead.voornaam}${lead.salon ? ' (' + lead.salon + ')' : ''}`,
      html: `<div style="font-family:Arial,sans-serif;font-size:15px;color:#303030"><h2 style="margin:0 0 12px">Nieuwe aanmelding videotraining</h2>
<table cellpadding="6" style="border-collapse:collapse">${rows.map(([k, v]) => `<tr><td style="color:#6b6b6b">${esc(k)}</td><td><strong>${esc(v)}</strong></td></tr>`).join('')}</table></div>`,
      text: rows.map(([k, v]) => `${k}: ${v}`).join('\n'),
    }));
  }
  if (canMail) {
    const link = `${site}/training?t=1`;
    taken.push(resend({
      from: MAIL_FROM,
      to: [lead.email],
      subject: 'Je gratis videotraining staat klaar',
      html: `<div style="font-family:Arial,sans-serif;font-size:16px;line-height:1.6;color:#303030;max-width:560px">
<p>Hoi ${esc(lead.voornaam)},</p>
<p>Fijn dat je de training wilt bekijken. Je kunt hem hier direct afspelen:</p>
<p><a href="${esc(link)}" style="display:inline-block;background:#ab2425;color:#fff;text-decoration:none;padding:12px 22px;border-radius:999px;font-weight:bold">Bekijk de training</a></p>
<p>Onder de video kun je meteen een gratis gesprek inplannen als je wilt dat we met je meekijken.</p>
<p>Groet,<br>Team Gewoon Doen Marketing</p></div>`,
      text: `Hoi ${lead.voornaam},\n\nJe gratis videotraining staat klaar: ${link}\n\nGroet,\nTeam Gewoon Doen Marketing`,
    }));
  }
  if (LEAD_WEBHOOK_URL) {
    taken.push(fetch(LEAD_WEBHOOK_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...(LEAD_WEBHOOK_SECRET ? { 'x-webhook-secret': LEAD_WEBHOOK_SECRET } : {}) },
      body: JSON.stringify(lead),
    }).then((r) => { if (!r.ok) throw new Error(`webhook ${r.status}`); }));
  }

  const uitkomst = await Promise.allSettled(taken);
  uitkomst.filter((u) => u.status === 'rejected').forEach((u) => console.error('lead', u.reason));
  // De bezoeker krijgt de training zodra minstens één kanaal de lead heeft vastgelegd.
  if (!uitkomst.some((u) => u.status === 'fulfilled')) return res.status(502).json({ ok: false, error: 'send' });
  return res.status(200).json({ ok: true });
};
