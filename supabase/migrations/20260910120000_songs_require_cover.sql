-- No record goes live without its artwork, and a live record keeps it.
-- Every door a record can come through (the Studio, Mo$ha's chat, the
-- audition function) checks this too; this is the one that cannot be skipped.
create or replace function public.songs_require_cover()
returns trigger
language plpgsql
set search_path to 'public'
as $$
begin
  if new.status = 'published' and coalesce(new.cover_art_url, '') = '' then
    if tg_op = 'INSERT' or old.status is distinct from 'published' then
      raise exception 'A record cannot go live without its cover art. Add the artwork first.' using errcode = 'check_violation';
    end if;
    if coalesce(old.cover_art_url, '') <> '' then
      raise exception 'A live record keeps its cover art. Replace it rather than removing it.' using errcode = 'check_violation';
    end if;
  end if;
  return new;
end $$;

drop trigger if exists songs_require_cover_trg on public.songs;
create trigger songs_require_cover_trg
  before insert or update of status, cover_art_url on public.songs
  for each row execute function public.songs_require_cover();
