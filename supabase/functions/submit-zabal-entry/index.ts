import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const NOTIFY_TO = ["songchaindao@gmail.com", "music.imanafrikah@gmail.com"];
// MO$HA service account (created in migration mosha_service_account) —
// authors the auto feed post announcing each entry.
const MOSHA_USER_ID = "0e2f6d3a-8b1c-4f7e-9a5d-3c4b2a1f0e9d";

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

const isHttpUrl = (value: unknown): value is string =>
  typeof value === "string" && /^https?:\/\/\S+$/i.test(value.trim());

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { artistName, contactEmail, verseAudioUrl, tiktokUrl } = await req.json();

    if (typeof artistName !== "string" || !artistName.trim()) {
      return new Response(
        JSON.stringify({ error: "Please add your artist name" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const cleanAudio = isHttpUrl(verseAudioUrl) ? verseAudioUrl.trim() : null;
    const cleanTiktok = isHttpUrl(tiktokUrl) ? tiktokUrl.trim() : null;

    if (!cleanAudio && !cleanTiktok) {
      return new Response(
        JSON.stringify({ error: "Upload your verse or drop a TikTok video link" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const cleanEmail = typeof contactEmail === "string" && contactEmail.trim()
      ? contactEmail.trim()
      : null;

    const admin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
      { auth: { persistSession: false } },
    );

    // Persist first so entries are never lost even if the email fails.
    const { data: inserted, error: insertErr } = await admin
      .from("zabal_gamez_entries")
      .insert({
        artist_name: artistName.trim(),
        contact_email: cleanEmail,
        verse_audio_url: cleanAudio,
        tiktok_url: cleanTiktok,
      })
      .select()
      .single();

    if (insertErr) {
      console.error("Failed to persist zabal gamez entry:", insertErr);
      return new Response(
        JSON.stringify({ error: "Could not save your entry" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    // MO$HA announces the entry on the feed (best effort — entry already saved).
    try {
      const { error: postErr } = await admin.from("social_posts").insert({
        user_id: MOSHA_USER_ID,
        post_type: "text",
        content: `${artistName.trim()} just submitted for Zabal Gamez! Grab the cypher beat on the About page and enter the Musician Track.`,
        metadata: {
          source: "zabal_gamez",
          entry_id: inserted?.id ?? null,
          ...(cleanAudio ? { verse_audio_url: cleanAudio } : {}),
          ...(cleanTiktok ? { tiktok_url: cleanTiktok } : {}),
        },
        visibility: "public",
      });
      if (postErr) console.error("MO$HA feed post failed:", postErr);
    } catch (postErr) {
      console.error("MO$HA feed post failed:", postErr);
    }

    // Fire the notification email (best effort — the row is already saved).
    const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY");
    if (RESEND_API_KEY) {
      try {
        // Running totals for the notification
        const [{ count: totalEntries }, { count: totalDownloads }] = await Promise.all([
          admin.from("zabal_gamez_entries").select("id", { count: "exact", head: true }),
          admin.from("zabal_gamez_beat_downloads").select("id", { count: "exact", head: true }),
        ]);
        let fromAddress = "$ongChainn Zabal Gamez <onboarding@resend.dev>";
        try {
          const domainsRes = await fetch("https://api.resend.com/domains", {
            headers: { Authorization: `Bearer ${RESEND_API_KEY}` },
          });
          if (domainsRes.ok) {
            const domainsBody = await domainsRes.json();
            const list = Array.isArray(domainsBody?.data) ? domainsBody.data : [];
            const verified = list.find((d: { status?: string; name?: string }) =>
              d?.status === "verified" && typeof d?.name === "string"
            );
            if (verified) {
              fromAddress = `$ongChainn Zabal Gamez <submissions@${verified.name}>`;
            }
          }
        } catch (_e) { /* fall back to sandbox sender */ }

        const safeArtist = escapeHtml(artistName.trim());
        const safeEmail = cleanEmail ? escapeHtml(cleanEmail) : null;

        await fetch("https://api.resend.com/emails", {
          method: "POST",
          headers: {
            Authorization: `Bearer ${RESEND_API_KEY}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            from: fromAddress,
            to: NOTIFY_TO,
            reply_to: cleanEmail ?? undefined,
            subject: `New Zabal Gamez entry: ${artistName.trim()} (entry #${totalEntries ?? "?"})`,
            text: `New Zabal Gamez musician-track entry\n\nArtist: ${artistName.trim()}\n${cleanEmail ? `Contact: ${cleanEmail}\n` : ""}${cleanAudio ? `Verse audio: ${cleanAudio}\n` : ""}${cleanTiktok ? `TikTok video: ${cleanTiktok}\n` : ""}\nTotals so far:\n- Entries: ${totalEntries ?? "unknown"}\n- Beat downloads: ${totalDownloads ?? "unknown"}\n\nThis entry is now live on the Zabal Gamez wall on $ongChainn.`,
            html: `
              <h2>New Zabal Gamez entry</h2>
              <p><strong>Artist:</strong> ${safeArtist}</p>
              ${safeEmail ? `<p><strong>Contact:</strong> ${safeEmail}</p>` : ""}
              ${cleanAudio ? `<p><strong>Verse audio:</strong> <a href="${cleanAudio}">Download / listen</a></p>` : ""}
              ${cleanTiktok ? `<p><strong>TikTok video:</strong> <a href="${cleanTiktok}">${escapeHtml(cleanTiktok)}</a></p>` : ""}
              <p><strong>Totals so far:</strong> ${totalEntries ?? "?"} entries &middot; ${totalDownloads ?? "?"} beat downloads</p>
              <p style="color:#888;font-size:12px;">This entry is now live on the Zabal Gamez wall on $ongChainn.</p>
            `,
          }),
        });
      } catch (mailErr) {
        console.error("Zabal Gamez notify email failed:", mailErr);
      }
    } else {
      console.error("RESEND_API_KEY not configured — entry saved, no email sent");
    }

    return new Response(
      JSON.stringify({ success: true, entry: inserted }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (error) {
    console.error("submit-zabal-entry error:", error);
    return new Response(
      JSON.stringify({ error: "Unexpected error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});
