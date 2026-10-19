# Commissieportaal — Gewoon Doen Marketing

Webapp waarmee salonsetters hun Google Sheet indienen. De app leest de sheet uit, berekent de commissie
en zet alles klaar voor controle in de admin.

- `/indienen` — indienpagina voor setters (mobiel-first)
- `/bedankt` — bedankscherm, zonder bedragen
- `/admin` — overzicht en controlepagina (inloggen via magic link, alleen ADMIN_EMAIL):
  berekening, correcties, opkomstbonus, goedkeuren, afvinklijsten
- `/kliniek/[token]` — afvinklijst voor de salon (Ja/Nee per lead, opslaan en indienen)
- Cron: maandmail aan actieve setters op de 14e om 09:00 (Amsterdam), dagelijkse keep-alive

**Afspraak voor setters:** tabnaam = volledige salonnaam (zoals in Notion), bij twee behandelingen
"Salonnaam - behandeling". Salons zonder herkende naam krijgen geen afvinklijst.

**Testmodus** (standaard aan, te wisselen op de controlepagina): mails aan klinieken gaan naar de admin.

Stack: Next.js (App Router) op Vercel, Supabase (Postgres), Resend, Google Sheets API, Notion API.

## Lokaal

```bash
npm install
cp .env.example .env.local   # vul de waarden in
npm run dev                  # http://localhost:3000
npm test                     # parser, berekening, indienregels, migratie
```

## Live zetten

### 1. Vercel
1. Ga naar vercel.com → **Add New… → Project** en importeer deze GitHub-repo.
2. Framework wordt automatisch herkend (Next.js). Klik **Deploy**.
3. **Settings → Environment Variables**: zet de variabelen uit `.env.example`
   (minimaal `GOOGLE_API_KEY`, `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `SUPABASE_ANON_KEY`,
   `ADMIN_EMAIL`, `APP_URL`). Daarna **Deployments → Redeploy**.

### 2. Domein (bijv. `commissie.gewoondoenmarketing.nl`)
1. Vercel → project → **Settings → Domains → Add** en vul het subdomein in.
2. Vercel toont een CNAME-waarde. Zet die bij Strato: gewoondoenmarketing.nl → DNS →
   TXT- en CNAME-records → configureren → Maak nog een record aan → type CNAME,
   voorvoegsel `commissie`, waarde uit Vercel → Instellingen doorvoeren.
3. Zet `APP_URL` op `https://commissie.gewoondoenmarketing.nl`.

### 3. Resend (e-mail vanaf gewoondoenmarketing.nl)
Resend koppel je via DNS aan het domein, los van Vercel.
1. resend.com → **Domains → Add Domain** → `gewoondoenmarketing.nl` (regio EU).
2. Resend toont een aantal DNS-records (MX + TXT voor SPF op een `send`-subdomein, TXT voor DKIM).
   Zet ze bij dezelfde DNS-beheerder en klik **Verify**.
3. Maak een API-key aan → `RESEND_API_KEY` in Vercel.
4. `MAIL_FROM`, bijv. `Gewoon Doen Marketing <commissie@gewoondoenmarketing.nl>`.

Staat de DNS van het domein al bij Vercel (nameservers van Vercel)? Dan zet je de Resend-records
in Vercel onder **Domains → gewoondoenmarketing.nl → DNS Records**.

### 4. Supabase
1. Maak een project aan (regio EU, bijv. Frankfurt).
2. **SQL Editor**: voer `supabase/migrations/0001_init.sql` uit.
3. **Project Settings → API**: kopieer URL, `anon` key en `service_role` key naar Vercel.

### 5. Google Sheets API-key
Google Cloud Console → nieuw project → **APIs & Services → Library → Google Sheets API → Enable** →
**Credentials → Create credentials → API key**. Beperk de key tot de Google Sheets API.

## CRM (koude acquisitie + sales)

Eén database, twee pijplijnen op hetzelfde contact (geen dubbele contacten bij een boeking). Rollen: admin, setter, salesmedewerker (server-side afgedwongen).

**Werkt zonder extra accounts**
- Import: Google Sheet of CSV (Outscraper/Apify/eigen). Telefoon → +31, ontdubbelen op telefoon/e-mail/domein, twijfelgevallen naar `/crm/beoordelen`.
- Belwachtrij `/crm/bellen`: atomaire reservering (`crm_reserveer_volgende`), één lead per setter, uitkomst met één klik, WAVO-pop-up, automatisch doorbellen met aftelling en pauze. Zonder Twilio belt de setter met de eigen telefoon (geen providerstatus).
- Toewijzing na geregistreerde belpoging; huidige eigenaar, oorspronkelijke setter en toegeschreven setter (commissie) apart.
- Inplannen: Calendly-link per gesprekstype met ondoorzichtige `utm_content`-referentie (→ lead, setter, type). Afspraak telt pas na bevestiging door Calendly.
- Agenda `/crm/agenda`, inbox `/crm/inbox`, dashboards, cijfers, commissiegrootboek `/crm/commissie` (basis, show, bonus, close, correctie, uitbetaling; idempotente sleutels).

**Wacht op aansluiting** (zie `/crm/instellingen`)
- Calendly: `CALENDLY_TOKEN` (met webhook-rechten) in Vercel → knop “Calendly-webhook aanzetten”. Endpoint `/api/webhooks/calendly` (handtekening gecontroleerd). Uurlijkse herstel-sync in `/api/cron/calendly`.
- Twilio Voice/sms/WhatsApp: `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, `TWILIO_API_KEY_SID`, `TWILIO_API_KEY_SECRET`, `TWILIO_TWIML_APP_SID`, `TWILIO_CALLER_ID`, `TWILIO_SMS_FROM`, `TWILIO_WHATSAPP_FROM` (optioneel `TWILIO_REGION`). TwiML App → `/api/twilio/voice`; inkomend → `/api/twilio/inkomend`.
- Transcriptie: `DEEPGRAM_API_KEY`. Analyse (bezwaren met citaat en tijdstip): `ANTHROPIC_API_KEY`. Wachtrij via `/api/cron/analyse` (elke 5 min). Opnames worden na de bewaartermijn verwijderd (dagelijkse cron).
- Google Agenda: later.

**WhatsApp-regels**: toestemming per kanaal met bron/datum (`crm_consents`); buiten 24 uur na een inkomend bericht alleen goedgekeurde template; een nummer, gesprek of boeking is geen toestemming; mislukte verzending wordt nooit als verzonden getoond.

Migraties: 0007–0011.
