-- Going on air and coming off it reaches everyone in the world at once.
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
     where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'world_voice_sessions'
  ) then
    alter publication supabase_realtime add table public.world_voice_sessions;
  end if;
end $$;
