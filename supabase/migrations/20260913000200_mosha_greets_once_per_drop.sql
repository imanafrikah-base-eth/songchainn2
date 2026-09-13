-- One congratulations per drop, not one per song.
--
-- Found 13 Sep 2026: IMan Afrikah put up eleven songs in one sitting and got
-- eleven separate "is live" greetings. Each close of Mo$ha marked one as read
-- and the next opened him again. The app now clears every waiting greeting on
-- close; this stops the backlog forming at all. A song that goes live while a
-- "song_live" greeting from the last 30 minutes is still unread UPDATES that
-- greeting to count the drop, the same way mosha_announce_release folds a
-- drop into one feed post.
--
-- Everything else is unchanged from 20260912000700_mosha_greets_an_artist.sql,
-- including the swallow-all-errors safety: this is an AFTER trigger on songs.

create or replace function public.mosha_greet_on_release()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_claimed  timestamptz;
  v_previous integer;
  v_pending  uuid;
  v_since    timestamptz;
  v_count    integer;
begin
  begin
    if new.status <> 'published' then return new; end if;
    if tg_op = 'UPDATE' and old.status is not distinct from 'published' then return new; end if;
    if new.owner_id is null then return new; end if;

    select aa.claimed_at into v_claimed
      from public.artist_accounts aa
     where aa.user_id = new.owner_id
     limit 1;
    if not found then return new; end if;

    if new.release_date is not null and new.release_date > current_date then return new; end if;
    if new.release_at is not null and new.release_at > now() then return new; end if;

    select count(*) into v_previous
      from public.songs s
     where s.owner_id = new.owner_id
       and s.status = 'published'
       and s.id <> new.id;

    if v_previous = 0 and v_claimed >= timestamptz '2026-09-12 00:00:00+00' then
      insert into public.mosha_greetings (user_id, kind, body, suggestions, song_id)
      values (
        new.owner_id, 'first_song_live',
        'Congratulations. ' || coalesce(new.title, 'Your record') ||
          ' is live on SONGCHAINN, and you are a musician here now. Ask me anything, or start with one of these.',
        jsonb_build_array(
          'How do I get paid for my music?',
          'What is an artist coin?',
          'How do I put out my next record?',
          'How do I build my world?',
          'Who can hear my music now?'
        ),
        new.id
      );
      return new;
    end if;

    -- Part of a drop already being congratulated? Fold it in.
    select g.id, g.created_at into v_pending, v_since
      from public.mosha_greetings g
     where g.user_id = new.owner_id
       and g.kind = 'song_live'
       and g.shown_at is null
       and g.created_at > now() - interval '30 minutes'
     order by g.created_at desc
     limit 1;

    if v_pending is not null then
      select count(*) into v_count
        from public.songs s
       where s.owner_id = new.owner_id
         and s.status = 'published'
         and coalesce(s.published_at, s.created_at) >= v_since - interval '2 minutes';
      v_count := greatest(v_count, 2);
      update public.mosha_greetings
         set body = 'Congratulations, ' || v_count || ' of your records are live. The latest is ' ||
                    coalesce(new.title, 'your new song') || '.',
             song_id = new.id
       where id = v_pending;
    else
      insert into public.mosha_greetings (user_id, kind, body, suggestions, song_id)
      values (
        new.owner_id, 'song_live',
        'Congratulations, ' || coalesce(new.title, 'your song') || ' is live.',
        '[]'::jsonb, new.id
      );
    end if;
  exception when others then
    null;
  end;

  return new;
end
$function$;
