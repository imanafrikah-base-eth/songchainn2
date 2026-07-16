-- $HIKULU AI judge: verdict storage on battles + bot identity

alter table public.battles
  add column if not exists hikulu_points_a integer not null default 0,
  add column if not exists hikulu_points_b integer not null default 0,
  add column if not exists hikulu_verdict text,
  add column if not exists hikulu_verdict_at timestamptz;

comment on column public.battles.hikulu_verdict_at is
  'Set before generation as a claim lock; hikulu_verdict text lands when the LLM responds.';

-- Bot user for $HIKULU so his room_messages rows satisfy the auth.users FK.
-- Password login is impossible (empty hash) and the account is banned as belt-and-braces.
insert into auth.users (
  instance_id, id, aud, role, email, encrypted_password,
  email_confirmed_at, raw_app_meta_data, raw_user_meta_data,
  created_at, updated_at, banned_until,
  confirmation_token, recovery_token, email_change, email_change_token_new
) values (
  '00000000-0000-0000-0000-000000000000',
  'b0b00000-0000-4000-a000-000000000001',
  'authenticated', 'authenticated',
  'hikulu@songchainn.xyz',
  '', now(),
  '{"provider":"email","providers":["email"]}'::jsonb,
  '{"display_name":"$HIKULU"}'::jsonb,
  now(), now(), now() + interval '200 years',
  '', '', '', ''
) on conflict (id) do nothing;
