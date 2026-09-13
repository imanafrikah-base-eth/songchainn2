-- A record goes out with a genre.
--
-- The Studio now makes the artist pick one before sending. This is the
-- backstop for any other path. It only fires when a row BECOMES published
-- (an insert that is published, or a status change into published), so the
-- older published rows that have no genre keep working untouched, and the
-- upload-on-pick reservation (inserted by upload-url with genre null at
-- status 'uploading') is not affected.
--
-- NOT APPLIED: written for review. /api/audition sets status to published;
-- with this in place an audition of a genre-less row fails its update, which
-- the Studio already prevents on the client.

create or replace function public.songs_require_genre()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if new.status = 'published'
     and (tg_op = 'INSERT' or old.status is distinct from 'published')
     and nullif(btrim(coalesce(new.genre, '')), '') is null then
    raise exception 'A record needs a genre before it goes out.'
      using errcode = 'check_violation';
  end if;
  return new;
end;
$$;

drop trigger if exists songs_require_genre_trg on public.songs;
create trigger songs_require_genre_trg
  before insert or update of status on public.songs
  for each row execute function public.songs_require_genre();
