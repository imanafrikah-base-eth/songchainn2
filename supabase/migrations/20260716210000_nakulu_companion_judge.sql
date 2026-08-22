-- NAKULU, $HIKULU's companion judge: her verdict storage on battles + bot identity.
-- The pair judge every battle together; her points count toward the final score
-- alongside his, and both verdicts are generated in the same hikulu-judge call
-- (the existing hikulu_verdict_at claim lock covers the pair).

alter table public.battles
  add column if not exists nakulu_points_a integer not null default 0,
  add column if not exists nakulu_points_b integer not null default 0,
  add column if not exists nakulu_verdict text;

-- Bot user for NAKULU so her room_messages rows satisfy the auth.users FK.
-- Same belt-and-braces as $HIKULU: empty password hash + banned 200 years.
insert into auth.users (
  instance_id, id, aud, role, email, encrypted_password,
  email_confirmed_at, raw_app_meta_data, raw_user_meta_data,
  created_at, updated_at, banned_until,
  confirmation_token, recovery_token, email_change, email_change_token_new
) values (
  '00000000-0000-0000-0000-000000000000',
  'b0b00000-0000-4000-a000-000000000002',
  'authenticated', 'authenticated',
  'nakulu@songchainn.xyz',
  '', now(),
  '{"provider":"email","providers":["email"]}'::jsonb,
  '{"display_name":"NAKULU"}'::jsonb,
  now(), now(), now() + interval '200 years',
  '', '', '', ''
) on conflict (id) do nothing;

-- Profile row so room UIs resolve her display name.
insert into public.audience_profiles (id, user_id, display_name, is_public)
values ('b0b00000-0000-4000-a000-000000000002', 'b0b00000-0000-4000-a000-000000000002', 'NAKULU', true)
on conflict (id) do update set display_name = 'NAKULU';
