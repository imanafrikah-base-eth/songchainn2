// upload-url — hands an artist a short-lived, presigned PUT straight into
// SONGCHAINN's own Cloudflare R2 bucket.
//
// Why R2 and not Supabase Storage: R2 egress is free forever. Every play of
// every track costs us nothing. Supabase bills egress, so the same catalog on
// Supabase Storage would bill us for listening, which is the cost that kills
// music apps. The bytes never pass through this function either; the browser
// PUTs directly to R2.
//
// The artist needs an account. The artist does NOT need a wallet: a wallet is
// only required to coin a track, never to release one.
//
// Request:  POST { title, artistName, fileName, contentType, fileBytes, genre? }
// Response: { songId, uploadUrl, storageKey, publicUrl, expiresIn }

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const ALLOWED_ORIGINS = new Set<string>(
  (Deno.env.get("ALLOWED_ORIGINS") ??
    "https://songchainn.xyz,https://app.songchainn.xyz,https://www.songchainn.xyz,https://beta.songchainn.xyz,http://localhost:5173,http://127.0.0.1:5173")
    .split(",").map((s) => s.trim()).filter(Boolean),
);

function corsFor(origin: string | null) {
  const allow = origin && ALLOWED_ORIGINS.has(origin) ? origin : "";
  return {
    "Access-Control-Allow-Origin": allow,
    "Vary": "Origin",
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
  };
}

function json(origin: string | null, body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsFor(origin), "Content-Type": "application/json" },
  });
}

/* ------------------------------------------------------------ limits --- */

// 100 MB. A WAV master runs about 10.6 MB per minute at 44.1k/16-bit stereo,
// so a 25 MB cap would have turned away almost every real WAV in the catalog
// (the founding masters average around 30 MB). R2 storage is ~$0.015/GB/month,
// so the generous cap costs us almost nothing and keeps lossless the norm.
const MAX_BYTES = 100 * 1024 * 1024;
const MIN_BYTES = 128 * 1024;         // below this it is not a song
const PRESIGN_TTL = 900;              // 15 minutes to finish the PUT

// WAV and MP3 only, deliberately. The audition can only decode what the
// measurement engine decodes, and accepting a FLAC we cannot judge would leave
// the artist stuck in 'auditioning' forever. Widen this and _audio.mjs together.
const ALLOWED_TYPES: Record<string, string> = {
  "audio/mpeg": "mp3",
  "audio/mp3": "mp3",
  "audio/wav": "wav",
  "audio/x-wav": "wav",
  "audio/wave": "wav",
  "audio/vnd.wave": "wav",
};

// Cover art. A release with no artwork looks broken next to the catalog, so the
// Studio offers it on the same screen as the audio and it rides the same
// presigned-PUT path into the same bucket.
const MAX_COVER_BYTES = 8 * 1024 * 1024;
const COVER_TYPES: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/jpg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
};

/* ------------------------------------------------------- visual work --- */

// Artwork, photographs and video. Bigger than a cover because a piece of work
// is not a thumbnail, and video is the whole reason for the ceiling: a minute
// of decent phone footage is tens of megabytes.
const MAX_IMAGE_BYTES = 20 * 1024 * 1024;
const MAX_VIDEO_BYTES = 200 * 1024 * 1024;

// Only formats a browser will actually play or paint. Accepting a MOV that
// half the audience cannot open is worse than refusing it at the door.
const VISUAL_TYPES: Record<string, { ext: string; kind: "image" | "video" }> = {
  "image/jpeg": { ext: "jpg", kind: "image" },
  "image/jpg": { ext: "jpg", kind: "image" },
  "image/png": { ext: "png", kind: "image" },
  "image/webp": { ext: "webp", kind: "image" },
  "image/gif": { ext: "gif", kind: "image" },
  "image/avif": { ext: "avif", kind: "image" },
  "video/mp4": { ext: "mp4", kind: "video" },
  "video/webm": { ext: "webm", kind: "video" },
};

const VISUALS_PER_DAY = 40;

async function presignVisual(o: {
  // deno-lint-ignore no-explicit-any
  db: any;
  userId: string;
  title: string;
  caption: string | null;
  fileName: string;
  contentType: string;
  fileBytes: number;
  accountId: string;
  accessKeyId: string;
  secretAccessKey: string;
  bucket: string;
  publicBase: string;
}): Promise<{ status: number; body: unknown }> {
  // Artists only. Row level security refuses this too, but a policy refusal
  // arrives as an empty result rather than a reason, and somebody who just
  // waited on a 40 MB upload deserves to be told why before it starts.
  const { data: account } = await o.db
    .from("artist_accounts").select("artist_id").eq("user_id", o.userId).maybeSingle();
  if (!account?.artist_id) {
    return {
      status: 403,
      body: {
        error:
          "Photos and video are for artist pages. You can still write, share anything on SONGCHAINN, and make a song card in the app.",
      },
    };
  }

  const type = VISUAL_TYPES[o.contentType];
  if (!type) {
    return {
      status: 415,
      body: { error: "Images can be JPG, PNG, WebP, GIF or AVIF. Video can be MP4 or WebM." },
    };
  }
  const cap = type.kind === "video" ? MAX_VIDEO_BYTES : MAX_IMAGE_BYTES;
  if (!Number.isFinite(o.fileBytes) || o.fileBytes <= 0 || o.fileBytes > cap) {
    return {
      status: 413,
      body: { error: `${type.kind === "video" ? "Video" : "Images"} must be under ${cap / (1024 * 1024)} MB.` },
    };
  }

  const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
  const { count, error: countErr } = await o.db
    .from("artist_media")
    .select("id", { count: "exact", head: true })
    .eq("user_id", o.userId)
    .gte("created_at", since);
  if (countErr) {
    console.error("upload-url visual quota check failed:", countErr);
    return { status: 500, body: { error: "Could not start the upload. Try again." } };
  }
  if ((count ?? 0) >= VISUALS_PER_DAY) {
    return {
      status: 429,
      body: { error: `That is ${VISUALS_PER_DAY} pieces today. Come back tomorrow.` },
    };
  }

  // Their page. Read once at the top, where it also decided whether they are
  // allowed here at all, so an artist's music and their visual work land on one
  // page rather than two.
  const artistId = account.artist_id;

  // Reserve the row first so we choose the storage key, never the browser.
  const mediaId = crypto.randomUUID();
  const key = [
    "visuals",
    o.userId,
    mediaId,
    `${slugify(o.fileName.replace(/\.[^.]+$/, ""), type.kind)}.${type.ext}`,
  ].join("/");
  const publicUrl = `${o.publicBase}/${key}`;

  // is_published false until the browser confirms the PUT landed. A row that
  // points at a key holding nothing is a broken tile in somebody's gallery.
  const { error: insertErr } = await o.db.from("artist_media").insert({
    id: mediaId,
    user_id: o.userId,
    artist_id: artistId,
    kind: type.kind,
    title: o.title || null,
    caption: o.caption,
    storage_key: key,
    public_url: publicUrl,
    mime_type: o.contentType,
    bytes: Math.round(o.fileBytes),
    is_published: false,
  });
  if (insertErr) {
    console.error("upload-url could not reserve artist_media:", insertErr);
    return { status: 500, body: { error: "Could not start the upload. Try again." } };
  }

  const uploadUrl = await presignPut({
    accountId: o.accountId,
    accessKeyId: o.accessKeyId,
    secretAccessKey: o.secretAccessKey,
    bucket: o.bucket,
    key,
    expiresIn: PRESIGN_TTL,
  });

  return {
    status: 200,
    body: { mediaId, kind: type.kind, uploadUrl, storageKey: key, publicUrl, expiresIn: PRESIGN_TTL },
  };
}

/* ------------------------------------------------------------ episodes --- */

// A recording kept from a world's live station. The artist's browser records
// the session itself and sends it here like any other upload, so keeping an
// episode needs no recording server of our own. Only the world's artist, and
// only in a world where voice is on (can_host_world_voice decides both).
const MAX_EPISODE_BYTES = 200 * 1024 * 1024;
const EPISODE_TYPES: Record<string, string> = {
  "audio/webm": "webm",
  "audio/ogg": "ogg",
  "audio/mp4": "m4a",
  "audio/mpeg": "mp3",
};

async function presignEpisode(o: {
  // deno-lint-ignore no-explicit-any
  db: any;
  // deno-lint-ignore no-explicit-any
  asUser: any;
  userId: string;
  worldSlug: string;
  sessionId: string | null;
  title: string;
  fileName: string;
  contentType: string;
  fileBytes: number;
  accountId: string;
  accessKeyId: string;
  secretAccessKey: string;
  bucket: string;
  publicBase: string;
}): Promise<{ status: number; body: unknown }> {
  if (!o.worldSlug) return { status: 400, body: { error: "Which world is this episode for?" } };

  // Asked as the person, so auth.uid() inside the check is really them.
  const { data: allowed } = await o.asUser.rpc("can_host_world_voice", { _slug: o.worldSlug });
  if (!allowed) {
    return {
      status: 403,
      body: { error: "Only this world's artist can keep episodes here, and voice is on for the first ten worlds for now." },
    };
  }

  const baseType = o.contentType.split(";")[0].trim();
  const ext = EPISODE_TYPES[baseType];
  if (!ext) return { status: 415, body: { error: "An episode can be WebM, Ogg, M4A or MP3 audio." } };
  if (!Number.isFinite(o.fileBytes) || o.fileBytes <= 0 || o.fileBytes > MAX_EPISODE_BYTES) {
    return { status: 413, body: { error: `An episode must be under ${MAX_EPISODE_BYTES / (1024 * 1024)} MB.` } };
  }

  const { data: world } = await o.db.from("worlds").select("id").eq("slug", o.worldSlug).maybeSingle();
  const episodeId = crypto.randomUUID();
  const key = [
    "episodes",
    o.userId,
    episodeId,
    `${slugify(o.fileName.replace(/\.[^.]+$/, ""), "episode")}.${ext}`,
  ].join("/");
  const publicUrl = `${o.publicBase}/${key}`;

  // Unpublished until the recording is really in storage and the artist keeps it.
  const { error: insertErr } = await o.db.from("world_episodes").insert({
    id: episodeId,
    world_slug: o.worldSlug,
    world_id: (world as { id?: string } | null)?.id ?? null,
    session_id: o.sessionId,
    host_id: o.userId,
    title: o.title || "",
    storage_key: key,
    audio_url: publicUrl,
    mime_type: baseType,
    bytes: Math.round(o.fileBytes),
    is_published: false,
  });
  if (insertErr) {
    console.error("upload-url could not reserve world_episodes:", insertErr);
    return { status: 500, body: { error: "Could not start the upload. Try again." } };
  }

  const uploadUrl = await presignPut({
    accountId: o.accountId,
    accessKeyId: o.accessKeyId,
    secretAccessKey: o.secretAccessKey,
    bucket: o.bucket,
    key,
    expiresIn: PRESIGN_TTL,
  });

  return { status: 200, body: { episodeId, uploadUrl, storageKey: key, publicUrl, expiresIn: PRESIGN_TTL } };
}

/* ------------------------------------------------- AWS SigV4 presign --- */

const enc = new TextEncoder();

async function hmac(key: ArrayBuffer | Uint8Array, msg: string): Promise<ArrayBuffer> {
  const k = await crypto.subtle.importKey(
    "raw",
    key instanceof Uint8Array ? key : new Uint8Array(key),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  return crypto.subtle.sign("HMAC", k, enc.encode(msg));
}

async function sha256Hex(msg: string): Promise<string> {
  const buf = await crypto.subtle.digest("SHA-256", enc.encode(msg));
  return hex(buf);
}

function hex(buf: ArrayBuffer): string {
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

/** RFC 3986 encoding. S3 canonical requests do NOT encode the path slashes. */
function uriEncode(value: string, encodeSlash = true): string {
  let out = "";
  for (const ch of value) {
    if (/[A-Za-z0-9\-._~]/.test(ch)) {
      out += ch;
    } else if (ch === "/") {
      out += encodeSlash ? "%2F" : "/";
    } else {
      for (const byte of enc.encode(ch)) {
        out += "%" + byte.toString(16).toUpperCase().padStart(2, "0");
      }
    }
  }
  return out;
}

/**
 * Query-string presigned PUT for an S3-compatible endpoint (R2). Nothing is
 * signed but the host header, and the payload is UNSIGNED-PAYLOAD, so the
 * browser can stream the file without knowing its hash up front.
 */
async function presignPut(opts: {
  accountId: string;
  accessKeyId: string;
  secretAccessKey: string;
  bucket: string;
  key: string;
  expiresIn: number;
}): Promise<string> {
  const host = `${opts.accountId}.r2.cloudflarestorage.com`;
  const region = "auto";
  const service = "s3";

  const now = new Date();
  const amzDate = now.toISOString().replace(/[:-]|\.\d{3}/g, "");   // 20260821T101530Z
  const dateStamp = amzDate.slice(0, 8);

  const credentialScope = `${dateStamp}/${region}/${service}/aws4_request`;
  const canonicalUri = `/${opts.bucket}/${uriEncode(opts.key, false)}`;

  const params: Array<[string, string]> = [
    ["X-Amz-Algorithm", "AWS4-HMAC-SHA256"],
    ["X-Amz-Credential", `${opts.accessKeyId}/${credentialScope}`],
    ["X-Amz-Date", amzDate],
    ["X-Amz-Expires", String(opts.expiresIn)],
    ["X-Amz-SignedHeaders", "host"],
  ];
  params.sort((a, b) => (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0));
  const canonicalQuery = params
    .map(([k, v]) => `${uriEncode(k)}=${uriEncode(v)}`)
    .join("&");

  const canonicalRequest = [
    "PUT",
    canonicalUri,
    canonicalQuery,
    `host:${host}\n`,
    "host",
    "UNSIGNED-PAYLOAD",
  ].join("\n");

  const stringToSign = [
    "AWS4-HMAC-SHA256",
    amzDate,
    credentialScope,
    await sha256Hex(canonicalRequest),
  ].join("\n");

  const kDate = await hmac(enc.encode(`AWS4${opts.secretAccessKey}`), dateStamp);
  const kRegion = await hmac(kDate, region);
  const kService = await hmac(kRegion, service);
  const kSigning = await hmac(kService, "aws4_request");
  const signature = hex(await hmac(kSigning, stringToSign));

  return `https://${host}${canonicalUri}?${canonicalQuery}&X-Amz-Signature=${signature}`;
}

/* ------------------------------------------------------------ helpers --- */

/** Filesystem-safe, ASCII, never empty. The artist's title is kept in the DB. */
function slugify(value: string, fallback: string): string {
  const s = value
    .normalize("NFKD")
    .replace(/[^\w\s.-]/g, "")
    .trim()
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^[-.]+|[-.]+$/g, "")
    .toLowerCase()
    .slice(0, 60);
  return s || fallback;
}

function str(v: unknown, max: number): string {
  return typeof v === "string" ? v.trim().slice(0, max) : "";
}

/* --------------------------------------------------------------- main --- */

Deno.serve(async (req) => {
  const origin = req.headers.get("origin");
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsFor(origin) });
  if (req.method !== "POST") {
    return new Response("Method Not Allowed", { status: 405, headers: corsFor(origin) });
  }

  const accountId = Deno.env.get("R2_ACCOUNT_ID");
  const accessKeyId = Deno.env.get("R2_ACCESS_KEY_ID");
  const secretAccessKey = Deno.env.get("R2_SECRET_ACCESS_KEY");
  const bucket = Deno.env.get("R2_UPLOAD_BUCKET");
  const publicBase = (Deno.env.get("R2_PUBLIC_BASE_URL") ?? "").replace(/\/+$/, "");

  // Name the ones that are actually missing. "Set these five" is useless when
  // four are already right, and secret NAMES are not secrets.
  const missing = [
    ["R2_ACCOUNT_ID", accountId],
    ["R2_ACCESS_KEY_ID", accessKeyId],
    ["R2_SECRET_ACCESS_KEY", secretAccessKey],
    ["R2_UPLOAD_BUCKET", bucket],
    ["R2_PUBLIC_BASE_URL", publicBase],
  ].filter(([, v]) => !v).map(([k]) => k);

  if (missing.length) {
    return json(origin, {
      error: `Uploads are not configured yet. Missing: ${missing.join(", ")}.`,
      missing,
    }, 503);
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

  // Who is asking. verify_jwt is on, but we still need the user id.
  const authHeader = req.headers.get("Authorization") ?? "";
  const asUser = createClient(supabaseUrl, Deno.env.get("SUPABASE_ANON_KEY")!, {
    global: { headers: { Authorization: authHeader } },
  });
  const { data: userData, error: userErr } = await asUser.auth.getUser();
  const user = userData?.user;
  if (userErr || !user) return json(origin, { error: "Sign in to upload." }, 401);

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return json(origin, { error: "Bad request." }, 400);
  }

  const title = str(body.title, 120);
  const artistName = str(body.artistName, 120);
  const fileName = str(body.fileName, 200);
  const contentType = str(body.contentType, 100).toLowerCase();
  const genre = str(body.genre, 60) || null;
  const fileBytes = Number(body.fileBytes);

  /* ---------------------------------------------------------- episodes --- */

  // purpose: 'episode' is a recording kept from a world's live station. It
  // lands in world_episodes, and only the world's own artist may send one.
  if (str(body.purpose, 20) === "episode") {
    const sessionId = str(body.sessionId, 40);
    const episode = await presignEpisode({
      db: createClient(supabaseUrl, serviceKey, { auth: { persistSession: false } }),
      asUser,
      userId: user.id,
      worldSlug: str(body.worldSlug, 80),
      sessionId: /^[0-9a-f-]{36}$/i.test(sessionId) ? sessionId : null,
      title,
      fileName,
      contentType,
      fileBytes,
      accountId: accountId!,
      accessKeyId: accessKeyId!,
      secretAccessKey: secretAccessKey!,
      bucket: bucket!,
      publicBase,
    });
    return json(origin, episode.body, episode.status);
  }

  /* ------------------------------------------------------- visual work --- */

  // purpose: 'visual' takes the same road as a song and stops at a different
  // door. Artwork, photographs and video ride the identical presigned PUT into
  // the identical bucket, and land in artist_media instead of songs.
  //
  // No wallet is asked for here either. Coining a piece on Zora is a separate
  // act the artist takes later from their own wallet, so uploading stays free
  // and open to anyone with an account.
  if (str(body.purpose, 20) === "visual") {
    const visual = await presignVisual({
      db: createClient(supabaseUrl, serviceKey, { auth: { persistSession: false } }),
      userId: user.id,
      title,
      caption: str(body.caption, 500) || null,
      fileName,
      contentType,
      fileBytes,
      accountId: accountId!,
      accessKeyId: accessKeyId!,
      secretAccessKey: secretAccessKey!,
      bucket: bucket!,
      publicBase,
    });
    return json(origin, visual.body, visual.status);
  }

  if (!title) return json(origin, { error: "Give the track a title." }, 400);
  if (!artistName) return json(origin, { error: "Tell us the artist name." }, 400);

  const ext = ALLOWED_TYPES[contentType];
  if (!ext) {
    return json(origin, {
      error: "Send a WAV or an MP3. Those are the two the audition can listen to properly.",
    }, 415);
  }
  if (!Number.isFinite(fileBytes) || fileBytes < MIN_BYTES || fileBytes > MAX_BYTES) {
    return json(origin, {
      error: `Audio must be between ${Math.round(MIN_BYTES / 1024)} KB and ${MAX_BYTES / (1024 * 1024)} MB.`,
    }, 413);
  }

  // Cover art is optional, but if they sent one it has to be sane before we
  // create anything.
  const coverType = str(body.coverContentType, 100).toLowerCase();
  const coverBytes = Number(body.coverBytes);
  let coverExt: string | null = null;
  if (coverType) {
    coverExt = COVER_TYPES[coverType] ?? null;
    if (!coverExt) {
      return json(origin, { error: "Cover art must be a JPG, PNG or WEBP." }, 415);
    }
    if (!Number.isFinite(coverBytes) || coverBytes <= 0 || coverBytes > MAX_COVER_BYTES) {
      return json(origin, {
        error: `Cover art must be under ${MAX_COVER_BYTES / (1024 * 1024)} MB.`,
      }, 413);
    }
  }

  const db = createClient(supabaseUrl, serviceKey, { auth: { persistSession: false } });

  // NO DAILY TRACK LIMIT (founder, 13 Sep 2026). There used to be a cap of a
  // handful of tracks per artist per 24 hours here, and it turned real artists
  // away mid-release: a ten-track volume could not go up in one sitting. An
  // artist account is granted, not self-declared, so the abuse it guarded
  // against is already gated upstream. Artists upload as many songs as they
  // want, whenever they want. Size limits above still apply per file.

  // Which artist do these releases belong to?
  //
  // This matters more than it looks: usePublishedCatalog filters on
  // `.not('artist_id', 'is', null)`, so a song with no artist_id is invisible
  // everywhere in the app no matter what its status says. Leaving it null would
  // mean an artist uploads, passes the audition, is told they are live, and
  // nobody can ever find the track.
  //
  // If they own a claimed catalog page, releases go to that page. Otherwise
  // they get a stable id of their own; usePublishedCatalog builds an artist
  // entry for any id it does not already know, so their page appears by itself.
  const { data: account } = await db
    .from("artist_accounts")
    .select("artist_id")
    .eq("user_id", user.id)
    .maybeSingle();

  const existingArtistId = (account as { artist_id?: string } | null)?.artist_id ?? null;
  const artistId = existingArtistId as string;

  // ARTISTS ONLY. An artist account is a row in artist_accounts: granted from
  // Admin > Claims for an existing page, or opened by the person themselves
  // (become_artist, one tap from onboarding, the Studio door or their profile)
  // for a page of their own. Pressing Upload never creates one. Without the
  // row nothing is written, and the songs insert policy refuses them as well.
  if (!existingArtistId) {
    return json(origin, {
      error: "The Studio is for artist accounts. Open your profile and tap Switch to artist account; it takes one tap and this account becomes your artist account right now.",
    }, 403);
  }

  // Their own profile picture doubles as the artist image on that page.
  const { data: profile } = await db
    .from("audience_profiles")
    .select("profile_picture_url, avatar_url, location")
    .eq("user_id", user.id)
    .maybeSingle();
  const prof = profile as
    | { profile_picture_url?: string | null; avatar_url?: string | null; location?: string | null }
    | null;

  // Reserve the row first so the storage key is ours to choose, not the
  // client's. status 'uploading' keeps it invisible everywhere until the
  // audition moves it on.
  const songId = crypto.randomUUID();
  const key = [
    "uploads",
    user.id,
    songId,
    `${slugify(fileName.replace(/\.[^.]+$/, ""), "track")}.${ext}`,
  ].join("/");

  const { error: insertErr } = await db.from("songs").insert({
    id: songId,
    title,
    artist_name: artistName,
    genre,
    artist_id: artistId,
    artist_image_url: prof?.profile_picture_url ?? prof?.avatar_url ?? null,
    town_square: prof?.location ?? null,
    owner_id: user.id,
    status: "uploading",
    storage_key: key,
    file_bytes: Math.round(fileBytes),
    audio_url: `${publicBase}/${key}`,
    // Left null on purpose. The browser sets it only after the cover actually
    // lands in the bucket, so we never point at artwork that was not uploaded.
    cover_art_url: null,
  });
  if (insertErr) {
    console.error("upload-url insert failed:", insertErr);
    return json(origin, { error: "Could not start the upload. Try again." }, 500);
  }

  const uploadUrl = await presignPut({
    accountId, accessKeyId, secretAccessKey, bucket, key, expiresIn: PRESIGN_TTL,
  });

  // Optional second door, for the artwork. Validated up front, before the row
  // exists, so a bad cover can never leave an orphaned song behind.
  let coverUploadUrl: string | null = null;
  let coverPublicUrl: string | null = null;
  if (coverExt) {
    const coverKey = ["uploads", user.id, songId, `cover.${coverExt}`].join("/");
    coverUploadUrl = await presignPut({
      accountId, accessKeyId, secretAccessKey, bucket, key: coverKey, expiresIn: PRESIGN_TTL,
    });
    coverPublicUrl = `${publicBase}/${coverKey}`;
  }

  return json(origin, {
    songId,
    uploadUrl,
    storageKey: key,
    publicUrl: `${publicBase}/${key}`,
    coverUploadUrl,
    coverPublicUrl,
    expiresIn: PRESIGN_TTL,
  });
});
