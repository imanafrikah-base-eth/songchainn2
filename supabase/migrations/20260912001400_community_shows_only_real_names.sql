-- Community only shows people with a name they chose.
--
-- handle_new_user copied the email's local part into display_name, and wallet
-- sign-ups arrive with wallet-0x...@wallet.songchainn.xyz, so Community filled
-- with cards titled by email addresses and wallet handles. From here:
--   * is_real_name() is the one rule (mirrors src/lib/realName.ts)
--   * get_community_profiles only returns rows with a real name
--   * new accounts get display_name NULL unless the provider gave a real name,
--     so onboarding asks for one
-- Existing names are NOT rewritten; the app sends those people to a name step.

create or replace function public.is_real_name(p_name text, p_email text default null)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select case
    when nullif(btrim(coalesce(p_name, '')), '') is null then false
    when p_name like '%@%' then false
    when btrim(p_name) ~* '^wallet-0x' then false
    when btrim(p_name) ~* '^0x[0-9a-f]{6,}' then false
    when btrim(p_name) ~* '^(fc|fb)-[0-9]+$' then false
    when btrim(p_name) ~* '^user [0-9]+$' then false
    -- The email's local part only counts when it reads like an address
    -- (digits, dots, underscores). A plain word such as "nda" is a name.
    -- Founding artists log in as <artist>@artists.songchainn.xyz, where the
    -- local part IS their artist name (T3RNNN), so that domain is exempt.
    when p_email is not null
         and lower(split_part(p_email, '@', 2)) <> 'artists.songchainn.xyz'
         and split_part(p_email, '@', 1) ~ '[0-9._+-]'
         and lower(btrim(p_name)) = lower(split_part(p_email, '@', 1)) then false
    else true
  end
$$;

revoke all on function public.is_real_name(text, text) from public, anon, authenticated;

create or replace function public.get_community_profiles(p_limit integer default 200, p_offset integer default 0)
returns table(id uuid, user_id uuid, profile_name text, display_name text, username text, bio text, profile_picture_url text, avatar_url text, cover_photo_url text, location text, is_public boolean, created_at timestamp with time zone, updated_at timestamp with time zone)
language sql
stable security definer
set search_path to 'public'
as $function$
  (
    SELECT
      ap.id, ap.user_id,
      ap.profile_name, ap.display_name, ap.username,
      ap.bio,
      ap.profile_picture_url, ap.avatar_url, ap.cover_photo_url,
      ap.location, ap.is_public,
      ap.created_at, ap.updated_at
    FROM public.audience_profiles ap
    LEFT JOIN auth.users u ON u.id = ap.user_id
    WHERE public.is_real_name(
      COALESCE(NULLIF(btrim(ap.display_name), ''), NULLIF(btrim(ap.profile_name), '')),
      u.email
    )
  )
  UNION ALL
  (
    SELECT
      extensions.uuid_generate_v5('00000000-0000-0000-0000-000000000000'::uuid, ('fc-' || fp.fid::text)) AS id,
      extensions.uuid_generate_v5('00000000-0000-0000-0000-000000000000'::uuid, ('fc-' || fp.fid::text)) AS user_id,
      fp.display_name AS profile_name,
      fp.display_name,
      fp.username,
      fp.bio,
      fp.pfp_url   AS profile_picture_url,
      fp.pfp_url   AS avatar_url,
      NULL::text   AS cover_photo_url,
      fp.location,
      fp.is_public,
      fp.created_at, fp.updated_at
    FROM public.farcaster_profiles fp
    WHERE public.is_real_name(COALESCE(NULLIF(btrim(fp.display_name), ''), NULLIF(btrim(fp.username), '')))
  )
  UNION ALL
  (
    SELECT
      extensions.uuid_generate_v5('00000000-0000-0000-0000-000000000000'::uuid, ('fb-' || fbp.facebook_id)) AS id,
      extensions.uuid_generate_v5('00000000-0000-0000-0000-000000000000'::uuid, ('fb-' || fbp.facebook_id)) AS user_id,
      fbp.name        AS profile_name,
      fbp.name        AS display_name,
      NULL::text      AS username,
      fbp.bio,
      fbp.picture_url AS profile_picture_url,
      fbp.picture_url AS avatar_url,
      NULL::text      AS cover_photo_url,
      fbp.location,
      fbp.is_public,
      fbp.created_at, fbp.updated_at
    FROM public.facebook_profiles fbp
    WHERE public.is_real_name(fbp.name)
  )
  ORDER BY updated_at DESC NULLS LAST
  LIMIT  p_limit
  OFFSET p_offset
$function$;

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $function$
DECLARE
  v_name text;
BEGIN
  v_name := COALESCE(
    NULLIF(btrim(NEW.raw_user_meta_data->>'display_name'), ''),
    NULLIF(btrim(NEW.raw_user_meta_data->>'name'), ''),
    NULLIF(btrim(NEW.raw_user_meta_data->>'full_name'), '')
  );
  -- Never the email or a wallet handle. No real name means NULL, and
  -- onboarding asks the person for one.
  IF NOT public.is_real_name(v_name, NEW.email) THEN
    v_name := NULL;
  END IF;

  INSERT INTO public.audience_profiles (
    id, user_id, display_name, onboarding_completed, is_public, created_at, updated_at
  )
  VALUES (NEW.id, NEW.id, v_name, false, true, NOW(), NOW())
  ON CONFLICT (id) DO NOTHING;

  INSERT INTO public.user_roles (user_id, role)
  SELECT NEW.id, 'user'
  WHERE NOT EXISTS (
    SELECT 1 FROM public.user_roles WHERE user_id = NEW.id
  );

  RETURN NEW;
END;
$function$;
