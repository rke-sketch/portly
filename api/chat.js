// Portly proxy on Vercel (US region) + 프롬프트 캐싱 (비스트리밍)
const MODEL = "claude-haiku-4-5-20251001"; // 품질 더 원하면 "claude-sonnet-4-6"

export default async function handler(req, res) {
  // CORS: 로컬 파일/다른 출처(QA 시뮬레이터 등)에서도 호출 허용
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
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
    if (!r.ok) {
      res.status(r.status).json({
        error: (data.error && data.error.message) || ("HTTP " + r.status),
        raw: data
      });
      return;
    }
    const text = data && data.content && data.content[0] && data.content[0].text ? data.content[0].text : "";
    if (!text) { res.status(502).json({ error: "no_text", raw: data }); return; }
    res.status(200).json({ text });
  } catch (e) {
    res.status(500).json({ error: String(e) });
  }
}
