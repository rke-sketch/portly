// Portly proxy on Vercel (US region) + 프롬프트 캐싱 + 스트리밍
const MODEL = "claude-sonnet-4-6"; // 비용 줄이려면 "claude-haiku-4-5-20251001"

export default async function handler(req, res) {
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
    const upstream = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-api-key": process.env.ANTHROPIC_KEY,
        "anthropic-version": "2023-06-01"
      },
      body: JSON.stringify({ model: MODEL, max_tokens: 4096, system: sysBlocks, messages: msgs, stream: true })
    });

    if (!upstream.ok) {
      const errData = await upstream.json().catch(() => ({}));
      res.status(upstream.status).json({
        error: (errData.error && errData.error.message) || ("HTTP " + upstream.status),
        raw: errData
      });
      return;
    }

    res.setHeader("Content-Type", "text/plain; charset=utf-8");
    res.setHeader("Cache-Control", "no-cache, no-transform");
    const reader = upstream.body.getReader();
    const decoder = new TextDecoder();
    let buf = "";
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buf += decoder.decode(value, { stream: true });
      const lines = buf.split("\n");
      buf = lines.pop();
      for (const line of lines) {
        const s = line.trim();
        if (!s.startsWith("data:")) continue;
        const payload = s.slice(5).trim();
        if (!payload || payload === "[DONE]") continue;
        try {
          const ev = JSON.parse(payload);
          if (ev.type === "content_block_delta" && ev.delta && typeof ev.delta.text === "string") {
            res.write(ev.delta.text);
          }
        } catch (e) {}
      }
    }
    res.end();
  } catch (e) {
    if (!res.headersSent) res.status(500).json({ error: String(e) });
    else { try { res.end(); } catch (_) {} }
  }
}
