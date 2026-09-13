-- Pro release types in the Studio (13 Sep 2026).
--
-- The Studio now asks what is being released first: Single, EP, Album,
-- Mixtape, Compilation or Catalog. Catalog is a bulk upload of singles and
-- never makes a releases row. Mixtape and Compilation are real release kinds,
-- and the live CHECK only allowed single, ep and album.
--
-- Until this is applied the app degrades on its own: a mixtape or compilation
-- insert that hits releases_kind_check is retried as 'album' (see
-- insertRelease in src/hooks/useReleases.ts), so nothing breaks either way.

alter table public.releases drop constraint if exists releases_kind_check;

alter table public.releases
  add constraint releases_kind_check
  check (kind = any (array['single', 'ep', 'album', 'mixtape', 'compilation']::text[]));
