# Website Gewoon Doen Marketing

Nieuwe website voor gewoondoenmarketing.nl: statische HTML, gegenereerd door `build.py` uit `bron/`.
Geen framework en geen npm-buildstap: snel, goedkoop te hosten en makkelijk aan te passen.

## Snel aanpassen

| Wat | Waar |
|---|---|
| Links (Calendly, Trustpilot), video's, klantnamen, cases, reviews, FAQ, stappen, oprichters | `bron/site.json` |
| Insights-artikelen (één bestand per artikel) | `bron/insights/<slug>.json` |
| Specialisatiepagina's (laserontharen, PRX, botox, …) | `bron/site.json` → `specialisaties` |
| Vormgeving / interacties | `public/assets/site.css`, `public/assets/site.js` |
| Templates van alle pagina's | `build.py` |

Daarna altijd: `python3 build.py` en de gegenereerde bestanden in `public/` mee committen.

### Nieuw artikel toevoegen
Maak `bron/insights/<slug>.json` met `slug`, `titel`, `beschrijving` (130–155 tekens), `categorie`
(`Behandelingen`, `Leads & opvolging`, `Ondernemen` of `Content & social`), optioneel `behandeling`,
`datum` (JJJJ-MM-DD), `intro`, `kernpunten` (3), `secties` (`kop` + `html` met alleen p/ul/ol/li/strong/em/h3)
en `faq`. De omslagafbeelding, inhoudsopgave, gerelateerde artikelen, schema.org-data en sitemap komen vanzelf.

## Pagina's

- `/` home: VSL met meeschuivende mini-speler, logo-slider, oud vs. nieuw, tijdlijn met WhatsApp/agenda-mockup,
  cases met eigenaren, reviews (Trustpilot), integraties, gratis waarde (kantelende mockups), oprichter, FAQ
- `/aanpak`, `/resultaten`, `/over-ons`, `/kennismaken` (Calendly), `/privacy`
- `/gratis-training` (lead magnet) → `/api/lead` → `/training` (video + Calendly)
- `/insights` + 18 artikelen, `/marketing-voor/<behandeling>` (8 specialisaties)

## Vercel

Eigen Vercel-project met **Root Directory `website`** (team Gewoon Doen). `vercel.json` serveert `public/`
met nette URL's; `api/lead.js` draait als serverless function.

Environment Variables:

| Naam | Waarvoor |
|---|---|
| `RESEND_API_KEY` | Mail versturen via Resend |
| `MAIL_FROM` | Afzender, bijv. `Gewoon Doen Marketing <info@gewoondoenmarketing.nl>` (domein moet geverifieerd zijn in Resend) |
| `LEAD_TO` | Wie de aanmeldingen ontvangt (komma-gescheiden) |
| `SITE_URL` | Optioneel, standaard `https://gewoondoenmarketing.nl` (link in de bevestigingsmail) |
| `LEAD_WEBHOOK_URL` / `LEAD_WEBHOOK_SECRET` | Optioneel: aanmelding ook doorsturen naar het CRM of Zapier/Make |

## Live zetten

`preview` staat in `bron/site.json` op `true`: elke pagina heeft dan `noindex` en `robots.txt` blokkeert alles.
Zet hem op `false` vlak voordat het domein wordt omgezet; dan komen `index,follow`, een echte `robots.txt` en de sitemap.

## Nog in te vullen (zie ook `_todo` in `bron/site.json`)

- Echte Calendly-link, Trustpilot-URL en eventueel TrustBox business unit ID
- Embed-URL van de VSL en van de videotraining
- Trustpilot-reviews, resultaten (cijfers) per case, voorbeeldvideo's van contentdagen
- Foto('s) van de oprichter(s); tweede oprichter toevoegen als dat van toepassing is
- Toestemming van de salons voor gebruik van naam en foto
- KvK-nummer
