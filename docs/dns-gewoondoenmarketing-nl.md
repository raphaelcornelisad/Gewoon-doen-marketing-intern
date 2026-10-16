# DNS-overzicht gewoondoenmarketing.nl

Overgenomen uit Strato (registrar) op 16 okt 2026, als voorbereiding op het omzetten van de
nameservers naar Vercel (`ns1.vercel-dns.com`, `ns2.vercel-dns.com`).
Deze records moeten in Vercel DNS staan **voordat** de nameservers bij Strato worden omgezet.

Zet de nameservers pas om als alle records hieronder in Vercel staan en gecontroleerd zijn.

## Bestaande records (overnemen)

| Type  | Naam                | Waarde                                   | Prioriteit | Waarvoor                 |
|-------|---------------------|------------------------------------------|-----------:|--------------------------|
| A     | `@`                 | `185.104.29.170`                         |            | Hoofdwebsite (externe host) |
| AAAA  | `@`                 | `2a06:2ec0:1:0:0:0:0:168`                |            | Hoofdwebsite (IPv6)      |
| MX    | `@`                 | `aspmx.l.google.com`                     | 1          | Google Workspace-mail    |
| MX    | `@`                 | `alt1.aspmx.l.google.com`                | 5          | Google Workspace-mail    |
| MX    | `@`                 | `alt2.aspmx.l.google.com`                | 5          | Google Workspace-mail    |
| MX    | `@`                 | `alt3.aspmx.l.google.com`                | 10         | Google Workspace-mail    |
| TXT   | `@`                 | `v=spf1 include:_spf.google.com ~all`    |            | SPF (Google)             |
| TXT   | `google._domainkey` | zie hieronder                            |            | DKIM (Google)            |
| CNAME | `groeiscan`         | `cname.perspective-dns.com`              |            | Perspective-funnel       |

Strato: hoog/laag bij MX; in Vercel de standaardprioriteiten van Google (1/5/5/10).
Strato zet geen eigen SPF- of DMARC-regel.

DKIM-waarde `google._domainkey`:

```
v=DKIM1; k=rsa; p=MIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8AMIIBCgKCAQEAwADnKvFv+vULiKnjoKyH29qQWJ58H5nkUGT0/I50cgvRO86eLlMOdsRHcF1pJ4LxyyfgzWliJNCTAhdF/YEuWaJT3k7LR3Q/K1NzIhCLa/Hilbpazg+qBmEPIDXdwwowkTjZ6/esdBKPIgsmzQhDDMeiLLpO9P1K3XJdlMYbzgW86lVHFgBJ6ygvhLzcmnlcQAWRC99iVL/x7crttPDN7CvLNATbSAUbwwQC1o3O/d8NPNhH7CXB2ta6CIvYX6RL/IOsVqm3WEhjU2U7LQ9DH4lJGmhVXz0t4gPwji7HFz1uM3+Dge/GAzmKabLt1tM9KaTIup7pB4TccN8WjOdJ8QIDAQAB
```

## Nog te controleren

- [ ] Rest van de TXT/CNAME-lijst in Strato (onder `groeiscan`)
- [ ] Subdomeinen in Strato Domeinbeheer (bijv. `www`) met eigen instellingen

## Nieuw toe te voegen (na overstap)

| Type  | Naam        | Waarde                 | Waarvoor           |
|-------|-------------|------------------------|--------------------|
| CNAME | `commissie` | via Vercel (automatisch bij domein koppelen) | Commissieportaal |
| …     | `send`, `resend._domainkey` | waarden uit Resend | E-mail vanuit de app |
