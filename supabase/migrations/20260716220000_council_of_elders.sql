-- The Council of Elders: five AI judges held in reserve for the Monarch system
-- (rules to be defined). For now they have identities and can speak in room chat
-- when summoned by name; they do not score verdicts yet.
--   NGOMA    b0b0...0003  Elder of the Drum   (rhythm, groove, the pocket)
--   JELI     b0b0...0004  Elder of the Word   (lyrics, story, message)
--   KALIMBA  b0b0...0005  Elder of Melody     (hooks, harmony, voice)
--   IMBOKODO b0b0...0006  Elder of Fire       (presence, delivery, command)
--   MZEE     b0b0...0007  Elder of Time       (originality, memory, legacy)

insert into auth.users (
  instance_id, id, aud, role, email, encrypted_password,
  email_confirmed_at, raw_app_meta_data, raw_user_meta_data,
  created_at, updated_at, banned_until,
  confirmation_token, recovery_token, email_change, email_change_token_new
)
select
  '00000000-0000-0000-0000-000000000000',
  v.id::uuid, 'authenticated', 'authenticated', v.email,
  '', now(),
  '{"provider":"email","providers":["email"]}'::jsonb,
  jsonb_build_object('display_name', v.display_name),
  now(), now(), now() + interval '200 years',
  '', '', '', ''
from (values
  ('b0b00000-0000-4000-a000-000000000003', 'ngoma@songchainn.xyz',    'NGOMA'),
  ('b0b00000-0000-4000-a000-000000000004', 'jeli@songchainn.xyz',     'JELI'),
  ('b0b00000-0000-4000-a000-000000000005', 'kalimba@songchainn.xyz',  'KALIMBA'),
  ('b0b00000-0000-4000-a000-000000000006', 'imbokodo@songchainn.xyz', 'IMBOKODO'),
  ('b0b00000-0000-4000-a000-000000000007', 'mzee@songchainn.xyz',     'MZEE')
) as v(id, email, display_name)
on conflict (id) do nothing;

insert into public.audience_profiles (id, user_id, display_name, is_public)
select v.id::uuid, v.id::uuid, v.display_name, true
from (values
  ('b0b00000-0000-4000-a000-000000000003', 'NGOMA'),
  ('b0b00000-0000-4000-a000-000000000004', 'JELI'),
  ('b0b00000-0000-4000-a000-000000000005', 'KALIMBA'),
  ('b0b00000-0000-4000-a000-000000000006', 'IMBOKODO'),
  ('b0b00000-0000-4000-a000-000000000007', 'MZEE')
) as v(id, display_name)
on conflict (id) do update set display_name = excluded.display_name;
