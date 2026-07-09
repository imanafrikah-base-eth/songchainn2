import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const NOTIFY_TO = "songchaindao@gmail.com";
const MAX_SONGS = 7;
const SIGNED_URL_TTL_SECONDS = 60 * 60 * 24 * 30; // 30 days

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

interface CleanSong {
  title: string;
  audioPath: string;
  coverPath: string | null;
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { realName, artistName, location, reason, contactEmail, walletAddress, songs } = await req.json();

    if (
      typeof realName !== "string" || !realName.trim() ||
      typeof artistName !== "string" || !artistName.trim() ||
      typeof location !== "string" || !location.trim() ||
      typeof reason !== "string" || !reason.trim() ||
      typeof walletAddress !== "string" || !walletAddress.trim()
    ) {
      return new Response(
        JSON.stringify({ error: "Missing required fields" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    if (!Array.isArray(songs) || songs.length === 0 || songs.length > MAX_SONGS) {
      return new Response(
        JSON.stringify({ error: `Please attach between 1 and ${MAX_SONGS} songs` }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const cleanSongs: CleanSong[] = [];
    for (const song of songs) {
      if (
        !song || typeof song !== "object" ||
        typeof song.title !== "string" || !song.title.trim() ||
        typeof song.audioPath !== "string" || !song.audioPath.trim()
      ) {
        return new Response(
          JSON.stringify({ error: "Each song needs a title and an uploaded audio file" }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
        );
      }
      cleanSongs.push({
        title: song.title.trim(),
        audioPath: song.audioPath.trim(),
        coverPath: typeof song.coverPath === "string" && song.coverPath.trim() ? song.coverPath.trim() : null,
      });
    }

    const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY");
    if (!RESEND_API_KEY) {
      console.error("RESEND_API_KEY not configured");
      return new Response(
        JSON.stringify({ error: "Submissions are temporarily unavailable" }),
        { status: 503, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const admin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
      { auth: { persistSession: false } },
    );

    const { error: insertErr } = await admin.from("artist_applications").insert({
      real_name: realName.trim(),
      artist_name: artistName.trim(),
      location: location.trim(),
      reason: reason.trim(),
      contact_email: typeof contactEmail === "string" && contactEmail.trim() ? contactEmail.trim() : null,
      wallet_address: walletAddress.trim(),
      songs: cleanSongs.map((s) => ({
        title: s.title,
        audio_path: s.audioPath,
        cover_path: s.coverPath,
        status: "pending",
      })),
    });
    if (insertErr) {
      console.error("Failed to persist artist application:", insertErr);
    }

    const songsWithLinks = await Promise.all(cleanSongs.map(async (song) => {
      const { data: audioSigned, error: audioErr } = await admin.storage
        .from("artist-uploads")
        .createSignedUrl(song.audioPath, SIGNED_URL_TTL_SECONDS);
      if (audioErr || !audioSigned) throw audioErr ?? new Error("Failed to sign audio URL");

      let coverUrl: string | null = null;
      if (song.coverPath) {
        const { data: coverSigned } = await admin.storage
          .from("artist-uploads")
          .createSignedUrl(song.coverPath, SIGNED_URL_TTL_SECONDS);
        coverUrl = coverSigned?.signedUrl ?? null;
      }

      return { title: song.title, audioUrl: audioSigned.signedUrl, coverUrl };
    }));

    const safeRealName = escapeHtml(realName.trim());
    const safeArtistName = escapeHtml(artistName.trim());
    const safeLocation = escapeHtml(location.trim());
    const safeReason = escapeHtml(reason.trim()).replace(/\n/g, "<br/>");
    const safeWallet = escapeHtml(walletAddress.trim());
    const safeContactEmail = typeof contactEmail === "string" && contactEmail.trim()
      ? escapeHtml(contactEmail.trim())
      : null;

    const songsHtml = songsWithLinks.map((song) => `
      <li style="margin-bottom:8px;">
        <strong>${escapeHtml(song.title)}</strong><br/>
        <a href="${song.audioUrl}">Download audio</a>
        ${song.coverUrl ? ` &middot; <a href="${song.coverUrl}">Cover art</a>` : ""}
      </li>
    `).join("");

    const emailResponse = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${RESEND_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: "$ongChainn Artist Submissions <onboarding@resend.dev>",
        to: [NOTIFY_TO],
        reply_to: safeContactEmail ? contactEmail.trim() : undefined,
        subject: `New artist submission: ${artistName.trim()} (${cleanSongs.length} song${cleanSongs.length === 1 ? "" : "s"})`,
        html: `
          <h2>New artist submission</h2>
          <p><strong>Real name:</strong> ${safeRealName}</p>
          <p><strong>Artist name:</strong> ${safeArtistName}</p>
          <p><strong>Location:</strong> ${safeLocation}</p>
          ${safeContactEmail ? `<p><strong>Contact email:</strong> ${safeContactEmail}</p>` : ""}
          <p><strong>Preferred wallet address:</strong> ${safeWallet}</p>
          <p><strong>Why they want to be on $ongChainn:</strong></p>
          <p>${safeReason}</p>
          <p><strong>Songs (${cleanSongs.length}):</strong></p>
          <ul>${songsHtml}</ul>
          <p style="color:#888;font-size:12px;">Download links expire in 30 days.</p>
        `,
      }),
    });

    if (!emailResponse.ok) {
      const errBody = await emailResponse.text();
      console.error("Resend error:", emailResponse.status, errBody);
      return new Response(
        JSON.stringify({ error: "Could not send submission" }),
        { status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    return new Response(
      JSON.stringify({ success: true }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (error) {
    console.error("submit-artist-application error:", error);
    return new Response(
      JSON.stringify({ error: "Unexpected error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});
