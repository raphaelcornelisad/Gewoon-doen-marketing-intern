# Commissieportaal — Gewoon Doen Marketing

Webapp waarmee salonsetters hun Google Sheet indienen. De app leest de sheet uit, berekent de commissie
en zet alles klaar voor controle in de admin.

- `/indienen` — indienpagina voor setters (mobiel-first)
- `/bedankt` — bedankscherm, zonder bedragen

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
