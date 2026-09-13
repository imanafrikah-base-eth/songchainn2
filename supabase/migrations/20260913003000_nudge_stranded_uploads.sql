-- A record whose audio arrived must never sit at 'uploading' in silence.
--
-- The Studio lands the file the moment it is picked, so the songs row exists
-- (status 'uploading', no cover, no genre) before the artist presses Send. When
-- Send never happens (the tab closes, the form blocked, the phone lost the
-- page) the row waits forever and the artist has no idea why. N3M3SIS stranded
-- APE SHITT twice this way on 13 Sep 2026.
--
-- The audition itself cannot run from the database (it decodes the audio in a
-- Vercel function under the artist's session), and nothing is ever published
-- without its cover and genre, so this sweep does not publish anything. Every
-- ten minutes it tells the owner, once per record, what is missing and where to
-- finish it. The Studio card then sends it to the judges on save.

create or replace function public.nudge_stranded_uploads()
returns integer
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  r         record;
  v_missing text;
  v_count   integer := 0;
begin
  for r in
    select s.id, s.owner_id, s.title, s.cover_art_url, s.genre
      from public.songs s
     where s.status = 'uploading'
       and s.owner_id is not null
       and coalesce(s.audio_url, '') <> ''
       and s.created_at < now() - interval '30 minutes'
       -- Only fresh strandings; old ones are cleared by hand, not nagged about.
       and s.created_at > now() - interval '2 days'
       and not exists (
         select 1 from public.notifications n
          where n.user_id = s.owner_id
            and n.type = 'announcement'
            and n.metadata->>'kind' = 'upload_waiting'
            and n.metadata->>'song_id' = s.id::text
       )
  loop
    v_missing := case
      when coalesce(r.cover_art_url, '') = '' and nullif(btrim(coalesce(r.genre, '')), '') is null then 'the cover art and a genre'
      when coalesce(r.cover_art_url, '') = '' then 'the cover art'
      when nullif(btrim(coalesce(r.genre, '')), '') is null then 'a genre'
      else null
    end;

    perform public.write_notification(
      r.owner_id, null, 'announcement', 'Your song is safely uploaded',
      coalesce(nullif(btrim(r.title), ''), 'Your record') || ' is in. ' ||
        case
          when v_missing is null then 'Open your Studio and press Ask the judges again to put it live.'
          else 'Add ' || v_missing || ' in your Studio, save, and it goes live.'
        end,
      null,
      jsonb_build_object('kind', 'upload_waiting', 'song_id', r.id, 'cta_path', '/studio')
    );
    v_count := v_count + 1;
  end loop;

  return v_count;
end
$function$;

revoke all on function public.nudge_stranded_uploads() from public, anon, authenticated;

select cron.schedule('nudge-stranded-uploads', '*/10 * * * *', 'select public.nudge_stranded_uploads();');
