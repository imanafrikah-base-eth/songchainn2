-- A file that went up in pieces can fail at a third stage. Keep in step with
-- src/lib/storageUpload.ts (Stage).
alter table public.upload_failures drop constraint if exists upload_failures_stage_check;
alter table public.upload_failures add constraint upload_failures_stage_check
  check (stage = any (array['send'::text, 'relay'::text, 'parts'::text]));
