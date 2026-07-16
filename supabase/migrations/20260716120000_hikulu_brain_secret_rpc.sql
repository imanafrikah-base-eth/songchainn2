-- Service-role-only accessor for the $HIKULU LLM key stored in Vault.
-- (Edge function secrets are unavailable without CLI auth; Vault is the
-- equivalent encrypted store reachable over SQL.)
-- The secret itself is created out-of-band, never in a committed migration:
--   select vault.create_secret('<gemini-api-key>', 'GEMINI_API_KEY', '...');
create or replace function public.get_hikulu_brain_key()
returns text
language sql
security definer
set search_path = ''
as $$
  select decrypted_secret from vault.decrypted_secrets where name = 'GEMINI_API_KEY' limit 1;
$$;

revoke all on function public.get_hikulu_brain_key() from public;
revoke all on function public.get_hikulu_brain_key() from anon;
revoke all on function public.get_hikulu_brain_key() from authenticated;
grant execute on function public.get_hikulu_brain_key() to service_role;
