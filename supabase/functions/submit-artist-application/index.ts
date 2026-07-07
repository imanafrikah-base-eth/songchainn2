import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const NOTIFY_TO = "songchaindao@gmail.com";

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { realName, artistName, location, reason, contactEmail } = await req.json();

    if (
      typeof realName !== "string" || !realName.trim() ||
      typeof artistName !== "string" || !artistName.trim() ||
      typeof location !== "string" || !location.trim() ||
      typeof reason !== "string" || !reason.trim()
    ) {
      return new Response(
        JSON.stringify({ error: "Missing required fields" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY");
    if (!RESEND_API_KEY) {
      console.error("RESEND_API_KEY not configured");
      return new Response(
        JSON.stringify({ error: "Submissions are temporarily unavailable" }),
        { status: 503, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const safeRealName = escapeHtml(realName.trim());
    const safeArtistName = escapeHtml(artistName.trim());
    const safeLocation = escapeHtml(location.trim());
    const safeReason = escapeHtml(reason.trim()).replace(/\n/g, "<br/>");
    const safeContactEmail = typeof contactEmail === "string" && contactEmail.trim()
      ? escapeHtml(contactEmail.trim())
      : null;

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
        subject: `New artist submission: ${artistName.trim()}`,
        html: `
          <h2>New artist submission</h2>
          <p><strong>Real name:</strong> ${safeRealName}</p>
          <p><strong>Artist name:</strong> ${safeArtistName}</p>
          <p><strong>Location:</strong> ${safeLocation}</p>
          ${safeContactEmail ? `<p><strong>Contact email:</strong> ${safeContactEmail}</p>` : ""}
          <p><strong>Why they want to be on $ongChainn:</strong></p>
          <p>${safeReason}</p>
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
