-- comment_likes never existed in the live database, despite src/hooks/useCommentLikes.ts
-- querying it since it was written -- comment likes have been fully non-functional
-- (silent no-op) for every user. This creates the table the existing client code
-- already expects, with no application code changes needed.

CREATE TABLE IF NOT EXISTS public.comment_likes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  comment_id uuid NOT NULL REFERENCES public.post_comments(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (comment_id, user_id)
);

ALTER TABLE public.comment_likes ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "comment_likes_select" ON public.comment_likes;
CREATE POLICY "comment_likes_select" ON public.comment_likes FOR SELECT USING (true);

DROP POLICY IF EXISTS "comment_likes_insert" ON public.comment_likes;
CREATE POLICY "comment_likes_insert" ON public.comment_likes FOR INSERT TO authenticated WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS "comment_likes_delete" ON public.comment_likes;
CREATE POLICY "comment_likes_delete" ON public.comment_likes FOR DELETE TO authenticated USING (user_id = auth.uid());
