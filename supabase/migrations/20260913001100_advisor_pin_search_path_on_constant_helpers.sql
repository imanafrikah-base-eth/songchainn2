-- Security advisor: function_search_path_mutable (3).
-- All three are LANGUAGE sql IMMUTABLE, SECURITY INVOKER, and reference no
-- schema objects at all (two return a constant uuid, one builds a text path),
-- so pinning search_path cannot change what they return. ALTER only: the
-- bodies are untouched.
alter function public._report_target_path(text, text) set search_path = public;
alter function public._mosha_user_id() set search_path = public;
alter function public._founder_user_id() set search_path = public;
