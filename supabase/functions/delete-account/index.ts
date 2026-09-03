// delete-account: a person removes their own account and what is in it.
//
// Google Play's "Data deletion" policy and our own Privacy Notice both promise
// this: deletion of the account and its contents, except things on a
// blockchain and things we must keep. This function is that promise.
//
// WHAT GOES. Everything a person authored or that describes them: profile,
// posts, comments, likes, follows, blocks, playlists, room chat, battle votes,
// notifications, points, holdings cache, world citizenship, feature requests,
// bug reports, referral codes, roles. Then the auth record itself, which is
// what makes the email free to sign up again.
//
// WHAT STAYS. Records with legal or financial weight, with the account they
// point at gone: purchases and trades (receipts), token launches, bookings,
// consent records (proof of what was accepted), reports they filed about
// other people, and anything already written to Base. Released records and
// published worlds stay too, with the personal account unlinked; they are the
// artist's public work, not private data, and coins on chain point at them.
//
// Only the caller can delete the caller. The JWT names them; nothing in the
// body is trusted.

import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function admin() {
  return createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    { auth: { persistSession: false, autoRefreshToken: false } },
  );
}

/** Tables wiped by the given column. Order matters only for readability. */
const PERSONAL: Array<[table: string, column: string]> = [
  ["post_likes", "user_id"],
  ["comment_likes", "user_id"],
  ["post_comments", "user_id"],
  ["social_posts", "user_id"],
  ["pulses", "user_id"],
  ["liked_songs", "user_id"],
  ["liked_artists", "user_id"],
  ["user_follows", "follower_id"],
  ["user_follows", "following_id"],
  ["user_blocks", "blocker_id"],
  ["user_blocks", "blocked_id"],
  ["playlist_collaborators", "user_id"],
  ["playlists", "user_id"],
  ["room_messages", "user_id"],
  ["room_profiles", "user_id"],
  ["battle_room_messages", "user_id"],
  ["battle_speaker_requests", "user_id"],
  ["battle_votes", "user_id"],
  ["battle_rooms", "user_id"],
  ["notifications", "user_id"],
  ["notifications", "from_user_id"],
  ["song_analytics", "user_id"],
  ["song_holdings", "user_id"],
  ["user_points_daily", "user_id"],
  ["user_points", "user_id"],
  ["referral_codes", "user_id"],
  ["suggestion_forms", "user_id"],
  ["bug_reports", "user_id"],
  ["phase_two_beta_reports", "user_id"],
  ["world_feature_requests", "user_id"],
  ["world_access_snapshots", "user_id"],
  ["world_citizens", "user_id"],
  ["world_roles", "user_id"],
  ["artist_media", "user_id"],
  ["artist_claims", "user_id"],
  ["artist_accounts", "user_id"],
  ["account_appeals", "user_id"],
  ["account_actions", "user_id"],
  ["user_roles", "user_id"],
  ["audience_profiles", "user_id"],
];

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  try {
    const token = (req.headers.get("Authorization") ?? "").replace(/^Bearer\s+/i, "").trim();
    if (!token) return json({ error: "Not signed in" }, 401);

    const db = admin();
    const { data: userData, error: userErr } = await db.auth.getUser(token);
    const user = userData?.user;
    if (userErr || !user) return json({ error: "Not signed in" }, 401);
    const uid = user.id;

    const removed: Record<string, number> = {};
    const skipped: string[] = [];
    for (const [table, column] of PERSONAL) {
      const { error, count } = await db
        .from(table)
        .delete({ count: "exact" })
        .eq(column, uid);
      if (error) {
        // A table that does not exist in this environment is not a reason to
        // stop; the rest still goes, and the auth record still goes.
        skipped.push(`${table}.${column}: ${error.message}`);
        continue;
      }
      removed[`${table}.${column}`] = count ?? 0;
    }

    const { error: authErr } = await db.auth.admin.deleteUser(uid);
    if (authErr) {
      console.error("delete-account: auth delete failed", authErr.message, { uid, skipped });
      return json({ error: "Your data was removed but the sign-in record could not be. Email songchaindao@gmail.com and we will finish it." }, 500);
    }

    console.log("delete-account: done", { uid, removed, skipped });
    return json({ ok: true, removed, skipped });
  } catch (err) {
    console.error("delete-account error:", err);
    return json({ error: "Deletion failed. Nothing was changed. Try again, or email songchaindao@gmail.com." }, 500);
  }
});
