import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const NOTIFY_TO = "songchaindao@gmail.com";
const SIGNED_URL_TTL_SECONDS = 60 * 60 * 24 * 30;

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

serve(async (req) => {
  try {
    const { applicationId } = await req.json();
    if (typeof applicationId !== "string" || !applicationId.trim()) {
      return new Response(JSON.stringify({ error: "applicationId required" }), { status: 400 });
    }

    const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY");
    if (!RESEND_API_KEY) {
      return new Response(JSON.stringify({ error: "RESEND_API_KEY not configured" }), { status: 503 });
    }

    const admin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
      { auth: { persistSession: false } },
    );

    const { data: app, error: appErr } = await admin
      .from("artist_applications")
      .select("*")
      .eq("id", applicationId.trim())
      .single();
    if (appErr || !app) {
      return new Response(JSON.stringify({ error: "Application not found", detail: appErr?.message }), { status: 404 });
    }

    // Prefer a verified Resend domain over the sandbox sender for inbox placement
    let fromAddress = "$ongChainn Artist Submissions <onboarding@resend.dev>";
    let verifiedDomain: string | null = null;
    try {
      const domainsRes = await fetch("https://api.resend.com/domains", {
        headers: { Authorization: `Bearer ${RESEND_API_KEY}` },
      });
      if (domainsRes.ok) {
        const domainsBody = await domainsRes.json();
        const list = Array.isArray(domainsBody?.data) ? domainsBody.data : [];
        const verified = list.find((d: any) => d?.status === "verified" && typeof d?.name === "string");
        if (verified) {
          verifiedDomain = verified.name;
          fromAddress = `$ongChainn Artist Submissions <submissions@${verified.name}>`;
        }
      }
    } catch (_e) { /* fall back to sandbox sender */ }

    const songs = Array.isArray(app.songs) ? app.songs : [];
    const songsWithLinks = await Promise.all(songs.map(async (song: any) => {
      const { data: audioSigned } = await admin.storage
        .from("artist-uploads")
        .createSignedUrl(String(song.audio_path || ""), SIGNED_URL_TTL_SECONDS);
      let coverUrl: string | null = null;
      if (song.cover_path) {
        const { data: coverSigned } = await admin.storage
          .from("artist-uploads")
          .createSignedUrl(String(song.cover_path), SIGNED_URL_TTL_SECONDS);
        coverUrl = coverSigned?.signedUrl ?? null;
      }
      return { title: String(song.title || "Untitled"), audioUrl: audioSigned?.signedUrl ?? null, coverUrl };
    }));

    const safeRealName = escapeHtml(String(app.real_name || ""));
    const safeArtistName = escapeHtml(String(app.artist_name || ""));
    const safeLocation = escapeHtml(String(app.location || ""));
    const safeReason = escapeHtml(String(app.reason || "")).replace(/\n/g, "<br/>");
    const safeWallet = escapeHtml(String(app.wallet_address || ""));
    const safeContactEmail = app.contact_email ? escapeHtml(String(app.contact_email)) : null;

    const songsHtml = songsWithLinks.map((song) => `
      <li style="margin-bottom:8px;">
        <strong>${escapeHtml(song.title)}</strong><br/>
        ${song.audioUrl ? `<a href="${song.audioUrl}">Download audio</a>` : "(audio link unavailable)"}
        ${song.coverUrl ? ` &middot; <a href="${song.coverUrl}">Cover art</a>` : ""}
      </li>
    `).join("");

    const songsText = songsWithLinks.map((song) =>
      `- ${song.title}\n  Audio: ${song.audioUrl ?? "unavailable"}${song.coverUrl ? `\n  Cover: ${song.coverUrl}` : ""}`
    ).join("\n");

    const emailResponse = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${RESEND_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: fromAddress,
        to: [NOTIFY_TO],
        reply_to: app.contact_email || undefined,
        subject: `New artist submission: ${String(app.artist_name || "")} (${songs.length} song${songs.length === 1 ? "" : "s"})`,
        text: `New artist submission\n\nReal name: ${String(app.real_name || "")}\nArtist name: ${String(app.artist_name || "")}\nLocation: ${String(app.location || "")}\n${app.contact_email ? `Contact email: ${app.contact_email}\n` : ""}Wallet: ${String(app.wallet_address || "")}\n\nWhy:\n${String(app.reason || "")}\n\nSongs (${songs.length}):\n${songsText}\n\nDownload links expire in 30 days.`,
        html: `
          <h2>New artist submission</h2>
          <p><strong>Real name:</strong> ${safeRealName}</p>
          <p><strong>Artist name:</strong> ${safeArtistName}</p>
          <p><strong>Location:</strong> ${safeLocation}</p>
          ${safeContactEmail ? `<p><strong>Contact email:</strong> ${safeContactEmail}</p>` : ""}
          <p><strong>Preferred wallet address:</strong> ${safeWallet}</p>
          <p><strong>Why they want to be on $ongChainn:</strong></p>
          <p>${safeReason}</p>
          <p><strong>Songs (${songs.length}):</strong></p>
          <ul>${songsHtml}</ul>
          <p style="color:#888;font-size:12px;">Download links expire in 30 days. This is a resend of application ${escapeHtml(applicationId)}.</p>
        `,
      }),
    });

    const resendBody = await emailResponse.text();
    return new Response(
      JSON.stringify({
        ok: emailResponse.ok,
        resendStatus: emailResponse.status,
        resendBody,
        fromAddress,
        verifiedDomain,
      }),
      { status: emailResponse.ok ? 200 : 502, headers: { "Content-Type": "application/json" } },
    );
  } catch (error) {
    return new Response(JSON.stringify({ error: String(error) }), { status: 500 });
  }
});
