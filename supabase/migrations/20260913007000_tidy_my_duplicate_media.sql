-- Mo$ha does it for you: "Delete duplicates now" (founder, 13 Sep 2026).
--
-- N3M3SIS asked Mo$ha to clear the duplicate pictures and clips out of her
-- gallery. Most of her copies came from uploading the same file again while
-- building her world, so a copy is very often world art that a street, a city
-- or the gate still points at. Deleting blindly would break her world.
--
-- A duplicate is the same kind, the same size in bytes and the same file name.
-- In each group one piece is kept: the one something still uses, then the one
-- on show, then the oldest. Every other copy is deleted when nothing uses it,
-- and only taken off the public gallery when something does (a world, a song,
-- a release, a profile picture), so nothing on screen ever loses its picture.
--
-- p_apply false only counts, so the button can say how many before the tap.

create or replace function public.tidy_my_duplicate_media(p_apply boolean default false)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  uid uuid := auth.uid();
  n_delete int := 0;
  n_hide int := 0;
  n_groups int := 0;
begin
  if uid is null then
    raise exception 'Sign in first';
  end if;

  create temp table if not exists _tidy (id uuid, used boolean, is_published boolean, rn int, grp text) on commit drop;
  truncate _tidy;

  insert into _tidy
  select m.id, u.used, m.is_published,
         row_number() over (partition by m.kind, m.bytes, regexp_replace(m.public_url, '^.*/', '')
                            order by u.used desc, m.is_published desc, m.created_at asc),
         m.kind || ':' || m.bytes || ':' || regexp_replace(m.public_url, '^.*/', '')
  from artist_media m
  cross join lateral (
    select (
      exists (select 1 from worlds w where to_jsonb(w)::text like '%' || m.public_url || '%')
      or exists (select 1 from world_blocks b where b.props::text like '%' || m.public_url || '%')
      or exists (select 1 from world_nfts n where n.image_url = m.public_url or n.media_url = m.public_url)
      or exists (select 1 from songs s where s.cover_art_url = m.public_url or s.artist_image_url = m.public_url)
      or exists (select 1 from releases r where r.cover_art_url = m.public_url)
      or exists (select 1 from audience_profiles p
                 where m.public_url in (p.avatar_url, p.cover_photo_url, p.cover_url, p.profile_picture_url))
    ) as used
  ) u
  where m.user_id = uid and m.bytes is not null;

  select count(distinct grp) into n_groups from _tidy where rn > 1;
  select count(*) filter (where rn > 1 and not used),
         count(*) filter (where rn > 1 and used and is_published)
    into n_delete, n_hide
  from _tidy;

  if p_apply then
    delete from artist_media where id in (select id from _tidy where rn > 1 and not used) and user_id = uid;
    update artist_media set is_published = false, updated_at = now()
     where id in (select id from _tidy where rn > 1 and used and is_published) and user_id = uid;
  end if;

  return jsonb_build_object('groups', n_groups, 'deleted', n_delete, 'hidden', n_hide, 'applied', p_apply);
end;
$$;

revoke all on function public.tidy_my_duplicate_media(boolean) from public, anon;
grant execute on function public.tidy_my_duplicate_media(boolean) to authenticated;
