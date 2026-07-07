// =====================================================================
//  n8n "Code" node (second)  ->  parse Gemini response + build email
//  Mode: "Run Once for All Items"  |  Language: JavaScript
//
//  Input:  response from the HTTP Request node (Gemini)
//  Output: 1 object with subject + html ready to email
// =====================================================================

const item = $input.first().json;

// 1) Extract the response text from Gemini's nested structure
let text;
try {
  text = item.candidates[0].content.parts[0].text;
} catch (e) {
  throw new Error("Gemini response not found in the expected structure (candidates[0].content.parts[0].text).");
}

// 2) Turn the text (JSON as string) into an object
let ai;
try {
  ai = JSON.parse(text);
} catch (e) {
  throw new Error("Gemini response is not valid JSON. Start: " + String(text).slice(0, 200));
}

// 3) Rating -> color + emoji + label
const styleByRating = {
  good:            { emoji: "🟢", color: "#1a7f37", label: "Good" },
  neutral:         { emoji: "🟡", color: "#9a6700", label: "Neutral" },
  needs_attention: { emoji: "🔴", color: "#cf222e", label: "Needs attention" },
};
const rs = styleByRating[ai.rating] || { emoji: "⚪", color: "#57606a", label: ai.rating };

// 4) Build the key-points list as dash bullets (each insight on its own line)
//    Plain <div> lines with a leading "–" are more email-client-safe than <ul>.
const points = Array.isArray(ai.key_points) ? ai.key_points : [];
const listHtml = points
  .map((p) => `<div style="margin-bottom:8px;line-height:1.5">&ndash;&nbsp;${p}</div>`)
  .join("");

// 5) Subject line
const subject = rs.emoji + " " + ai.headline;

// 6) Clean, structured HTML email
const html = `
  <div style="font-family:Arial,Helvetica,sans-serif;max-width:600px;color:#1f2328">
    <h2 style="margin:0 0 4px">${ai.headline}</h2>
    <p style="margin:0 0 16px">
      <span style="display:inline-block;padding:2px 10px;border-radius:12px;
      background:${rs.color};color:#fff;font-size:12px;font-weight:bold">
      ${rs.emoji} ${rs.label}</span>
    </p>

    <div style="margin:0 0 16px">${listHtml}</div>

    <div style="border-left:4px solid #d4a72c;background:#fff8e1;padding:10px 14px;margin:0 0 16px">
      <strong>⚠️ Watch:</strong> ${ai.watch_flag}
    </div>

    <hr style="border:none;border-top:1px solid #d0d7de;margin:16px 0">
    <p style="color:#8c959f;font-size:12px;margin:0">
      Automated briefing • Sales &amp; Margin Health Monitor
    </p>
  </div>
`;

// 7) Return ready fields (subject/html) + raw AI fields just in case
return [{ json: { subject, html, ...ai } }];
