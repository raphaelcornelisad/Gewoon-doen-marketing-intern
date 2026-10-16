-- Opkomst: afvinklijsten voor klinieken, testmodus en koppeling tab -> kliniek.

alter table settings add column clinic_mail_test_mode boolean not null default true;

alter table checklists add column submitted_at timestamptz;
alter table checklists add column sent_to text;
alter table checklists add column submission_id uuid references submissions (id);

-- Klinieken uit Notion (Clients, "E-mail klant").
insert into clinics (naam, email, notion_page_id) values
  ('Babeau Huidinstituut', 'info@babeauhuidinstituut.nl', '3dae9eadff6b81c3ac76dcc0440590a9'),
  ('Beauty Clinic Dali', 'info@beautyclinicdali.nl', '3dae9eadff6b8176a774c361f77d980d'),
  ('Happy Skin', 'info@happy-skin.nl', '3dae9eadff6b81df95e5e71294794968'),
  ('Harmonize', 'info@harmonize.be', '3e3e9eadff6b8130ab6be2e38155fedf'),
  ('Lara''s Utrecht', 'info@larashuidkliniek.nl', '3dae9eadff6b818e9c61d255828e38fb'),
  ('Laserdept Breda', 'info@laserdept.nl', '3dae9eadff6b813f8e86ce56802225d8'),
  ('Mijn Huidspecialist', 'info@mijnhuidspecialist.nl', '3dae9eadff6b81a4bdfaee6a9daee11e'),
  ('Nicole Care & Beauty', 'nicolecareandbeauty@gmail.com', '3dae9eadff6b815d924bd4b9fafdf09c'),
  ('Perfect Skin & Beauty', 'info@perfectskinenbeauty.nl', '3dae9eadff6b81f6b0a2e891bf72abfd'),
  ('Silk & Glow', 'info@silkandglow.nl', '3dae9eadff6b818cb3edc6750bfb4e69'),
  ('Soléa Instituut', 'info@soleainstitute.nl', '3dae9eadff6b81e19b89e1dc4f21ba03'),
  ('Zayn Skincare', 'zaynskincare@gmail.com', '3dae9eadff6b81a087cce85b976ccb0f'),
  ('Chia Skin Clinic', null, null)
on conflict (naam) do nothing;

insert into tab_clinic_map (tab_naam, clinic_id)
select t.tab, c.id from (values
  ('Babeau laseren', 'Babeau Huidinstituut'),
  ('Babeau huid', 'Babeau Huidinstituut'),
  ('Dali', 'Beauty Clinic Dali'),
  ('Happy skin', 'Happy Skin'),
  ('Harmonize', 'Harmonize'),
  ('clinic lara', 'Lara''s Utrecht'),
  ('Laser dept breda', 'Laserdept Breda'),
  ('Mijn huidspecialist', 'Mijn Huidspecialist'),
  ('Nicole care & beauty', 'Nicole Care & Beauty'),
  ('Perfect skin & Beauty', 'Perfect Skin & Beauty'),
  ('Silk and Glow laser', 'Silk & Glow'),
  ('Silk and Glow HIFU', 'Silk & Glow'),
  ('Solea laseren', 'Soléa Instituut'),
  ('Solea HIFU', 'Soléa Instituut'),
  ('zayn skincare', 'Zayn Skincare'),
  ('Chia Skin Clinic', 'Chia Skin Clinic')
) as t(tab, clinic) join clinics c on c.naam = t.clinic
on conflict (tab_naam) do nothing;
