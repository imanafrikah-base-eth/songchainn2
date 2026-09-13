-- Every report a person sends lands in IMan Afrikah's DMs, from Mo$ha.
--
-- The founder asked for bug reports, suggestions, Mo$ha reports and every other
-- report from users to arrive "straight to my DM from Mo$ha". Until now they were
-- spread over seven tables, an email to an inbox nobody watches, and a Console
-- screen. This adds ONE conversation between Mo$ha and IMan (a normal people DM,
-- dm_conversations + dm_participants, the same shape open_conversation makes)
-- and an AFTER INSERT trigger on every live table that stores a user's report.
--
-- Why a direct insert and not send_direct_message: that RPC is coin gated by
-- can_dm_artist, IMan is an artist and Mo$ha is not, so the RPC would refuse.
--
-- Every trigger swallows its own failure, so a broken DM never loses a report.
-- Each trigger also stops DMing one person after a burst (the row is still
-- stored and still shows in the Console), so nobody can flood the founder.
--
-- Automated counters (Zabal Gamez downloads and entry totals) are NOT routed
-- here. They stay on the old Mo$ha thread via send_mosha_message.

-- ---------------------------------------------------------------- ids ---
create or replace function public._mosha_user_id() returns uuid
language sql immutable as $$ select '0e2f6d3a-8b1c-4f7e-9a5d-3c4b2a1f0e9d'::uuid $$;

create or replace function public._founder_user_id() returns uuid
language sql immutable as $$ select '0482bf5e-4b37-4367-a433-e213ef3cc50c'::uuid $$;

-- ------------------------------------------------------- the sender DM ---
create or replace function public.mosha_dm_founder(p_body text, p_meta jsonb default '{}'::jsonb)
returns uuid
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  _mosha   uuid := public._mosha_user_id();
  _founder uuid := public._founder_user_id();
  _conv    uuid;
  _msg     uuid;
  _clean   text := nullif(trim(coalesce(p_body, '')), '');
begin
  if _clean is null then
    raise exception 'Nothing to send';
  end if;

  -- Two reports at the same instant must not open two conversations.
  perform pg_advisory_xact_lock(hashtext('mosha_dm_founder'));

  select c.id into _conv
  from public.dm_conversations c
  join public.dm_participants a on a.conversation_id = c.id and a.user_id = _mosha
  join public.dm_participants b on b.conversation_id = c.id and b.user_id = _founder
  where (select count(*) from public.dm_participants p where p.conversation_id = c.id) = 2
  limit 1;

  if _conv is null then
    insert into public.dm_conversations default values returning id into _conv;
    insert into public.dm_participants (conversation_id, user_id)
    values (_conv, _mosha), (_conv, _founder);
  end if;

  insert into public.dm_messages (conversation_id, sender_user_id, body)
  values (_conv, _mosha, left(_clean, 2000))
  returning id into _msg;

  update public.dm_conversations
  set last_message_at = now(),
      last_message_preview = left(_clean, 140),
      last_sender_id = _mosha
  where id = _conv;

  update public.dm_participants
  set is_archived = false
  where conversation_id = _conv and user_id = _founder;

  insert into public.notifications (user_id, type, from_user_id, message, title, metadata)
  values (
    _founder, 'mention', _mosha, left(_clean, 140), 'New message',
    jsonb_build_object('cta_path', '/inbox?c=' || _conv::text)
      || coalesce(p_meta, '{}'::jsonb)
  );

  return _msg;
end;
$$;

revoke all on function public.mosha_dm_founder(text, jsonb) from public, anon, authenticated;
grant execute on function public.mosha_dm_founder(text, jsonb) to service_role;

-- ------------------------------------------------------------ helpers ---
-- A person's name as the app shows it. The email only when it is all there is.
create or replace function public._report_sender_name(_uid uuid)
returns text
language sql
stable
security definer
set search_path to 'public'
as $$
  select case
    when _uid is null then 'a guest'
    else coalesce(
      (select coalesce(nullif(trim(a.display_name), ''), nullif(trim(a.profile_name), ''),
                       nullif(trim(a.username), ''))
         from public.audience_profiles a where a.user_id = _uid limit 1),
      (select nullif(u.email, '') from auth.users u where u.id = _uid),
      'someone without a name yet'
    )
  end
$$;

-- Where a reported thing lives, as a path the founder can open.
create or replace function public._report_target_path(_type text, _id text)
returns text
language sql
immutable
as $$
  select case
    when _id is null or _id = '' then null
    when _type = 'post' then '/post/' || _id
    when _type = 'song' then '/song/' || _id
    when _type = 'world' then '/world/' || _id
    else null
  end
$$;

revoke all on function public._report_sender_name(uuid) from public, anon, authenticated;
revoke all on function public._report_target_path(text, text) from public, anon, authenticated;
revoke all on function public._mosha_user_id() from public, anon, authenticated;
revoke all on function public._founder_user_id() from public, anon, authenticated;

-- ---------------------------------------------------- content_reports ---
create or replace function public.trg_content_report_dm_founder()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  _path text;
  _body text;
begin
  begin
    if new.reporter_id is not null and (
      select count(*) from public.content_reports
      where reporter_id = new.reporter_id and created_at > now() - interval '10 minutes'
    ) > 5 then
      return new;
    end if;

    _path := public._report_target_path(new.target_type, new.target_id);
    _body :=
      case when new.severity = 'urgent' then 'URGENT. ' else '' end
      || 'Report from ' || public._report_sender_name(new.reporter_id) || ': a '
      || new.target_type || ', reason ' || replace(new.reason, '_', ' ') || '.'
      || case when new.target_user is not null
              then E'\nAbout: ' || public._report_sender_name(new.target_user) else '' end
      || case when _path is not null then E'\nLink: ' || _path
              when new.target_id is not null then E'\nItem id: ' || new.target_id else '' end
      || case when nullif(trim(coalesce(new.detail, '')), '') is not null
              then E'\n\n"' || left(trim(new.detail), 1200) || '"' else '' end
      || E'\n\nOpen the Console to act on it: /console';
    perform public.mosha_dm_founder(_body, jsonb_build_object('report_table', 'content_reports', 'report_id', new.id));
  exception when others then
    null;
  end;
  return new;
end;
$$;

drop trigger if exists trg_content_report_dm_founder on public.content_reports;
create trigger trg_content_report_dm_founder
after insert on public.content_reports
for each row execute function public.trg_content_report_dm_founder();

-- ---------------------------------------------------- message_reports ---
create or replace function public.trg_message_report_dm_founder()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  _said text;
  _body text;
begin
  begin
    if (
      select count(*) from public.message_reports
      where reporter_id = new.reporter_id and created_at > now() - interval '10 minutes'
    ) > 5 then
      return new;
    end if;

    select m.body into _said from public.dm_messages m where m.id = new.message_id;
    _body :=
      'Message report from ' || public._report_sender_name(new.reporter_id) || '.'
      || case when new.reported_id is not null
              then E'\nAbout: ' || public._report_sender_name(new.reported_id) else '' end
      || case when nullif(trim(coalesce(new.reason, '')), '') is not null
              then E'\nReason: ' || left(trim(new.reason), 500) else '' end
      || case when nullif(trim(coalesce(_said, '')), '') is not null
              then E'\n\nThe message: "' || left(trim(_said), 600) || '"' else '' end;
    perform public.mosha_dm_founder(_body, jsonb_build_object('report_table', 'message_reports', 'report_id', new.id));
  exception when others then
    null;
  end;
  return new;
end;
$$;

drop trigger if exists trg_message_report_dm_founder on public.message_reports;
create trigger trg_message_report_dm_founder
after insert on public.message_reports
for each row execute function public.trg_message_report_dm_founder();

-- ---------------------------------------------------- account_appeals ---
create or replace function public.trg_account_appeal_dm_founder()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  _kind text;
  _reason text;
  _body text;
begin
  begin
    select a.kind, a.reason into _kind, _reason from public.account_actions a where a.id = new.action_id;
    _body :=
      'Appeal from ' || public._report_sender_name(new.user_id) || '.'
      || case when _kind is not null then E'\nAgainst: ' || replace(_kind, '_', ' ') else '' end
      || case when nullif(trim(coalesce(_reason, '')), '') is not null
              then ' (' || left(trim(_reason), 300) || ')' else '' end
      || E'\n\n"' || left(trim(coalesce(new.statement, '')), 1200) || '"'
      || E'\n\nDecide it in the Console: /console';
    perform public.mosha_dm_founder(_body, jsonb_build_object('report_table', 'account_appeals', 'report_id', new.id));
  exception when others then
    null;
  end;
  return new;
end;
$$;

drop trigger if exists trg_account_appeal_dm_founder on public.account_appeals;
create trigger trg_account_appeal_dm_founder
after insert on public.account_appeals
for each row execute function public.trg_account_appeal_dm_founder();

-- -------------------------------------------------------- bug_reports ---
-- Written by founder-inbox for Report a bug and for Mo$ha's "pass it on"
-- (area 'Sent through Mo$ha'). The insert policy lets anyone, guests too,
-- write here, so guests share one burst cap.
create or replace function public.trg_bug_report_dm_founder()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  _via_mosha boolean;
  _cap integer;
  _recent integer;
  _area text;
  _body text;
begin
  begin
    -- The first live apply failed with "syntax error at end of input" (13 Sep
    -- 2026). The cause: an IF condition containing CASE WHEN ... THEN. PL/pgSQL
    -- ends an IF condition at its first THEN, so the cap is worked out first.
    _via_mosha := coalesce(new.area, '') ilike ('%mo' || chr(36) || 'ha%');
    _cap := case when new.user_id is null then 20 else 5 end;
    select count(*) into _recent from public.bug_reports
     where user_id is not distinct from new.user_id and created_at > now() - interval '10 minutes';
    if _recent > _cap then
      return new;
    end if;

    _area := case new.area
      when 'playback' then 'Music would not play'
      when 'upload' then 'Uploading a track'
      when 'account' then 'Signing in or my account'
      when 'world' then 'Worlds'
      when 'battle' then 'Battles'
      when 'money' then 'Buying, selling or a wallet'
      when 'display' then 'Something looks wrong on screen'
      when 'other' then 'Something else'
      else new.area
    end;

    _body :=
      case when _via_mosha
           then 'Report from ' || public._report_sender_name(new.user_id) || ' via Mo' || chr(36) || 'ha'
           else 'Bug report from ' || public._report_sender_name(new.user_id) || E'\nArea: ' || coalesce(_area, 'General')
      end
      || E'\n\n' || left(trim(coalesce(new.detail, '(no details)')), 1500)
      || case when new.page is not null then E'\n\nPage: ' || new.page else '' end
      || case when new.screen_size is not null then E'\nScreen: ' || new.screen_size else '' end
      || case when new.user_agent is not null then E'\nDevice: ' || left(new.user_agent, 160) else '' end;
    perform public.mosha_dm_founder(_body, jsonb_build_object('report_table', 'bug_reports', 'report_id', new.id));
  exception when others then
    null;
  end;
  return new;
end;
$$;

drop trigger if exists trg_bug_report_dm_founder on public.bug_reports;
create trigger trg_bug_report_dm_founder
after insert on public.bug_reports
for each row execute function public.trg_bug_report_dm_founder();

-- --------------------------------------------------- suggestion_forms ---
-- The existing trg_queue_suggestion_email stays; this is in addition.
create or replace function public.trg_suggestion_dm_founder()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  _body text;
begin
  begin
    if (
      select count(*) from public.suggestion_forms
      where user_id = new.user_id and created_at > now() - interval '10 minutes'
    ) > 5 then
      return new;
    end if;

    _body :=
      'Feature suggestion from ' || public._report_sender_name(new.user_id)
      || case when nullif(trim(coalesce(new.subject, '')), '') is not null
                   and new.subject not in ('Suggestion', 'Feature suggestion')
              then E'\nTitle: ' || left(trim(new.subject), 200) else '' end
      || E'\n\n' || left(trim(new.improvement_text), 1600);
    perform public.mosha_dm_founder(_body, jsonb_build_object('report_table', 'suggestion_forms', 'report_id', new.id));
  exception when others then
    null;
  end;
  return new;
end;
$$;

drop trigger if exists trg_suggestion_dm_founder on public.suggestion_forms;
create trigger trg_suggestion_dm_founder
after insert on public.suggestion_forms
for each row execute function public.trg_suggestion_dm_founder();

-- --------------------------------------------- world_feature_requests ---
create or replace function public.trg_world_request_dm_founder()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  _body text;
begin
  begin
    if (
      select count(*) from public.world_feature_requests
      where user_id = new.user_id and created_at > now() - interval '10 minutes'
    ) > 5 then
      return new;
    end if;

    _body :=
      'World builder request from ' || public._report_sender_name(new.user_id) || ' via Mo' || chr(36) || 'ha'
      || case when new.world_slug is not null then E'\nWorld: /world/' || new.world_slug else '' end
      || case when new.build_step is not null then E'\nStep: ' || new.build_step else '' end
      || E'\n\n' || left(trim(coalesce(new.request, new.asked_as, '')), 1600);
    perform public.mosha_dm_founder(_body, jsonb_build_object('report_table', 'world_feature_requests', 'report_id', new.id));
  exception when others then
    null;
  end;
  return new;
end;
$$;

drop trigger if exists trg_world_request_dm_founder on public.world_feature_requests;
create trigger trg_world_request_dm_founder
after insert on public.world_feature_requests
for each row execute function public.trg_world_request_dm_founder();

-- --------------------------------------------- phase_two_beta_reports ---
create or replace function public.trg_beta_report_dm_founder()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  _body text;
begin
  begin
    if (
      select count(*) from public.phase_two_beta_reports
      where user_id = new.user_id and created_at > now() - interval '10 minutes'
    ) > 5 then
      return new;
    end if;

    _body :=
      'Beta feedback from ' || public._report_sender_name(new.user_id)
      || E'\nRating: ' || new.rating::text
      || E'\n\n' || left(trim(new.report), 1600);
    perform public.mosha_dm_founder(_body, jsonb_build_object('report_table', 'phase_two_beta_reports', 'report_id', new.id));
  exception when others then
    null;
  end;
  return new;
end;
$$;

drop trigger if exists trg_beta_report_dm_founder on public.phase_two_beta_reports;
create trigger trg_beta_report_dm_founder
after insert on public.phase_two_beta_reports
for each row execute function public.trg_beta_report_dm_founder();

-- Trigger functions are never called directly.
revoke all on function public.trg_content_report_dm_founder() from public, anon, authenticated;
revoke all on function public.trg_message_report_dm_founder() from public, anon, authenticated;
revoke all on function public.trg_account_appeal_dm_founder() from public, anon, authenticated;
revoke all on function public.trg_bug_report_dm_founder() from public, anon, authenticated;
revoke all on function public.trg_suggestion_dm_founder() from public, anon, authenticated;
revoke all on function public.trg_world_request_dm_founder() from public, anon, authenticated;
revoke all on function public.trg_beta_report_dm_founder() from public, anon, authenticated;
