-- MO$HA service account: a real auth.users row (never logs in; random password,
-- no known credentials) so audience_profiles FKs hold. Used by edge functions
-- (submit-zabal-entry) to author feed posts as MO$HA.
--
-- Note: an on-auth-user-created trigger auto-creates the audience_profiles row,
-- so the explicit insert below lands on the ON CONFLICT update path in practice.
do $$
declare
  mosha_id uuid := '0e2f6d3a-8b1c-4f7e-9a5d-3c4b2a1f0e9d';
begin
  if not exists (select 1 from auth.users where id = mosha_id) then
    insert into auth.users (
      instance_id, id, aud, role, email,
      encrypted_password, email_confirmed_at,
      raw_app_meta_data, raw_user_meta_data,
      created_at, updated_at,
      confirmation_token, recovery_token, email_change_token_new, email_change
    ) values (
      '00000000-0000-0000-0000-000000000000',
      mosha_id,
      'authenticated',
      'authenticated',
      'mosha@songchainn.xyz',
      crypt(gen_random_uuid()::text, gen_salt('bf')),
      now(),
      '{"provider":"email","providers":["email"]}'::jsonb,
      '{"display_name":"MO$HA","is_service_account":true}'::jsonb,
      now(), now(),
      '', '', '', ''
    );
  end if;

  insert into public.audience_profiles (id, user_id, username, display_name, profile_name, avatar_url, profile_picture_url, bio, onboarding_completed, is_public)
  values (
    mosha_id, mosha_id, 'mosha', 'MO$HA', 'MO$HA',
    '/mosha-avatar.png', '/mosha-avatar.png',
    'Your vibe guide around $ongChainn. I hype the community and keep you posted.',
    true, true
  )
  on conflict (id) do update
    set username = coalesce(audience_profiles.username, excluded.username),
        display_name = excluded.display_name,
        profile_name = excluded.profile_name,
        avatar_url = excluded.avatar_url,
        profile_picture_url = excluded.profile_picture_url,
        bio = excluded.bio,
        onboarding_completed = true,
        is_public = true;
end $$;
