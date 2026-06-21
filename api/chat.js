// Portly proxy on Vercel (US region → Anthropic 403 회피) + 프롬프트 캐싱
const MODEL = "claude-sonnet-4-6"; // 비용 줄이려면 "claude-haiku-4-5"

export default async function handler(req, res) {
  if (req.method === "OPTIONS") { res.status(200).end(); return; }
  if (req.method !== "POST") { res.status(405).json({ error: "POST only" }); return; }
  try {
    const { system, mode, from, messages } = req.body || {};
    const sysBlocks = [
      { type: "text", text: system || "", cache_control: { type: "ephemeral" } },
      { type: "text", text: "[MODE: " + (mode || "-") + "]\n[FROM: " + (from || "-") + "]" }
    ];
    const msgs = (messages || []).map(m => ({
      role: m.role === "model" ? "assistant" : "user",
      content: m.text || ""
    }));
    const r = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-api-key": process.env.ANTHROPIC_KEY,
        "anthropic-version": "2023-06-01"
      },
      body: JSON.stringify({ model: MODEL, max_tokens: 2048, system: sysBlocks, messages: msgs })
    });
    const data = await r.json();
    const text = data && data.content && data.content[0] && data.content[0].text ? data.content[0].text : "";
    if (!text) { res.status(502).json({ error: "no_text", raw: data }); return; }
    res.status(200).json({ text });
  } catch (e) {
    res.status(500).json({ error: String(e) });
  }
}
