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
// The artist_accounts row (the claim on a page, its verification and theme)
// is one of those: it is unlinked, not deleted, so the page keeps its badge
// and look and can be claimed again.
//
// Profile pictures and covers live in storage, not in a table, so they are
// removed here explicitly: everything under {uid}/ in the avaters and covers
// buckets, and nothing outside that prefix.
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
  // artist_accounts is NOT here on purpose: it is unlinked below, not deleted.
  ["account_appeals", "user_id"],
  ["account_actions", "user_id"],
  ["user_roles", "user_id"],
  ["audience_profiles", "user_id"],
];

/**
 * Tables where the row outlives the person and only the link to them goes.
 * The row is public work or a record with weight; the person is not.
 */
const UNLINK: Array<[table: string, column: string]> = [
  ["artist_accounts", "user_id"],
];

/** Public image buckets where a person's own files sit under `{uid}/`. */
const OWN_IMAGE_BUCKETS = ["avaters", "covers"] as const;

const LIST_PAGE = 1000;

type Admin = ReturnType<typeof admin>;

/**
 * Every object path under `prefix` in `bucket`, walking into sub-folders.
 * The prefix is always the caller's own uid, so nothing outside it is ever
 * listed, let alone removed.
 */
async function listOwnObjects(db: Admin, bucket: string, prefix: string): Promise<string[]> {
  const paths: string[] = [];
  const folders = [prefix];
  while (folders.length) {
    const dir = folders.pop()!;
    for (let offset = 0; ; offset += LIST_PAGE) {
      const { data, error } = await db.storage.from(bucket).list(dir, { limit: LIST_PAGE, offset });
      if (error) throw new Error(error.message);
      for (const entry of data ?? []) {
        if (!entry.name) continue;
        const full = `${dir}/${entry.name}`;
        // Supabase lists a folder as an entry with no id and no metadata.
        if (entry.id == null && !entry.metadata) folders.push(full);
        else paths.push(full);
      }
      if (!data || data.length < LIST_PAGE) break;
    }
  }
  return paths;
}

/**
 * Remove the caller's own files from the image buckets. Never fatal: a
 * missing bucket or a storage hiccup is reported in `skipped`, and the rows
 * and the auth record still go.
 */
async function removeOwnImages(
  db: Admin,
  uid: string,
  removed: Record<string, number>,
  skipped: string[],
) {
  for (const bucket of OWN_IMAGE_BUCKETS) {
    try {
      const paths = (await listOwnObjects(db, bucket, uid)).filter((p) => p.startsWith(`${uid}/`));
      if (paths.length === 0) {
        removed[`storage.${bucket}`] = 0;
        continue;
      }
      const { data, error } = await db.storage.from(bucket).remove(paths);
      if (error) throw new Error(error.message);
      removed[`storage.${bucket}`] = data?.length ?? paths.length;
      if ((data?.length ?? 0) < paths.length) {
        skipped.push(`storage.${bucket}: ${paths.length - (data?.length ?? 0)} of ${paths.length} objects not removed`);
      }
    } catch (err) {
      skipped.push(`storage.${bucket}: ${err instanceof Error ? err.message : String(err)}`);
    }
  }
}

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

    // Pictures first, while the profile row that points at them still exists.
    await removeOwnImages(db, uid, removed, skipped);

    // Unlink what outlives the person.
    for (const [table, column] of UNLINK) {
      const { error, count } = await db
        .from(table)
        .update({ [column]: null }, { count: "exact" })
        .eq(column, uid);
      if (error) {
        skipped.push(`${table}.${column} (unlink): ${error.message}`);
        continue;
      }
      removed[`${table}.${column} (unlinked)`] = count ?? 0;
    }

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
