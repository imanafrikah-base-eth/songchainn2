-- The artist's Zora account on the world: the creator coin / profile link and
-- the wallet that coin pays. Both are required to open the doors, so every
-- published world has somewhere its money and its key can be found.
-- Applied to the live project via MCP on 10 Sep 2026.
alter table public.worlds
  add column if not exists zora_profile_url text,
  add column if not exists zora_wallet_address text;

create or replace function public.publish_world(_world_id uuid)
 returns table(ok boolean, message text, world_number integer)
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
declare
  _w        public.worlds%rowtype;
  _has_gate boolean;
  _filled   integer;
  _next     integer;
begin
  if auth.uid() is null then
    return query select false, 'Sign in required', null::integer; return;
  end if;

  select * into _w from public.worlds where id = _world_id;
  if _w.id is null then
    return query select false, 'That world does not exist', null::integer; return;
  end if;

  if not public.can_edit_world(_world_id) then
    return query select false, 'You cannot publish this world', null::integer; return;
  end if;

  if _w.status = 'published' then
    return query select true, 'Already live', _w.world_number; return;
  end if;

  select exists (select 1 from public.world_gates g where g.world_id = _world_id) into _has_gate;
  if not _has_gate then
    return query select false, 'Set a key before you open the doors', null::integer; return;
  end if;

  if coalesce(array_length(_w.story, 1), 0) = 0 then
    return query select false, 'Your world needs a story on the gate', null::integer; return;
  end if;

  -- The artist's Zora account: a zora.co link and the wallet it pays.
  if _w.zora_profile_url is null or _w.zora_profile_url !~* '^https?://([a-z0-9-]+\.)*zora\.co/' then
    return query select false, 'Add your Zora profile or creator coin link before you open the doors', null::integer; return;
  end if;
  if _w.zora_wallet_address is null or _w.zora_wallet_address !~ '^0x[0-9a-fA-F]{40}$' then
    return query select false, 'Add the wallet address your Zora account pays to', null::integer; return;
  end if;

  select count(*) into _filled
    from public.world_streets s
   where s.world_id = _world_id
     and exists (select 1 from public.world_blocks b where b.street_id = s.id);

  if _filled < 3 then
    return query select false,
      format('Put something on at least three streets. %s so far.', _filled), null::integer;
    return;
  end if;

  select greatest(
           coalesce((select max(w.world_number) from public.worlds w), 0),
           coalesce((select max(r.number) from public.reserved_world_numbers r), 0)
         ) + 1
    into _next;

  update public.worlds
     set status = 'published', world_number = _next,
         published_at = now(), updated_at = now()
   where id = _world_id;

  insert into public.reserved_world_numbers (number, reason)
  values (_next, 'issued to ' || _w.slug)
  on conflict (number) do nothing;

  return query select true, 'Your world is live', _next;
end;
$function$;
