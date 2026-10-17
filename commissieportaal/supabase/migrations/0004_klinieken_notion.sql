-- Alle klanten uit Notion (Clients) met een e-mailadres, zodat tabnamen erop kunnen matchen.
insert into clinics (naam, email, notion_page_id) values
  ('Allure', 'info@beautysalonallure.nl', '3dae9eadff6b81f1a7f7fa71118cbf49'),
  ('Beauty Studio Marijke', 'beautystudiomarijke@gmail.com', '3dae9eadff6b815cb86fd233ced9b329'),
  ('Bellissima Apeldoorn', 'kyra@belissima.nl', '3dae9eadff6b81709713ed485b3765d1'),
  ('Contoura Groningen', 'groningen@contoura.nl', '3dae9eadff6b81c899b9c672a66bfdba'),
  ('Gezond Lekker Slank', 'serafina@gezondlekkerslank.nl', '3dae9eadff6b8196bfaae4e15093e012'),
  ('Kliniek Groene Hart', 'info@kliniekgroenehart.nl', '3dae9eadff6b8180a6d9c72412239947'),
  ('La Beauté de Sara', 'info@labeautedesara.nl', '3dae9eadff6b8148bb3fd1c6a6abacc7'),
  ('Lions Beauty', 'info@lionsbeauty.nl', '3dbe9eadff6b81de8d57fe5b641838ac'),
  ('M-Age Aesthetics', 'info@m-age.nl', '3dae9eadff6b81e18fe2c6ce42aef190'),
  ('Nay Skincare', 'info@nayskincare.nl', '3dae9eadff6b816f9581c65e770797fa'),
  ('NEI Therapie', 'info@neitherapiedeurne.nl', '3dae9eadff6b814a920de82b51d30935'),
  ('OG Beauty Salon Den Haag', 'infoogpmu@gmail.com', '3dae9eadff6b811d9f2ff0dc1dc1e358'),
  ('Perfect Skin Clinic', 'info@perfectskinclinic.nl', '3dae9eadff6b81c3a587f1384adf3f9b'),
  ('Private Medi Clinic', 'info@privatemediclinic.nl', '3dae9eadff6b81fa9289d4780ae8b694'),
  ('Sa Baran', 'info@sabaran.nl', '3dbe9eadff6b817792aaf34b0a77c1eb'),
  ('Sia Beauty', 'bo.hermans1@gmail.com', '3dae9eadff6b815a97f3e9b928193687'),
  ('Skin 360', 'info@skin360.nl', '3e3e9eadff6b81aaacf3e194a1fe8919'),
  ('UvaCare', 'info@uvacare.nl', '3dae9eadff6b8153b39ae10abca5abc9'),
  ('Valentijn Beauty Salon', 'info@beautyvalentijn.nl', '3dae9eadff6b8144b985cd8351a63a4d'),
  ('Van den Berk Huidtherapie', 'info@vandenberkhuidtherapie.nl', '3f6e9eadff6b802ebd55d8606d8ddb57')
on conflict (naam) do nothing;
