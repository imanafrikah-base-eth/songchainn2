-- One artist, one name, one world.
--
-- Three worlds carried the name N3M3SIS, two of them the same person's, and
-- nothing stopped a fourth. From here a name belongs to whoever took it
-- first, an account may hold one world, and the way out of a duplicate is
-- to merge it into the one being kept rather than to delete work.
--
-- Names already taken twice are left alone: those are real accounts, and
-- turning one of them off is the founder's call, not a migration's. The
-- rules below stop the next one.
--
-- Also: a world remembers when it was made and when its artist last walked
-- into it, so the builder can say both.

alter table public.worlds add column if not exists owner_last_entered_at timestamptz;

create or replace function public.profile_name_is_taken()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  v_taken boolean;
begin
  if coalesce(btrim(new.display_name), '') = '' then return new; end if;
  if tg_op = 'UPDATE' and lower(btrim(coalesce(old.display_name, ''))) = lower(btrim(new.display_name)) then
    return new;
  end if;
  select exists (
    select 1 from public.audience_profiles p
     where p.user_id <> new.user_id
       and lower(btrim(coalesce(p.display_name, ''))) = lower(btrim(new.display_name))
  ) into v_taken;
  if v_taken then
    raise exception 'The name % is taken. Pick another one.', btrim(new.display_name)
      using errcode = 'unique_violation';
  end if;
  return new;
end $$;

drop trigger if exists profile_name_is_taken_trg on public.audience_profiles;
create trigger profile_name_is_taken_trg
  before insert or update of display_name on public.audience_profiles
  for each row execute function public.profile_name_is_taken();

create or replace function public.worlds_one_per_owner()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  v_existing text;
begin
  select slug into v_existing
    from public.worlds
   where owner_id = new.owner_id
     and id <> new.id
   order by created_at
   limit 1;
  if v_existing is not null then
    raise exception 'You already have a world (%). Open it to keep building, or merge this one into it.', v_existing
      using errcode = 'unique_violation';
  end if;
  return new;
end $$;

drop trigger if exists worlds_one_per_owner_trg on public.worlds;
create trigger worlds_one_per_owner_trg
  before insert on public.worlds
  for each row execute function public.worlds_one_per_owner();

create or replace function public.worlds_name_is_taken()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  v_owner uuid;
begin
  if coalesce(btrim(new.artist_name), '') = '' then return new; end if;
  select owner_id into v_owner
    from public.worlds
   where id <> new.id
     and lower(btrim(coalesce(artist_name, ''))) = lower(btrim(new.artist_name))
   order by created_at
   limit 1;
  if v_owner is not null and v_owner is distinct from new.owner_id then
    raise exception 'The name % is already a world here. Pick another name.', btrim(new.artist_name)
      using errcode = 'unique_violation';
  end if;
  return new;
end $$;

drop trigger if exists worlds_name_is_taken_trg on public.worlds;
create trigger worlds_name_is_taken_trg
  before insert or update of artist_name on public.worlds
  for each row execute function public.worlds_name_is_taken();

/** Stamped when an artist opens their own world. Nobody else's visit counts. */
create or replace function public.touch_world_entry(p_slug text)
returns timestamptz
language plpgsql
security definer
set search_path = public
as $$
declare
  v_at timestamptz := now();
begin
  update public.worlds
     set owner_last_entered_at = v_at
   where slug = p_slug
     and owner_id = auth.uid();
  if not found then return null; end if;
  return v_at;
end $$;
grant execute on function public.touch_world_entry(text) to authenticated;

/**
 * Fold one of your worlds into another. Every street (and everything on it)
 * moves across, keeping its name; a street whose name is already taken over
 * there arrives with a number after it rather than overwriting anything.
 * Art, the story and settings fill only the blanks on the world being kept.
 * Citizens move. Then the emptied world goes.
 *
 * Both worlds must be yours, and a published world can only be the keeper.
 */
create or replace function public.merge_worlds(p_keep uuid, p_merge uuid)
returns public.worlds
language plpgsql
security definer
set search_path = public
as $$
declare
  v_keep  public.worlds;
  v_merge public.worlds;
  v_street record;
  v_slug text;
  v_n int;
  v_max int;
begin
  if auth.uid() is null then raise exception 'Sign in first.'; end if;
  if p_keep = p_merge then raise exception 'Those are the same world.'; end if;

  select * into v_keep  from public.worlds where id = p_keep  for update;
  select * into v_merge from public.worlds where id = p_merge for update;
  if v_keep.id is null or v_merge.id is null then raise exception 'One of those worlds is gone.'; end if;
  if v_keep.owner_id is distinct from auth.uid() or v_merge.owner_id is distinct from auth.uid() then
    raise exception 'Both worlds have to be yours.';
  end if;
  if v_merge.status = 'published' and v_keep.status <> 'published' then
    raise exception 'The world that is open to people has to be the one you keep.';
  end if;

  select coalesce(max(sort_order), 0) into v_max from public.world_streets where world_id = p_keep;

  for v_street in
    select * from public.world_streets where world_id = p_merge order by sort_order, slug
  loop
    v_slug := v_street.slug;
    v_n := 1;
    while exists (select 1 from public.world_streets where world_id = p_keep and slug = v_slug) loop
      v_n := v_n + 1;
      v_slug := left(v_street.slug, 40) || '-' || v_n;
    end loop;
    v_max := v_max + 1;
    update public.world_streets
       set world_id = p_keep,
           slug = v_slug,
           name = case when v_n > 1 then v_street.name || ' ' || v_n else v_street.name end,
           sort_order = v_max
     where id = v_street.id;
  end loop;

  update public.worlds k
     set positioning       = coalesce(nullif(btrim(k.positioning), ''), v_merge.positioning),
         story             = case when coalesce(array_length(k.story, 1), 0) = 0 then v_merge.story else k.story end,
         hero_image        = coalesce(k.hero_image, v_merge.hero_image),
         hero_video        = coalesce(k.hero_video, v_merge.hero_video),
         entrance_poster   = coalesce(k.entrance_poster, v_merge.entrance_poster),
         entrance_video    = coalesce(k.entrance_video, v_merge.entrance_video),
         room_art          = coalesce(v_merge.room_art, '{}'::jsonb) || coalesce(k.room_art, '{}'::jsonb),
         city_art          = coalesce(v_merge.city_art, '{}'::jsonb) || coalesce(k.city_art, '{}'::jsonb),
         room_video        = coalesce(v_merge.room_video, '{}'::jsonb) || coalesce(k.room_video, '{}'::jsonb),
         city_video        = coalesce(v_merge.city_video, '{}'::jsonb) || coalesce(k.city_video, '{}'::jsonb),
         art_fit           = coalesce(v_merge.art_fit, '{}'::jsonb) || coalesce(k.art_fit, '{}'::jsonb),
         featured_song_ids = case when coalesce(array_length(k.featured_song_ids, 1), 0) = 0 then v_merge.featured_song_ids else k.featured_song_ids end,
         zora_profile_url  = coalesce(nullif(btrim(k.zora_profile_url), ''), v_merge.zora_profile_url),
         zora_wallet_address = coalesce(nullif(btrim(k.zora_wallet_address), ''), v_merge.zora_wallet_address),
         token_symbol      = coalesce(nullif(btrim(k.token_symbol), ''), v_merge.token_symbol),
         swap_url          = coalesce(nullif(btrim(k.swap_url), ''), v_merge.swap_url),
         farcaster_url     = coalesce(nullif(btrim(k.farcaster_url), ''), v_merge.farcaster_url),
         ad_kind           = coalesce(k.ad_kind, v_merge.ad_kind),
         ad_image          = coalesce(k.ad_image, v_merge.ad_image),
         ad_video          = coalesce(k.ad_video, v_merge.ad_video),
         created_at        = least(k.created_at, v_merge.created_at),
         owner_last_entered_at = greatest(coalesce(k.owner_last_entered_at, v_merge.owner_last_entered_at), coalesce(v_merge.owner_last_entered_at, k.owner_last_entered_at)),
         updated_at        = now()
   where k.id = p_keep;

  insert into public.world_gates (world_id, kind, token_address, token_decimals, fan_threshold, insider_threshold, council_size, song_id, song_threshold)
  select p_keep, g.kind, g.token_address, g.token_decimals, g.fan_threshold, g.insider_threshold, g.council_size, g.song_id, g.song_threshold
    from public.world_gates g
   where g.world_id = p_merge
     and not exists (select 1 from public.world_gates x where x.world_id = p_keep);

  update public.world_citizens c
     set world_slug = v_keep.slug
   where c.world_slug = v_merge.slug
     and not exists (
       select 1 from public.world_citizens x
        where x.world_slug = v_keep.slug and x.user_id = c.user_id
     );
  delete from public.world_citizens where world_slug = v_merge.slug;
  delete from public.world_gates where world_id = p_merge;
  delete from public.worlds where id = p_merge;

  select * into v_keep from public.worlds where id = p_keep;
  return v_keep;
end $$;
grant execute on function public.merge_worlds(uuid, uuid) to authenticated;
