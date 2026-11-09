#!/usr/bin/env python3
"""Bouwt de statische website van Gewoon Doen Marketing uit bron/site.json + bron/insights/*.json naar public/.

Gebruik:  python3 build.py
Geen dependencies nodig (alleen de standaardbibliotheek). Vercel serveert public/ en api/ (zie vercel.json).
"""
import datetime
import glob
import hashlib
import html
import json
import os
import re

HIER = os.path.dirname(os.path.abspath(__file__))
PUB = os.path.join(HIER, 'public')
S = json.load(open(os.path.join(HIER, 'bron/site.json'), encoding='utf-8'))
DOMEIN = S['domein'].rstrip('/')
B = S['bedrijf']
L = S['links']
PREVIEW = bool(S.get('preview'))
VANDAAG = datetime.date.today().isoformat()

ARTIKELEN = []
for f in sorted(glob.glob(os.path.join(HIER, 'bron/insights/*.json'))):
    a = json.load(open(f, encoding='utf-8'))
    a.setdefault('slug', os.path.splitext(os.path.basename(f))[0])
    ARTIKELEN.append(a)
ARTIKELEN.sort(key=lambda a: (a.get('datum', ''), a['slug']), reverse=True)
CATEGORIEEN = ['Behandelingen', 'Leads & opvolging', 'Ondernemen', 'Content & social']

e = lambda s: html.escape(str(s or ''), quote=True)
MAANDEN = ['januari', 'februari', 'maart', 'april', 'mei', 'juni', 'juli', 'augustus', 'september', 'oktober', 'november', 'december']


def datum_nl(iso):
    try:
        d = datetime.date.fromisoformat(iso)
        return f'{d.day} {MAANDEN[d.month - 1]} {d.year}'
    except Exception:
        return iso or ''


def leestijd(a):
    tekst = ' '.join([a.get('intro', '')] + [re.sub('<[^>]+>', ' ', s.get('html', '')) for s in a.get('secties', [])])
    return max(2, round(len(tekst.split()) / 220))


def klein(naam):
    """'Botox & fillers' -> 'botox & fillers', maar PMU, PRX-therapie en Profhilo houden hun hoofdletters."""
    return naam if naam[:2].isupper() or naam.startswith('Profhilo') else naam[0].lower() + naam[1:]


def slugify(s):
    s = s.lower()
    for k, v in {'é': 'e', 'ë': 'e', 'è': 'e', 'ï': 'i', 'ö': 'o', 'ü': 'u', '&': 'en'}.items():
        s = s.replace(k, v)
    return re.sub(r'[^a-z0-9]+', '-', s).strip('-')


# ---------- Iconen (lijn, 24x24, currentColor) ----------
IC = {
    'pijl': '<path d="M5 12h14M13 6l6 6-6 6"/>',
    'speel': '<path d="M7 4.5v15l12.5-7.5z" fill="currentColor" stroke="none"/>',
    'vink': '<path d="m4.5 12.5 4.5 4.5L19.5 6.5"/>',
    'kruis': '<path d="M6 6l12 12M18 6 6 18"/>',
    'chev': '<path d="m6 9 6 6 6-6"/>',
    'ster': '<path d="m12 2.8 2.85 5.78 6.38.93-4.62 4.5 1.09 6.35L12 17.36l-5.7 3 1.09-6.35-4.62-4.5 6.38-.93z" fill="currentColor" stroke="none"/>',
    'kalender': '<rect x="3" y="4.5" width="18" height="17" rx="2.5"/><path d="M16 2.5v4M8 2.5v4M3 10h18"/>',
    'telefoon': '<path d="M21.5 16.9v3a2 2 0 0 1-2.2 2 19.8 19.8 0 0 1-8.6-3.1 19.5 19.5 0 0 1-6-6A19.8 19.8 0 0 1 1.6 4.2 2 2 0 0 1 3.6 2h3a2 2 0 0 1 2 1.7c.1 1 .4 1.9.7 2.8a2 2 0 0 1-.5 2.1L7.6 9.9a16 16 0 0 0 6 6l1.3-1.3a2 2 0 0 1 2.1-.4c.9.3 1.8.6 2.8.7a2 2 0 0 1 1.7 2z"/>',
    'camera': '<path d="M14.5 4h-5L7.5 6.5H4a2 2 0 0 0-2 2V18a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V8.5a2 2 0 0 0-2-2h-3.5z"/><circle cx="12" cy="13" r="3.5"/>',
    'megafoon': '<path d="m3 11 15-6v14L3 13z"/><path d="M11.6 16.8a3 3 0 1 1-5.8-1.6"/>',
    'chat': '<path d="M7.9 20A9 9 0 1 0 4 16.1L2.5 21.5z"/>',
    'groei': '<path d="M3 17l6-6 4 4 8-8"/><path d="M14 7h7v7"/>',
    'hart': '<path d="M19 14c1.5-1.5 3-3.2 3-5.5A5.5 5.5 0 0 0 16.5 3c-1.8 0-3 .5-4.5 2-1.5-1.5-2.7-2-4.5-2A5.5 5.5 0 0 0 2 8.5c0 2.3 1.5 4 3 5.5l7 7z"/>',
    'herhaal': '<path d="M17 2.5 21 6.5l-4 4"/><path d="M3 11.5v-1a4 4 0 0 1 4-4h14M7 21.5l-4-4 4-4"/><path d="M21 12.5v1a4 4 0 0 1-4 4H3"/>',
    'doel': '<circle cx="12" cy="12" r="9.5"/><circle cx="12" cy="12" r="5.5"/><circle cx="12" cy="12" r="1.5"/>',
    'schild': '<path d="M12 21.5s7.5-3.6 7.5-9.4V5.6L12 2.8 4.5 5.6v6.5c0 5.8 7.5 9.4 7.5 9.4z"/><path d="m9 12 2.1 2.1L15.2 10"/>',
    'handdruk': '<path d="m11 17 2 2a1 1 0 1 0 3-3"/><path d="m14 14 2.5 2.5a1 1 0 1 0 3-3l-3.9-3.9a3 3 0 0 0-4.2 0l-.9.9a1 1 0 1 1-3-3l2.8-2.8a5.8 5.8 0 0 1 7.1-.9l.5.3a2 2 0 0 0 1.4.2L21 4"/><path d="m21 3 1 11h-2M3 3 2 14l6.5 6.5a1 1 0 1 0 3-3M3 4h8"/>',
    'mail': '<rect x="2.5" y="4.5" width="19" height="15" rx="2.5"/><path d="m3 6.5 9 6.5 9-6.5"/>',
    'boek': '<path d="M4 19.5v-15A2.5 2.5 0 0 1 6.5 2H20v20H6.5a2.5 2.5 0 0 1 0-5H20"/>',
}


def ic(naam, cls=''):
    c = f' class="{cls}"' if cls else ''
    return f'<svg{c} viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">{IC[naam]}</svg>'


PIJL = ic('pijl')


def knop(tekst, href, soort='knop-rood', extra='', pijl=True):
    return f'<a class="knop {soort}" href="{e(href)}"{extra}>{e(tekst)}{PIJL if pijl else ""}</a>'


def knop_kennismaken(soort='knop-rood', tekst='Plan een kennismaking'):
    return knop(tekst, '/kennismaken', soort)


# ---------- Omslagen voor Insights (SVG, geen stockfoto's nodig) ----------
PALET = {
    'Behandelingen': ('#ab2425', '#e25a54', '#fff'),
    'Leads & opvolging': ('#0d0d0d', '#5a1416', '#e25a54'),
    'Ondernemen': ('#303030', '#0d0d0d', '#e25a54'),
    'Content & social': ('#f7eeec', '#e25a54', '#5a1416'),
}


def omslag(a, breed=False):
    c1, c2, acc = PALET.get(a.get('categorie'), PALET['Ondernemen'])
    h = int(hashlib.md5(a['slug'].encode()).hexdigest(), 16)
    gid = 'g' + a['slug'][:20].replace('-', '') + ('b' if breed else '')
    w, hh = (1050, 400) if breed else (800, 500)
    tekstkleur = '#5a1416' if a.get('categorie') == 'Content & social' else '#ffffff'
    cx, cy, r = w * (0.55 + (h % 30) / 100), hh * (0.2 + (h >> 5) % 40 / 100), 120 + (h >> 9) % 140
    kort = a.get('behandeling') or a.get('categorie', '')
    lijnen = ''.join(f'<path d="M0 {y} L{w} {y}" />' for y in range(40, hh, 40))
    kolommen = ''.join(f'<path d="M{x} 0 L{x} {hh}" />' for x in range(40, w, 40))
    return (f'<svg viewBox="0 0 {w} {hh}" preserveAspectRatio="xMidYMid slice" role="img" aria-label="{e(a["titel"])}">'
            f'<defs><linearGradient id="{gid}" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="{c1}"/><stop offset="1" stop-color="{c2}"/></linearGradient>'
            f'<radialGradient id="{gid}r"><stop offset="0" stop-color="{acc}" stop-opacity=".55"/><stop offset="1" stop-color="{acc}" stop-opacity="0"/></radialGradient></defs>'
            f'<rect width="{w}" height="{hh}" fill="url(#{gid})"/>'
            f'<g stroke="{tekstkleur}" stroke-opacity=".08" stroke-width="1">{lijnen}{kolommen}</g>'
            f'<circle cx="{cx:.0f}" cy="{cy:.0f}" r="{r * 2}" fill="url(#{gid}r)"/>'
            f'<circle cx="{cx:.0f}" cy="{cy:.0f}" r="{r}" fill="none" stroke="{tekstkleur}" stroke-opacity=".35" stroke-width="1.5"/>'
            f'<circle cx="{cx:.0f}" cy="{cy:.0f}" r="{r * .55:.0f}" fill="none" stroke="{tekstkleur}" stroke-opacity=".25" stroke-width="1.5" stroke-dasharray="4 8"/>'
            f'<text x="44" y="{hh - 48}" fill="{tekstkleur}" font-family="Inter Tight, Arial, sans-serif" font-weight="700" font-size="{54 if breed else 46}" letter-spacing="-1.5">{e(kort)}</text>'
            f'<text x="46" y="{hh - 108 if breed else hh - 100}" fill="{tekstkleur}" fill-opacity=".7" font-family="Inter, Arial, sans-serif" font-weight="600" font-size="18" letter-spacing="3">GEWOON DOEN INSIGHTS</text>'
            f'</svg>')


# ---------- Layout ----------
NAV = [('Aanpak', '/aanpak'), ('Resultaten', '/resultaten'), ('Insights', '/insights'), ('Over ons', '/over-ons')]


def header(actief):
    spec = ''.join(f'<a href="/marketing-voor/{s["slug"]}">{e(s["naam"])}<small>{e(s["kop"])}</small></a>' for s in S['specialisaties'])
    links = []
    for naam, href in NAV:
        cur = ' aria-current="page"' if actief == href else ''
        links.append(f'<a href="{href}"{cur}>{naam}</a>')
        if href == '/aanpak':
            links.append(f'<div class="dropdown"><button type="button" aria-expanded="false" aria-haspopup="true">Specialisaties{ic("chev")}</button><div class="dropdown-menu">{spec}</div></div>')
    aank = S.get('aankondiging') or {}
    aank_html = (f'<div class="aankondiging"><a href="{e(aank["link"])}"><span class="badge-nieuw">{e(aank["label"])}</span><span>{e(aank["tekst"])} →</span></a></div>' if aank.get('tekst') else '')
    return f'''{aank_html}
<header class="header">
  <div class="wrap">
    <a class="logo" href="/" aria-label="Gewoon Doen Marketing, naar de homepagina"><img src="/img/logo-mark.png" alt="" width="34" height="34">Gewoon Doen Marketing</a>
    <button class="menuknop" type="button" aria-label="Menu" aria-expanded="false" aria-controls="hoofdmenu"><span></span></button>
    <nav class="nav" id="hoofdmenu" aria-label="Hoofdmenu">
      {''.join(links)}
      <a class="knop knop-licht knop-klein" href="/gratis-training">Gratis training</a>
      <a class="knop knop-rood knop-klein" href="/kennismaken">Plan een kennismaking</a>
    </nav>
  </div>
</header>'''


def footer():
    spec = ''.join(f'<li><a href="/marketing-voor/{s["slug"]}">{e(s["naam"])}</a></li>' for s in S['specialisaties'])
    soc = ''
    if B.get('instagram'):
        soc += f'<li><a href="{e(B["instagram"])}" rel="noopener" target="_blank">Instagram</a></li>'
    if B.get('linkedin'):
        soc += f'<li><a href="{e(B["linkedin"])}" rel="noopener" target="_blank">LinkedIn</a></li>'
    soc += f'<li><a href="{e(L["trustpilot"])}" rel="noopener" target="_blank">Trustpilot</a></li>'
    kvk = f' · KvK {e(B["kvk"])}' if B.get('kvk') else ''
    return f'''<footer class="footer">
  <div class="wrap">
    <div class="footer-grid">
      <div>
        <a class="logo" href="/"><img src="/img/logo-mark-wit.png" alt="" width="34" height="34">Gewoon Doen Marketing</a>
        <p>Marketing voor beautysalons en klinieken. Jij doet de behandeling, wij vullen je agenda.</p>
        <p><a href="mailto:{e(B["email"])}">{e(B["email"])}</a></p>
      </div>
      <div><h4>Gewoon Doen</h4><ul><li><a href="/aanpak">Aanpak</a></li><li><a href="/resultaten">Resultaten</a></li><li><a href="/over-ons">Over ons</a></li><li><a href="/insights">Insights</a></li><li><a href="/gratis-training">Gratis training</a></li><li><a href="/kennismaken">Kennismaken</a></li></ul></div>
      <div><h4>Specialisaties</h4><ul>{spec}</ul></div>
      <div><h4>Volg ons</h4><ul>{soc}</ul></div>
    </div>
    <p class="footer-slogan" aria-hidden="true">Gewoon doen.</p>
    <div class="footer-onder"><span>© {datetime.date.today().year} Gewoon Doen Marketing{kvk}</span><span><a href="/privacy">Privacy &amp; cookies</a></span></div>
  </div>
</footer>
<div class="mobiele-cta" aria-label="Snelle acties"><a class="knop knop-licht" href="/gratis-training">Gratis training</a><a class="knop knop-rood" href="/kennismaken">Kennismaken</a></div>'''


def layout(pad, titel, beschrijving, body, actief='', schema=None, og_type='website', head_extra=''):
    url = DOMEIN + (pad if pad != '/' else '/')
    if 'Gewoon Doen' in titel:
        volledige_titel = titel
    elif len(titel) <= 40:
        volledige_titel = f'{titel} | Gewoon Doen Marketing'
    elif len(titel) <= 50:
        volledige_titel = f'{titel} | Gewoon Doen'
    else:
        volledige_titel = titel
    robots = '<meta name="robots" content="noindex,nofollow">' if PREVIEW else '<meta name="robots" content="index,follow,max-image-preview:large">'
    org = {
        '@context': 'https://schema.org', '@type': 'Organization', 'name': B['naam'], 'url': DOMEIN,
        'logo': DOMEIN + '/img/apple-touch-icon.png', 'email': B['email'],
        'sameAs': [x for x in [B.get('instagram'), B.get('linkedin'), L.get('trustpilot')] if x],
    }
    blokken = [org] + (schema or [])
    ld = ''.join(f'<script type="application/ld+json">{json.dumps(x, ensure_ascii=False)}</script>' for x in blokken)
    return f'''<!doctype html>
<html lang="nl" class="no-js">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>{e(volledige_titel)}</title>
<meta name="description" content="{e(beschrijving)}">
{robots}
<link rel="canonical" href="{e(url)}">
<meta property="og:type" content="{og_type}">
<meta property="og:title" content="{e(volledige_titel)}">
<meta property="og:description" content="{e(beschrijving)}">
<meta property="og:url" content="{e(url)}">
<meta property="og:image" content="{DOMEIN}/img/og.jpg">
<meta property="og:locale" content="nl_NL">
<meta name="twitter:card" content="summary_large_image">
<meta name="theme-color" content="#0d0d0d">
<link rel="icon" href="/img/favicon.png" type="image/png">
<link rel="apple-touch-icon" href="/img/apple-touch-icon.png">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Inter+Tight:wght@500;600;700&family=Inter:wght@400;500;600;700&display=swap">
<link rel="stylesheet" href="/assets/site.css?v={VERSIE}">
{head_extra}{ld}
</head>
<body>
<a class="sr" href="#inhoud">Direct naar de inhoud</a>
{header(actief)}
<main id="inhoud">
{body}
</main>
{footer()}
<script src="/assets/site.js?v={VERSIE}" defer></script>
</body>
</html>
'''


def schrijf(pad, inhoud):
    if pad == '/':
        bestand = os.path.join(PUB, 'index.html')
    elif os.path.isdir(os.path.join(PUB, pad.strip('/'))) or pad == '/insights':
        bestand = os.path.join(PUB, pad.strip('/'), 'index.html')  # map + pagina met dezelfde naam: index in de map
    else:
        bestand = os.path.join(PUB, pad.strip('/') + '.html')
    os.makedirs(os.path.dirname(bestand), exist_ok=True)
    with open(bestand, 'w', encoding='utf-8') as f:
        f.write(inhoud)
    PAGINAS.append(pad)


def kruimel(*stukken):
    delen = ['<a href="/">Home</a>']
    for naam, href in stukken:
        delen.append('<span aria-hidden="true">/</span>')
        delen.append(f'<a href="{href}">{e(naam)}</a>' if href else f'<span>{e(naam)}</span>')
    return f'<nav class="kruimel" aria-label="Kruimelpad">{"".join(delen)}</nav>'


def kruimel_schema(*stukken):
    items = [{'@type': 'ListItem', 'position': 1, 'name': 'Home', 'item': DOMEIN + '/'}]
    for i, (naam, href) in enumerate(stukken, 2):
        items.append({'@type': 'ListItem', 'position': i, 'name': naam, 'item': DOMEIN + href})
    return {'@context': 'https://schema.org', '@type': 'BreadcrumbList', 'itemListElement': items}


def paginakop(label, titel, lead, kruim, knoppen=''):
    return f'''<section class="paginakop"><div class="wrap">
  {kruim}
  <p class="label">{e(label)}</p>
  <h1>{titel}</h1>
  <p class="lead">{lead}</p>
  {f'<div class="knoppen" style="margin-top:28px">{knoppen}</div>' if knoppen else ''}
</div></section>'''


# ---------- Herbruikbare secties ----------
def gezichten(n=4):
    return ''.join(f'<img src="/img/eigenaren/{e(c["foto"])}" alt="" width="52" height="52" loading="lazy">' for c in S['cases'][:n])


def sterren_tp():
    return '<span class="sterren" aria-hidden="true">' + ''.join(f'<b>{ic("ster")}</b>' for _ in range(5)) + '</span>'


def sectie_vsl():
    collage = ''.join(f'<img src="/img/eigenaren/{e(c["foto"])}" alt="" loading="eager">' for c in S['cases'][:4])
    v = S['video']
    return f'''<div class="vsl-plek onthul" data-vsl="{e(v.get("vsl_embed", ""))}">
  <div class="vsl">
    <button class="vsl-poster" type="button" aria-label="Bekijk de video over hoe Gewoon Doen werkt">
      <span class="collage" aria-hidden="true">{collage}</span>
      <span class="speel" aria-hidden="true">{ic("speel")}</span>
      <span class="bijschrift"><strong>Zo vullen wij de agenda van salons en klinieken</strong><span>Bekijk de video · {e(v.get("vsl_duur", ""))}</span></span>
    </button>
    <button class="vsl-sluit" type="button" aria-label="Video sluiten">×</button>
  </div>
</div>'''


def sectie_marquee(titel='Salons en klinieken die al met ons werken'):
    namen = ''.join(f'<span>{e(n)}</span>' for n in S['klanten'])
    return f'''<section class="marquee-blok" aria-label="{e(titel)}">
  <p class="marquee-titel">{e(titel)}</p>
  <div class="marquee"><div class="marquee-rij">{namen}<span aria-hidden="true" style="display:contents">{namen}</span></div></div>
</section>'''


def sectie_vergelijk():
    oud = ['Je post elke dag, maar de agenda blijft half leeg',
           'Aanvragen blijven liggen omdat je in behandeling staat',
           'Je verkoopt losse behandelingen, klanten komen één keer',
           'Een bureau stuurt rapporten vol termen die je niet begrijpt',
           'Oud-klanten hoor je nooit meer']
    nieuw = ['Echte content van jou en je salon, gemaakt op één contentdag',
             'Elke aanvraag wordt gebeld en direct ingepland in je agenda',
             'Een aanbod waardoor klanten een heel traject bij je doen',
             'Je ziet in je WhatsApp-groep gewoon wie er in je agenda staat',
             'Je klantenbestand wordt weer actief benaderd']
    li_oud = ''.join(f'<li>{ic("kruis")}<span>{e(x)}</span></li>' for x in oud)
    li_nieuw = ''.join(f'<li>{ic("vink")}<span>{e(x)}</span></li>' for x in nieuw)
    return f'''<section class="sectie zand">
  <div class="wrap">
    <div class="sectie-kop centraal onthul">
      <p class="label">Herken je dit?</p>
      <h2>Je bent goed in je vak. Marketing hoort daar niet bij te hoeven.</h2>
      <p class="lead">Je bent ondernemer geworden om mensen te helpen met hun huid en hun zelfvertrouwen. Niet om advertenties te leren. Dat hoeft ook niet.</p>
    </div>
    <div class="vergelijk">
      <div class="vergelijk-kaart oud onthul"><h3><span class="tag">Zoals nu</span></h3><ul>{li_oud}</ul></div>
      <div class="vergelijk-kaart nieuw onthul" data-vertraging="1"><h3><span class="tag">Met Gewoon Doen</span></h3><ul>{li_nieuw}</ul></div>
    </div>
  </div>
</section>'''


def mockup_telefoon():
    berichten = [
        ('', 'Nieuwe aanvraag', 'Sanne · laserontharen oksels &amp; benen. Wil graag in de avond.', '09:12'),
        ('ik', 'Gewoon Doen', 'Gebeld ✔ Proefbehandeling ingepland: do 14 nov, 19:00.', '09:21'),
        ('', 'Nieuwe aanvraag', 'Fatima · huidverbetering, last van acne-littekens.', '10:04'),
        ('ik', 'Gewoon Doen', 'Gebeld ✔ Huidanalyse ingepland: vr 15 nov, 11:30.', '10:16'),
        ('', 'Jij', 'Top! Ik zie ze in de agenda staan 🙌', '10:20'),
    ]
    b = ''.join(f'<div class="bericht {k}"><b>{t}</b>{x}<time>{tijd}</time></div>' for k, t, x, tijd in berichten)
    return f'''<div class="mockup-podium" data-kantel="7" data-kantel-zone>
  <div class="kantel">
    <div class="telefoon" role="img" aria-label="Voorbeeld van de WhatsApp-groep: aanvragen komen binnen en worden door ons ingepland">
      <div class="telefoon-scherm">
        <div class="wa-kop"><span class="avatar"><img src="/img/logo-mark.png" alt=""></span><div><strong>Jouw salon × Gewoon Doen</strong><small>Raphaël, Kelly, Mariska, jij</small></div></div>
        <div class="wa-chat">{b}</div>
      </div>
    </div>
    <div class="agenda-kaart" aria-hidden="true">
      <strong>Jouw agenda <small>do 14 nov</small></strong>
      <div class="slot vol"><span>17:00</span><span>Intake · Lotte</span></div>
      <div class="slot"><span>18:00</span><span>Vrij</span></div>
      <div class="slot vol nieuw"><span>19:00</span><span>Proefbehandeling · Sanne</span></div>
      <div class="slot vol"><span>20:00</span><span>Traject 3/6 · Noor</span></div>
    </div>
  </div>
</div>'''


def sectie_tijdlijn(uitgebreid=False):
    items = []
    grens_gezet = False
    for i, s in enumerate(S['stappen'], 1):
        if s['wie'] == 'wij' and not grens_gezet:
            items.append(f'<li class="stap-grens" aria-hidden="true">{ic("handdruk")}Vanaf hier ben jij klaar. De rest is Gewoon Doen.</li>')
            grens_gezet = True
        wie = 'Jij' if s['wie'] == 'jij' else 'Wij'
        items.append(f'''<li class="stap {s["wie"]}"><span class="stap-punt">{i}</span>
      <div class="stap-kop"><h3>{e(s["kop"])}</h3><span class="wie">{wie}</span><span class="duur">{e(s["duur"])}</span></div>
      <p>{e(s["tekst"])}</p></li>''')
    kop = 'Zo werkt het' if not uitgebreid else 'Het proces, stap voor stap'
    return f'''<section class="sectie" id="hoe-het-werkt">
  <div class="wrap">
    <div class="sectie-kop onthul">
      <p class="label">{kop}</p>
      <h2>Jij geeft ons een half uur. <span class="verloop-tekst">De rest is Gewoon Doen.</span></h2>
      <p class="lead">Na het strategiegesprek en de contentdag ben jij klaar. Daarna bouwen wij een compleet systeem om je salon heen: van advertentie tot afspraak, en van afspraak tot traject.</p>
    </div>
    <div class="tijdlijn-grid">
      <ol class="tijdlijn"><span class="tijdlijn-voortgang" aria-hidden="true"></span>{''.join(items)}</ol>
      <div class="tijdlijn-plak onthul">{mockup_telefoon()}</div>
    </div>
  </div>
</section>'''


def sectie_kanalen(achtergrond=''):
    pl = ''.join(f'<span class="chip"><i></i>{e(p)}</span>' for p in S['platforms'])
    ag = ''.join(f'<span class="chip"><i></i>{e(p)}</span>' for p in S['agendas'])
    return f'''<section class="sectie {achtergrond}">
  <div class="wrap">
    <div class="sectie-kop centraal onthul">
      <p class="label">Werkt met wat jij al gebruikt</p>
      <h2>Geen nieuw systeem leren. Wij sluiten aan op jouw salon.</h2>
    </div>
    <div class="integraties">
      <div class="integratie-blok onthul"><h3>Waar je nieuwe klanten vandaan komen</h3><p>Wij maken en beheren je advertenties op de plekken waar jouw klanten al kijken.</p><div class="chips">{pl}</div></div>
      <div class="integratie-blok onthul" data-vertraging="1"><h3>Waar de afspraken in komen</h3><p>Wij plannen in de agenda die je al hebt. Jij hoeft niets over te zetten.</p><div class="chips">{ag}</div></div>
    </div>
  </div>
</section>'''


def case_kaart(c, i=0):
    res = f'<p class="resultaat">{e(c["resultaat"])}</p>' if c.get('resultaat') else ''
    return f'''<article class="case onthul" data-vertraging="{i % 4}">
  <img src="/img/eigenaren/{e(c["foto"])}" alt="{e(c["naam"])} van {e(c["salon"])}" loading="lazy">
  <div class="case-inhoud"><span class="case-tag">{e(c["behandeling"])}</span><h3>{e(c["naam"])} · {e(c["salon"])}</h3><p>{e(c["wat"])}</p>{res}</div>
</article>'''


def sectie_cases(kop=True):
    kaarten = ''.join(case_kaart(c, i) for i, c in enumerate(S['cases']))
    k = f'''<div class="sectie-kop onthul" style="display:flex;flex-wrap:wrap;justify-content:space-between;align-items:end;gap:20px;max-width:none">
      <div style="max-width:640px"><p class="label">Echte ondernemers, echte salons</p><h2>Achter elke agenda zit een ondernemer met een verhaal</h2>
      <p class="lead">We werken met eigenaren die trots zijn op hun vak. Dit zijn een paar van hen.</p></div>
      <a class="tekstlink" href="/resultaten">Alle resultaten {ic("pijl")}</a></div>''' if kop else ''
    return f'''<section class="sectie"><div class="wrap">{k}<div class="cases">{kaarten}</div></div></section>'''


def sectie_reviews():
    tp_id = S.get('trustpilot_business_unit_id')
    if S['reviews']:
        muur = ''.join(f'''<figure class="review onthul">{sterren_tp()}<blockquote>“{e(r["tekst"])}”</blockquote>
          <figcaption><span class="initiaal">{e(r["naam"][:1])}</span><span><strong>{e(r["naam"])}</strong><small>{e(r.get("salon", ""))}</small></span></figcaption></figure>''' for r in S['reviews'])
        inhoud = f'<div class="review-muur">{muur}</div>'
    elif tp_id:
        inhoud = (f'<div class="trustpilot-widget trustbox-plek" data-locale="nl-NL" data-template-id="54ad5defc6454f065c28af8b" data-businessunit-id="{e(tp_id)}" data-style-height="240px" data-style-width="100%" data-theme="light" data-stars="4,5">'
                  f'<a href="{e(L["trustpilot"])}" target="_blank" rel="noopener">Trustpilot</a></div>')
    else:
        inhoud = f'''<div class="reviews-leeg onthul"><div><h3>Wat salons over ons zeggen</h3><p>Lees de ervaringen van salon- en kliniekeigenaren op Trustpilot. Eerlijk, ongefilterd en niet door ons geschreven.</p></div>
        <a class="knop knop-licht" href="{e(L["trustpilot"])}" target="_blank" rel="noopener">{sterren_tp()} Bekijk reviews</a></div>'''
    return f'''<section class="sectie zand" id="reviews">
  <div class="wrap">
    <div class="reviews-kop onthul">
      <div><p class="label">Reviews</p><h2 style="margin:0">Liever hun woorden dan de onze</h2></div>
      <a class="tp-blok" href="{e(L["trustpilot"])}" target="_blank" rel="noopener"><span class="tp-ster">{sterren_tp()}</span><span><strong>Beoordeeld op Trustpilot</strong><small>Lees alle reviews →</small></span></a>
    </div>
    {inhoud}
  </div>
</section>'''


def sectie_waarde():
    v = S['video']
    return f'''<section class="sectie blush">
  <div class="wrap">
    <div class="sectie-kop centraal onthul">
      <p class="label">Gratis voor jou</p>
      <h2>Eerst iets geven. Dan pas praten.</h2>
      <p class="lead">Kijk rustig rond voordat je iets met ons afspreekt. Dit kun je vandaag al gebruiken in je salon.</p>
    </div>
    <div class="waarde">
      <a class="waarde-kaart hoofd onthul" href="/gratis-training" data-kantel="5"><span class="glans"></span>
        <div class="kantel"><div class="mock mock-laptop"><div class="scherm"><img src="/img/eigenaren/{e(S["cases"][0]["foto"])}" alt=""><span class="speel-mini">{ic("speel")}</span><span class="hoofdstukken"><i></i><i></i><i></i><i></i></span></div><div class="voet"></div></div></div>
        <h3>Gratis videotraining</h3>
        <p>{e(v["training_titel"])}. Vul je e-mailadres in en kijk direct.</p>
        <span class="tekstlink">Bekijk de training {ic("pijl")}</span>
      </a>
      <a class="waarde-kaart onthul" href="/kennismaken" data-kantel="6" data-vertraging="1"><span class="glans"></span>
        <div class="kantel"><div class="mock mock-kalender"><div class="maand"><span>November</span><span>›</span></div><div class="dagen">{''.join(f'<i class="{"kies" if n == 14 else ("vrij" if n in (11, 12, 18, 19, 20) else "")}">{n}</i>' for n in range(4, 25))}</div></div></div>
        <h3>Kennismakingsgesprek</h3>
        <p>Een kort, eerlijk gesprek over jouw salon. Je weet daarna precies waar je kansen liggen, ook als we niet samenwerken.</p>
        <span class="tekstlink">Kies een moment {ic("pijl")}</span>
      </a>
      <a class="waarde-kaart onthul" href="/insights" data-kantel="6" data-vertraging="2"><span class="glans"></span>
        <div class="kantel"><div class="mock mock-artikel"><div class="rij"><i></i><span><b></b><b></b></span></div><div class="rij"><i></i><span><b></b><b></b></span></div><div class="rij"><i></i><span><b></b><b></b></span></div></div></div>
        <h3>Insights-bibliotheek</h3>
        <p>Praktische artikelen over marketing per behandeling: van laserontharen tot PRX en Profhilo.</p>
        <span class="tekstlink">Naar de artikelen {ic("pijl")}</span>
      </a>
    </div>
  </div>
</section>'''


def oprichter_foto(o):
    if o.get('foto'):
        binnen = f'<img src="/img/{e(o["foto"])}" alt="{e(o["naam"])}" loading="lazy">'
    else:
        initialen = ''.join(w[0] for w in o['naam'].split()[:2])
        binnen = f'<span class="monogram" aria-hidden="true">{e(initialen)}</span>'
    return f'<div class="oprichter-foto onthul">{binnen}<div class="naamkaartje"><strong>{e(o["naam"])}</strong><small>{e(o["rol"])}, Gewoon Doen Marketing</small></div></div>'


def sectie_oprichters(kop_label='Over de oprichter'):
    o = S['oprichters'][0]
    bel = ''.join(f'<div class="belofte"><strong>{ic("vink")}{e(x["kop"])}</strong><p>{e(x["tekst"])}</p></div>' for x in S['beloftes'])
    rest = ''
    if len(S['oprichters']) > 1:
        rest = '<div class="oprichters-meer">' + ''.join(oprichter_foto(x) for x in S['oprichters'][1:]) + '</div>'
    return f'''<section class="sectie zand">
  <div class="wrap">
    <div class="oprichter">
      {oprichter_foto(o)}
      <div class="onthul" data-vertraging="1">
        <p class="label">{e(kop_label)}</p>
        <h2>Wij maken een afspraak. En die komen we na.</h2>
        <p class="lead">{e(o["tekst"])}</p>
        <div class="beloftes">{bel}</div>
        <div class="knoppen" style="margin-top:28px">{knop_kennismaken()}<a class="tekstlink" href="/over-ons">Meer over ons {ic("pijl")}</a></div>
      </div>
    </div>
    {rest}
  </div>
</section>'''


def sectie_faq(items=None, titel='Veelgestelde vragen'):
    items = items or S['faq']
    det = ''.join(f'<details class="onthul"><summary>{e(x["v"])}</summary><div class="antwoord"><p>{e(x["a"])}</p></div></details>' for x in items)
    return f'''<section class="sectie">
  <div class="smal">
    <div class="sectie-kop centraal onthul"><p class="label">Vragen</p><h2>{e(titel)}</h2></div>
    <div class="faq">{det}</div>
  </div>
</section>'''


def faq_schema(items=None):
    items = items or S['faq']
    return {'@context': 'https://schema.org', '@type': 'FAQPage',
            'mainEntity': [{'@type': 'Question', 'name': x['v'], 'acceptedAnswer': {'@type': 'Answer', 'text': x['a']}} for x in items]}


def eind_cta(kop='Klaar om je agenda te vullen?', lead='Plan een kennismaking van een kwartier. Je hoort eerlijk of we je kunnen helpen. Zo niet, dan zeggen we dat ook.'):
    return f'''<section class="sectie" style="padding-top:0">
  <div class="wrap">
    <div class="eind-cta onthul">
      <div class="gezichten-rij">{gezichten()}</div>
      <h2>{e(kop)}</h2>
      <p class="lead">{e(lead)}</p>
      <div class="knoppen">{knop_kennismaken()}<a class="knop knop-licht" href="/gratis-training">Eerst de gratis training</a></div>
    </div>
  </div>
</section>'''


def artikel_kaart(a, uitgelicht=False):
    cls = 'artikel-kaart onthul' + (' uitgelicht' if uitgelicht else '')
    return f'''<a class="{cls}" href="/insights/{e(a["slug"])}" data-cat="{e(a.get("categorie", ""))}">
  <div class="omslag">{omslag(a)}</div>
  <div><div class="meta"><b>{e(a.get("categorie", ""))}</b><span>{leestijd(a)} min lezen</span></div>
  <h3>{e(a["titel"])}</h3><p>{e(a.get("beschrijving", ""))}</p></div>
</a>'''


# ---------- Pagina's ----------
def pagina_home():
    v = S['video']
    body = f'''<section class="hero">
  <div class="raster" aria-hidden="true"><i style="top:128px"></i><i style="top:320px;animation-delay:-3s"></i><i class="v" style="left:22%;animation-delay:-1s"></i><i class="v" style="left:78%;animation-delay:-4.5s"></i></div>
  <div class="wrap">
    <div class="hero-inhoud">
      <a class="pil" href="/resultaten"><span class="gezichten">{gezichten()}</span>Vertrouwd door {e(S["aantal_klanten_tekst"])}</a>
      <h1>Jij doet de behandeling.<br><em class="verloop-tekst">Wij vullen je agenda.</em></h1>
      <p class="lead">Gewoon Doen Marketing zorgt voor nieuwe klanten voor beautysalons en klinieken. Wij maken de advertenties, bellen elke aanvraag en zetten de afspraak in jouw agenda. Jij hoeft alleen te doen waar je goed in bent.</p>
    </div>
    {sectie_vsl()}
    <div class="hero-inhoud">
      <div class="knoppen" style="justify-content:center">{knop_kennismaken()}<a class="knop knop-licht" href="/gratis-training">Gratis videotraining</a></div>
      <div class="hero-vertrouwen">
        <span>{ic("vink")}Binnen een week live</span>
        <span>{ic("vink")}Wij bellen elke aanvraag</span>
        <span>{ic("vink")}Direct in jouw agenda</span>
      </div>
    </div>
  </div>
  <div class="hero-onder"></div>
</section>
{sectie_marquee()}
{sectie_vergelijk()}
{sectie_tijdlijn()}
{sectie_cases()}
{sectie_reviews()}
{sectie_kanalen()}
{sectie_waarde()}
{sectie_oprichters()}
{sectie_faq()}
{eind_cta()}'''
    schema = [{'@context': 'https://schema.org', '@type': 'WebSite', 'name': B['naam'], 'url': DOMEIN + '/', 'inLanguage': 'nl-NL'},
              {'@context': 'https://schema.org', '@type': 'ProfessionalService', 'name': B['naam'], 'url': DOMEIN + '/', 'image': DOMEIN + '/img/og.jpg',
               'description': 'Marketingbureau voor beautysalons en esthetische klinieken: advertenties, opvolging van aanvragen en afspraken in je agenda.',
               'areaServed': ['NL', 'BE'], 'email': B['email']},
              faq_schema()]
    schrijf('/', layout('/', 'Gewoon Doen Marketing | Meer klanten voor je salon of kliniek',
                         'Jij doet de behandeling, wij vullen je agenda. Marketing voor beautysalons en klinieken: advertenties, elke aanvraag gebeld en direct ingepland.',
                         body, actief='/', schema=schema))


def pagina_aanpak():
    diensten = [
        ('doel', 'Strategie', 'In een half uur bepalen we welke behandeling je vaker wilt verkopen, voor wie en met welk aanbod. Je krijgt direct actiestappen mee.'),
        ('camera', 'Contentdag', 'We maken in één dag foto\'s en video\'s in jouw salon, met jou in beeld. Echt, herkenbaar en klaar voor maanden.'),
        ('megafoon', 'Advertenties', 'Wij maken en beheren de campagnes op Instagram, Facebook, Google of TikTok. Jij hoeft er niets van te snappen.'),
        ('telefoon', 'Opvolging', 'Ons team belt en appt elke aanvraag, stelt de juiste vragen en plant de afspraak direct in jouw agenda.'),
        ('groei', 'Aanbod & verkoop', 'We bouwen samen een aanbod waardoor een eerste afspraak een traject wordt, en leren je hoe je dat gesprek voert.'),
        ('herhaal', 'Klantenbestand reactiveren', 'Oud-klanten benaderen we persoonlijk opnieuw. Vaak de snelste weg naar een vollere agenda.'),
    ]
    kaarten = ''.join(f'<div class="kaart onthul" data-vertraging="{i % 3}"><span class="icoon">{ic(icn)}</span><h3>{e(k)}</h3><p>{e(t)}</p></div>' for i, (icn, k, t) in enumerate(diensten))
    body = paginakop('Onze aanpak', 'Eén systeem om je salon heen. Van advertentie tot traject.',
                     'Geen losse diensten die je zelf aan elkaar moet knopen. Wij regelen het hele stuk tussen “iemand ziet je advertentie” en “iemand ligt op je behandelbed”.',
                     kruimel(('Aanpak', None)), knop_kennismaken() + '<a class="knop knop-licht" href="#hoe-het-werkt">Bekijk het proces</a>')
    body += f'''<section class="sectie"><div class="wrap">
  <div class="sectie-kop onthul"><p class="label">Wat we doen</p><h2>Alles wat nodig is. Niets wat alleen mooi klinkt.</h2></div>
  <div class="kaarten">{kaarten}</div>
</div></section>
{sectie_tijdlijn(uitgebreid=True)}
{sectie_kanalen('zand')}
{sectie_faq()}
{eind_cta()}'''
    schrijf('/aanpak', layout('/aanpak', 'Onze aanpak: van advertentie tot traject',
                              'Strategie, contentdag, advertenties, opvolging, aanbod en reactivatie. Zo vult Gewoon Doen Marketing de agenda van salons en klinieken.',
                              body, actief='/aanpak', schema=[kruimel_schema(('Aanpak', '/aanpak')), faq_schema()]))


def pagina_resultaten():
    videos = ''
    if S.get('voorbeeld_videos'):
        vids = ''.join(f'<div class="kaart onthul" style="padding:0;overflow:hidden"><div style="aspect-ratio:9/16"><iframe src="{e(x["embed"])}" title="{e(x.get("titel", "Voorbeeldvideo"))}" loading="lazy" allow="fullscreen" style="width:100%;height:100%;border:0"></iframe></div></div>' for x in S['voorbeeld_videos'])
        videos = f'<section class="sectie"><div class="wrap"><div class="sectie-kop onthul"><p class="label">Contentdagen</p><h2>Voorbeelden van video\'s die we maakten</h2></div><div class="kaarten">{vids}</div></div></section>'
    body = paginakop('Resultaten', 'Salons en klinieken die het gewoon deden', 'Achter elke case zit een ondernemer die meer tijd wilde voor haar vak en minder voor marketing. Dit is wat we samen bouwden.',
                     kruimel(('Resultaten', None)), knop_kennismaken())
    body += f'''{sectie_marquee('Onder andere voor')}
{sectie_cases(kop=False)}
{videos}
{sectie_reviews()}
{eind_cta('Wil jij de volgende zijn?')}'''
    schrijf('/resultaten', layout('/resultaten', 'Resultaten en cases van salons en klinieken',
                                  'Bekijk met welke salons en klinieken Gewoon Doen Marketing werkt, wat we voor ze bouwden en wat ze erover zeggen op Trustpilot.',
                                  body, actief='/resultaten', schema=[kruimel_schema(('Resultaten', '/resultaten'))]))


def pagina_over():
    body = paginakop('Over ons', 'Een boutique bureau met één belofte: gewoon doen.', 'Geen groot bureau met wisselende accountmanagers. Wel een vast team dat je kent via je eigen WhatsApp-groep en dat doet wat het zegt.',
                     kruimel(('Over ons', None)), knop_kennismaken())
    waarden = [('handdruk', 'Afspraak is afspraak', 'Wat we beloven, leggen we vast en voeren we uit. Lukt iets niet, dan hoor je dat van ons, niet van je agenda.'),
               ('hart', 'Menselijk boven technisch', 'Jij hoeft geen marketingtermen te leren. We praten over klanten, afspraken en trajecten.'),
               ('schild', 'Eerlijk en verantwoord', 'Geen beloftes die je niet waar kunt maken. Zeker bij medische behandelingen houden we ons aan de regels.'),
               ('doel', 'Beperkt aantal salons', 'We werken met een beperkt aantal salons tegelijk, zodat elke salon de aandacht krijgt die nodig is.')]
    kaarten = ''.join(f'<div class="kaart onthul" data-vertraging="{i % 4}"><span class="icoon">{ic(icn)}</span><h3>{e(k)}</h3><p>{e(t)}</p></div>' for i, (icn, k, t) in enumerate(waarden))
    body += f'''{sectie_oprichters('De oprichter')}
<section class="sectie"><div class="wrap"><div class="sectie-kop onthul"><p class="label">Waar we voor staan</p><h2>Waarom salons voor ons kiezen</h2></div><div class="kaarten">{kaarten}</div></div></section>
{sectie_cases()}
{eind_cta()}'''
    schrijf('/over-ons', layout('/over-ons', 'Over ons: het team achter Gewoon Doen',
                                'Gewoon Doen Marketing is een boutique marketingbureau voor beautysalons en klinieken. Maak kennis met de oprichter en onze werkwijze.',
                                body, actief='/over-ons', schema=[kruimel_schema(('Over ons', '/over-ons'))]))


def formulier_lead(kop='Kijk de training direct', knoptekst='Ja, stuur me de training'):
    return f'''<form class="formulier" data-lead data-volgende="/training" novalidate>
  <h2>{e(kop)}</h2>
  <div class="veld"><label for="f-voornaam">Voornaam</label><input id="f-voornaam" name="voornaam" autocomplete="given-name" required></div>
  <div class="veld"><label for="f-email">E-mailadres</label><input id="f-email" name="email" type="email" autocomplete="email" inputmode="email" required></div>
  <div class="veld"><label for="f-salon">Naam van je salon of kliniek <span style="font-weight:400;color:var(--grijs)">(optioneel)</span></label><input id="f-salon" name="salon" autocomplete="organization"></div>
  <div class="honing" aria-hidden="true"><label>Website<input name="website" tabindex="-1" autocomplete="off"></label></div>
  <button class="knop knop-rood" type="submit">{e(knoptekst)}{PIJL}</button>
  <p class="fout" role="alert" hidden></p>
  <p class="klein">Geen spam. Je ontvangt de link ook per mail. Lees ons <a href="/privacy">privacybeleid</a>.</p>
</form>'''


def pagina_training_optin():
    v = S['video']
    punten = ['Waarom posten alleen je agenda niet vult, en wat wel werkt',
              'Hoe je van losse behandelingen naar trajecten gaat',
              'Wat er moet gebeuren in de eerste minuten na een aanvraag',
              'Hoe je oud-klanten terughaalt zonder opdringerig te zijn']
    checks = ''.join(f'<li>{ic("vink")}<span>{e(p)}</span></li>' for p in punten)
    body = f'''<section class="paginakop">
  <div class="wrap optin">
    <div>
      {kruimel(("Gratis training", None))}
      <p class="label">Gratis videotraining</p>
      <h1>{e(v["training_titel"])}</h1>
      <p class="lead">Een korte training voor salon- en kliniekeigenaren. Zonder vakjargon, met stappen die je meteen kunt toepassen.</p>
      <ul class="checks">{checks}</ul>
    </div>
    <div class="onthul">{formulier_lead()}</div>
  </div>
</section>
{sectie_cases()}
{eind_cta('Liever meteen even praten?', 'Plan een kennismaking en we kijken samen naar jouw salon.')}'''
    schrijf('/gratis-training', layout('/gratis-training', 'Gratis videotraining voor salon- en kliniekeigenaren',
                                       'Bekijk gratis de videotraining: zo vul je je agenda met behandeltrajecten in plaats van losse afspraken. Direct te kijken.',
                                       body, schema=[kruimel_schema(('Gratis training', '/gratis-training'))]))


def calendly_embed():
    return (f'<div class="calendly-inline-widget" data-url="{e(L["kennismaken"])}?hide_gdpr_banner=1&primary_color=ab2425"></div>'
            '<script src="https://assets.calendly.com/assets/external/widget.js" async></script>'
            f'<p class="klein" style="font-size:.88rem;color:var(--grijs);margin-top:12px">Laadt de agenda niet? <a href="{e(L["kennismaken"])}" target="_blank" rel="noopener">Open de agenda in een nieuw venster</a>.</p>')


def pagina_training():
    v = S['video']
    collage = ''.join(f'<img src="/img/eigenaren/{e(c["foto"])}" alt="">' for c in S['cases'][:4])
    if v.get('training_embed'):
        video = f'<div class="vsl-plek" style="margin-top:0"><div class="vsl"><iframe src="{e(v["training_embed"])}" title="Videotraining" allow="autoplay; fullscreen; picture-in-picture" allowfullscreen></iframe></div></div>'
    else:
        video = f'<div class="vsl-plek" style="margin-top:0" data-vsl=""><div class="vsl"><button class="vsl-poster" type="button" aria-label="Training afspelen"><span class="collage" aria-hidden="true">{collage}</span><span class="speel" aria-hidden="true">{ic("speel")}</span><span class="bijschrift"><strong>{e(v["training_titel"])}</strong><span>Gratis videotraining</span></span></button></div></div>'
    body = f'''<section class="paginakop" data-training-poort>
  <div class="wrap">
    <div class="training-inhoud">
      <p class="label">Je gratis training</p>
      <h1 style="max-width:none">Welkom<span data-voornaam></span>! Fijn dat je er bent.</h1>
      <p class="lead">Kijk de training rustig af. Onder de video kun je direct een gratis strategiegesprek inplannen als je wilt dat we met je meedenken.</p>
      {video}
    </div>
    <div class="poort optin">
      <div><p class="label">Gratis videotraining</p><h1>Nog even je e-mailadres</h1><p class="lead">Vul je gegevens in en je kijkt de training direct.</p></div>
      {formulier_lead('Kijk de training direct', 'Bekijk de training')}
    </div>
  </div>
</section>
<section class="sectie training-inhoud" id="inplannen">
  <div class="wrap split">
    <div class="onthul">
      <p class="label">Volgende stap</p>
      <h2>Wil je dat we met je meekijken?</h2>
      <p class="lead">Plan een gratis gesprek. We kijken naar jouw salon, je behandelingen en je agenda, en je krijgt concrete stappen mee. Ook als we daarna niet samenwerken.</p>
      <ul class="checks" style="color:var(--ink)">{''.join(f'<li>{ic("vink")}<span>{e(x)}</span></li>' for x in ["Kort en praktisch", "Eerlijk advies, geen verkooppraatje", "Je weet daarna precies waar je kansen liggen"])}</ul>
    </div>
    <div class="onthul" data-vertraging="1">{calendly_embed()}</div>
  </div>
</section>'''
    extra = '<style>[data-training-poort] .poort{display:none}html:not(.no-js) body:not(.heeft-toegang) .training-inhoud{display:none}html:not(.no-js) body:not(.heeft-toegang) [data-training-poort] .poort{display:grid}</style>'
    schrijf('/training', layout('/training', 'Je gratis videotraining', 'De gratis videotraining van Gewoon Doen Marketing voor salon- en kliniekeigenaren.', body, head_extra=extra))


def pagina_kennismaken():
    body = f'''<section class="paginakop"><div class="wrap split">
  <div>
    {kruimel(("Kennismaken", None))}
    <p class="label">Kennismaken</p>
    <h1>Plan een kennismaking</h1>
    <p class="lead">Een kort gesprek om te kijken of we bij elkaar passen. Je vertelt over je salon en je plannen; wij vertellen eerlijk wat we wel en niet voor je kunnen doen.</p>
    <ul class="checks">{''.join(f'<li>{ic("vink")}<span>{e(x)}</span></li>' for x in ["Gratis en vrijblijvend", "Je hoort precies wat het kost en wat het oplevert", "Geen verkooppraatje: past het niet, dan zeggen we dat"])}</ul>
    <a class="tp-blok" href="{e(L["trustpilot"])}" target="_blank" rel="noopener" style="display:inline-flex;margin-top:8px"><span class="tp-ster">{sterren_tp()}</span><span><strong>Bekijk onze reviews</strong><small>op Trustpilot →</small></span></a>
  </div>
  <div>{calendly_embed()}</div>
</div></section>
{sectie_faq()}'''
    schrijf('/kennismaken', layout('/kennismaken', 'Plan een kennismaking', 'Plan een gratis kennismaking met Gewoon Doen Marketing en hoor eerlijk hoe we jouw salon of kliniek aan meer klanten helpen.',
                                   body, schema=[kruimel_schema(('Kennismaken', '/kennismaken')), faq_schema()]))


def pagina_specialisatie(s):
    gerelateerd = [a for a in ARTIKELEN if a.get('behandeling') and (a['behandeling'].lower() in s['behandeling'].lower() or s['behandeling'].lower() in a['behandeling'].lower())]
    gerelateerd += [a for a in ARTIKELEN if a.get('categorie') != 'Behandelingen' and a not in gerelateerd][:max(0, 3 - len(gerelateerd))]
    gerelateerd = gerelateerd[:3]
    aanpak = ''.join(f'<li>{e(x)}</li>' for x in s['aanpak'])
    andere = ''.join(f'<a class="chip" href="/marketing-voor/{x["slug"]}" style="text-decoration:none">{e(x["naam"])}</a>' for x in S['specialisaties'] if x['slug'] != s['slug'])
    pad = f'/marketing-voor/{s["slug"]}'
    faq = [
        {'v': f'Werken jullie al voor salons met {klein(s["naam"])}?', 'a': f'Ja. We werken met salons en klinieken die {klein(s["naam"])} aanbieden en kennen de vragen en twijfels van hun klanten. In het kennismakingsgesprek vertellen we wat we voor vergelijkbare salons hebben gedaan.'},
        {'v': 'Moet ik zelf content maken?', 'a': 'Nee. Op een contentdag maken we in jouw salon de foto\'s en video\'s die we nodig hebben. Jij hoeft alleen jezelf te zijn.'},
        {'v': 'Wie belt de aanvragen?', 'a': 'Ons eigen team. Elke aanvraag wordt gebeld en, als het past, direct in jouw agenda gezet. Je ziet alles terug in jullie WhatsApp-groep.'},
    ]
    body = paginakop(f'Marketing voor {klein(s["naam"])}', e(s['kop']), e(s['intro']),
                     kruimel(('Specialisaties', '/aanpak'), (s['naam'], None)), knop_kennismaken() + '<a class="knop knop-licht" href="/gratis-training">Gratis training</a>')
    body += f'''<section class="sectie"><div class="wrap split">
  <div class="onthul"><p class="label">De uitdaging</p><h2>Waarom het lastig is</h2><p class="lead">{e(s["uitdaging"])}</p></div>
  <div class="onthul" data-vertraging="1"><p class="label">Onze aanpak</p><h2>Hoe wij het aanpakken</h2><ol class="genummerd">{aanpak}</ol></div>
</div></section>
{sectie_tijdlijn()}
<section class="sectie zand"><div class="wrap">
  <div class="sectie-kop onthul" style="display:flex;flex-wrap:wrap;justify-content:space-between;align-items:end;gap:20px;max-width:none"><div><p class="label">Lees verder</p><h2 style="margin:0">Insights over dit onderwerp</h2></div><a class="tekstlink" href="/insights">Alle insights {ic("pijl")}</a></div>
  <div class="artikelen">{''.join(artikel_kaart(a) for a in gerelateerd)}</div>
</div></section>
{sectie_faq(faq)}
<section class="sectie" style="padding-top:0"><div class="wrap centraal"><p class="label">Andere specialisaties</p><div class="chips">{andere}</div></div></section>
{eind_cta()}'''
    schrijf(pad, layout(pad, s['kop'],
                        f'{s["intro"][:150].rsplit(" ", 1)[0]}…' if len(s['intro']) > 155 else s['intro'],
                        body, actief='', schema=[kruimel_schema(('Specialisaties', '/aanpak'), (s['naam'], pad)), faq_schema(faq)]))


def pagina_insights():
    knoppen = '<button type="button" data-cat="alle" aria-pressed="true">Alles</button>' + ''.join(
        f'<button type="button" data-cat="{e(c)}" aria-pressed="false">{e(c)}</button>' for c in CATEGORIEEN if any(a.get('categorie') == c for a in ARTIKELEN))
    kaarten = ''.join(artikel_kaart(a, uitgelicht=(i == 0)) for i, a in enumerate(ARTIKELEN))
    spec = ''.join(f'<a class="chip" href="/marketing-voor/{x["slug"]}" style="text-decoration:none">{e(x["naam"])}</a>' for x in S['specialisaties'])
    body = paginakop('Insights', 'Marketing voor salons en klinieken, gewoon uitgelegd', 'Praktische artikelen per behandeling en over ondernemen. Zonder vakjargon, met stappen die je deze week al kunt zetten.',
                     kruimel(('Insights', None)))
    body += f'''<section class="sectie"><div class="wrap">
  <div class="filters" role="group" aria-label="Filter op onderwerp">{knoppen}</div>
  <div class="artikelen">{kaarten}</div>
</div></section>
<section class="sectie zand"><div class="wrap centraal"><p class="label">Per behandeling</p><h2>Marketing voor jouw specialisatie</h2><div class="chips" style="margin-top:24px">{spec}</div></div></section>
{eind_cta()}'''
    lijst = {'@context': 'https://schema.org', '@type': 'Blog', 'name': 'Gewoon Doen Insights', 'url': DOMEIN + '/insights',
             'blogPost': [{'@type': 'BlogPosting', 'headline': a['titel'], 'url': f'{DOMEIN}/insights/{a["slug"]}', 'datePublished': a.get('datum')} for a in ARTIKELEN]}
    schrijf('/insights', layout('/insights', 'Insights: marketing voor salons en klinieken',
                                'Praktische artikelen over marketing voor beautysalons en klinieken: laserontharen, huidverbetering, PRX, botox, Profhilo, content en opvolging.',
                                body, actief='/insights', schema=[kruimel_schema(('Insights', '/insights')), lijst]))


def pagina_artikel(a):
    pad = f'/insights/{a["slug"]}'
    toc, secties = [], []
    for i, s in enumerate(a.get('secties', [])):
        sid = slugify(s['kop'])[:60] or f'sectie-{i}'
        toc.append(f'<li><a href="#{sid}">{e(s["kop"])}</a></li>')
        secties.append(f'<h2 id="{sid}">{e(s["kop"])}</h2>{s["html"]}')
        if i == 2:
            secties.append(f'''<aside class="cta-blok"><h3>Liever dat iemand het voor je doet?</h3><p>Wij regelen de advertenties, bellen elke aanvraag en plannen de afspraken in jouw agenda.</p><div class="knoppen">{knop_kennismaken('knop-rood')}<a class="knop knop-licht" href="/gratis-training">Gratis training</a></div></aside>''')
    kern = ''.join(f'<li>{e(x)}</li>' for x in a.get('kernpunten', []))
    kern_html = f'<div class="kernpunten"><strong>In het kort</strong><ul>{kern}</ul></div>' if kern else ''
    faq = a.get('faq', [])
    faq_html = ''
    if faq:
        faq_html = '<h2 id="veelgestelde-vragen">Veelgestelde vragen</h2><div class="faq">' + ''.join(
            f'<details><summary>{e(x["v"])}</summary><div class="antwoord"><p>{e(x["a"])}</p></div></details>' for x in faq) + '</div>'
        toc.append('<li><a href="#veelgestelde-vragen">Veelgestelde vragen</a></li>')
    verwant = [x for x in ARTIKELEN if x is not a and x.get('categorie') == a.get('categorie')][:3]
    if len(verwant) < 3:
        verwant += [x for x in ARTIKELEN if x is not a and x not in verwant][:3 - len(verwant)]
    spec = next((s for s in S['specialisaties'] if a.get('behandeling') and (a['behandeling'].lower() in s['behandeling'].lower() or s['behandeling'].lower() in a['behandeling'].lower())), None)
    spec_link = f'<p style="margin-top:24px"><a class="tekstlink" href="/marketing-voor/{spec["slug"]}">Zo helpen wij salons met {e(klein(spec["naam"]))} {ic("pijl")}</a></p>' if spec else ''
    body = f'''<article>
<header class="artikel-kop"><div class="wrap">
  {kruimel(("Insights", "/insights"), (a.get("categorie", ""), None)).replace('class="kruimel"', 'class="kruimel" style="color:var(--grijs)"')}
  <p class="label">{e(a.get("categorie", ""))}</p>
  <h1>{e(a["titel"])}</h1>
  <p class="lead">{e(a.get("intro", ""))}</p>
  <div class="artikel-meta"><span class="auteur"><img src="/img/logo-mark.png" alt="">Team Gewoon Doen</span><span>{datum_nl(a.get("datum"))}</span><span>{leestijd(a)} min lezen</span></div>
  <div class="artikel-omslag">{omslag(a, breed=True)}</div>
</div></header>
<div class="wrap artikel-body">
  <aside class="inhoudsopgave"><button type="button" class="knop knop-licht knop-klein" aria-expanded="false" style="display:none">Inhoud</button><strong>In dit artikel</strong><ol>{"".join(toc)}</ol>{knop("Plan een kennismaking", "/kennismaken", "knop-rood knop-klein", pijl=False)}</aside>
  <div class="prose">{kern_html}{"".join(secties)}{faq_html}{spec_link}</div>
</div>
</article>
<section class="sectie zand"><div class="wrap">
  <div class="sectie-kop onthul"><p class="label">Lees ook</p><h2 style="margin:0">Meer insights</h2></div>
  <div class="artikelen">{"".join(artikel_kaart(x) for x in verwant)}</div>
</div></section>
{eind_cta()}'''
    schema = [kruimel_schema(('Insights', '/insights'), (a['titel'], pad)),
              {'@context': 'https://schema.org', '@type': 'BlogPosting', 'headline': a['titel'], 'description': a.get('beschrijving', ''),
               'datePublished': a.get('datum'), 'dateModified': a.get('datum'), 'inLanguage': 'nl-NL',
               'author': {'@type': 'Organization', 'name': B['naam'], 'url': DOMEIN},
               'publisher': {'@type': 'Organization', 'name': B['naam'], 'logo': {'@type': 'ImageObject', 'url': DOMEIN + '/img/apple-touch-icon.png'}},
               'mainEntityOfPage': DOMEIN + pad, 'image': DOMEIN + '/img/og.jpg'}]
    if faq:
        schema.append(faq_schema(faq))
    schrijf(pad, layout(pad, a['titel'], a.get('beschrijving', ''), body, actief='/insights', schema=schema, og_type='article'))


def pagina_privacy():
    body = paginakop('Privacy', 'Privacy &amp; cookies', 'Hoe we omgaan met je gegevens. Kort en duidelijk.', kruimel(('Privacy', None)))
    body += f'''<section class="sectie"><div class="smal prose">
<h2>Welke gegevens we verzamelen</h2>
<p>Als je je aanmeldt voor de gratis training of een gesprek inplant, ontvangen we je naam, e-mailadres en eventueel de naam van je salon en je telefoonnummer. We gebruiken die gegevens alleen om je de training te sturen, contact met je op te nemen over je aanvraag en je af en toe relevante informatie te mailen. Je kunt je altijd afmelden.</p>
<h2>Waar je gegevens staan</h2>
<p>We bewaren je gegevens bij zorgvuldig gekozen dienstverleners, zoals onze e-maildienst en onze agenda (Calendly). We verkopen je gegevens nooit aan anderen.</p>
<h2>Cookies</h2>
<p>Deze website gebruikt alleen functionele opslag in je browser, bijvoorbeeld om te onthouden dat je de training al hebt aangevraagd. Ingesloten diensten zoals de video-speler, Trustpilot en Calendly kunnen hun eigen cookies plaatsen; lees daarvoor hun privacyverklaring.</p>
<h2>Je rechten</h2>
<p>Je mag altijd vragen welke gegevens we van je hebben, ze laten aanpassen of laten verwijderen. Mail ons op <a href="mailto:{e(B["email"])}">{e(B["email"])}</a>.</p>
<p><em>Laatst bijgewerkt: {datum_nl(VANDAAG)}</em></p>
</div></section>'''
    schrijf('/privacy', layout('/privacy', 'Privacy en cookies', 'Privacyverklaring en cookiebeleid van Gewoon Doen Marketing: welke gegevens we verzamelen, waarvoor we ze gebruiken en wat je rechten zijn.', body))


def pagina_404():
    body = f'''<section class="paginakop" style="min-height:60vh;display:grid;align-items:center"><div class="wrap centraal">
  <p class="label" style="justify-content:center">404</p><h1 style="margin-inline:auto">Deze pagina bestaat niet (meer)</h1>
  <p class="lead" style="margin-inline:auto">Geen probleem. Hier vind je wel verder:</p>
  <div class="knoppen" style="justify-content:center;margin-top:24px">{knop("Naar de homepagina", "/", "knop-rood")}<a class="knop knop-licht" href="/insights">Insights</a></div>
</div></section>'''
    with open(os.path.join(PUB, '404.html'), 'w', encoding='utf-8') as f:
        f.write(layout('/404', 'Pagina niet gevonden', 'Deze pagina bestaat niet.', body))


def sitemap_en_robots():
    urls = ''.join(f'<url><loc>{DOMEIN}{"" if p == "/" else p}</loc><lastmod>{VANDAAG}</lastmod></url>' for p in PAGINAS if p not in ('/training',))
    with open(os.path.join(PUB, 'sitemap.xml'), 'w', encoding='utf-8') as f:
        f.write(f'<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">{urls}</urlset>\n')
    with open(os.path.join(PUB, 'robots.txt'), 'w', encoding='utf-8') as f:
        f.write('User-agent: *\nDisallow: /\n' if PREVIEW else f'User-agent: *\nDisallow: /training\nAllow: /\n\nSitemap: {DOMEIN}/sitemap.xml\n')


if __name__ == '__main__':
    VERSIE = hashlib.md5((open(os.path.join(PUB, 'assets/site.css'), 'rb').read() + open(os.path.join(PUB, 'assets/site.js'), 'rb').read())).hexdigest()[:8]
    PAGINAS = []
    pagina_home()
    pagina_aanpak()
    pagina_resultaten()
    pagina_over()
    pagina_training_optin()
    pagina_training()
    pagina_kennismaken()
    pagina_insights()
    for a in ARTIKELEN:
        pagina_artikel(a)
    for s in S['specialisaties']:
        pagina_specialisatie(s)
    pagina_privacy()
    pagina_404()
    sitemap_en_robots()
    print(f'{len(PAGINAS)} pagina\'s gebouwd ({len(ARTIKELEN)} artikelen, {len(S["specialisaties"])} specialisaties). Preview-modus: {PREVIEW}')
