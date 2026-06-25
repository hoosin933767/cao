/**
 * CAO 支持者 API
 *
 * POST /api/supporter  — 上报/更新支持者
 *   body: { handle, name }
 *
 * GET  /api/supporter?t=stats  — 获取总人数
 * GET  /api/supporter?t=list   — 获取支持者列表（倒序）
 */

const KV_URL = process.env.KV_REST_API_URL;
const KV_TOKEN = process.env.KV_REST_API_TOKEN;

async function kv(method, ...args) {
  const resp = await fetch(KV_URL, {
    method: "POST",
    headers: {
      Authorization: "Basic " + Buffer.from(":" + KV_TOKEN).toString("base64"),
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ command: method, args }),
  });
  return resp.json();
}

export default async function handler(req, res) {
  // CORS
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") return res.status(200).end();

  if (req.method === "POST") {
    const { handle, name } = req.body || {};
    if (!handle) return res.json({ ok: false, error: "missing handle" });
    if (handle.length > 30) return res.json({ ok: false, error: "handle too long" });

    const normalizedHandle = handle.toLowerCase().replace(/^@/, "");

    // 读取已有记录
    const existing = await kv("GET", "supporter:" + normalizedHandle);
    const now = Date.now();

    let supporter;
    if (existing && existing.result) {
      try {
        supporter = JSON.parse(existing.result);
      } catch (e) {
        supporter = { handle: normalizedHandle };
      }
      supporter.lastSeen = now;
      if (name) supporter.name = name;
    } else {
      supporter = {
        handle: normalizedHandle,
        name: name || normalizedHandle,
        firstSeen: now,
        lastSeen: now,
      };
    }

    // 写入
    await kv("SET", "supporter:" + normalizedHandle, JSON.stringify(supporter));
    await kv("ZADD", "supporters", supporter.firstSeen, normalizedHandle);

    return res.json({ ok: true });
  }

  if (req.method === "GET") {
    const type = req.query.t;

    if (type === "stats") {
      const count = await kv("ZCARD", "supporters");
      return res.json({ ok: true, total: count.result || 0 });
    }

    // 列表
    const countResp = await kv("ZCARD", "supporters");
    const handlesResp = await kv("ZREVRANGE", "supporters", 0, 199);

    const supporters = [];
    if (handlesResp && handlesResp.result) {
      for (const handle of handlesResp.result) {
        const data = await kv("GET", "supporter:" + handle);
        if (data && data.result) {
          try {
            supporters.push(JSON.parse(data.result));
          } catch (e) {}
        }
      }
    }

    return res.json({
      ok: true,
      supporters,
      total: countResp.result || 0,
    });
  }

  return res.json({ ok: false, error: "method not allowed" });
}
