-- Applied live via MCP on 13 Sep 2026 (name: nudge_skips_held_back_records).
--
-- N3M3SIS's APE SHITT was published by the team, then taken back down to go
-- out as part of an EP: status back to 'uploading', audition still passed.
-- nudge_stranded_uploads() would have told her to press Ask the judges again,
-- which sends it out alone as a single. A record the judges already passed
-- that sits at 'uploading' was held back on purpose, not stranded. A new
-- audition overwrites songs.audition, so the rule clears itself on the next send.

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
       and s.created_at > now() - interval '2 days'
       -- A record the judges already passed that sits at 'uploading' was held
       -- back on purpose (taken down to go out with a release), not stranded.
       -- Telling its owner to press Ask the judges again would send it out alone.
       and coalesce(s.audition->>'passed', '') <> 'true'
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
