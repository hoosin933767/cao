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
  // 删除 URL 末尾的 /
  const baseUrl = KV_URL ? KV_URL.replace(/\/+$/, "") : "";
  const resp = await fetch(baseUrl, {
    method: "POST",
    headers: {
      Authorization: "Bearer " + KV_TOKEN,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ command: method, args }),
  });
  if (!resp.ok) {
    const errText = await resp.text();
    return { error: true, status: resp.status, text: errText.slice(0, 200) };
  }
  return resp.json();
}

export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") return res.status(200).end();

  if (req.method === "POST") {
    const { handle, name } = req.body || {};
    if (!handle) return res.json({ ok: false, error: "missing handle" });
    if (handle.length > 30) return res.json({ ok: false, error: "handle too long" });

    const normalizedHandle = handle.toLowerCase().replace(/^@/, "");
    const now = Date.now();

    const existing = await kv("GET", "supporter:" + normalizedHandle);
    if (existing && existing.error) {
      return res.json({ ok: false, error: "kv error: " + (existing.text || JSON.stringify(existing)) });
    }

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

    const setResult = await kv("SET", "supporter:" + normalizedHandle, JSON.stringify(supporter));
    if (setResult && setResult.error) {
      return res.json({ ok: false, error: "kv set error: " + (setResult.text || JSON.stringify(setResult)) });
    }

    const zaddResult = await kv("ZADD", "supporters", supporter.firstSeen, normalizedHandle);
    if (zaddResult && zaddResult.error) {
      return res.json({ ok: false, error: "kv zadd error: " + (zaddResult.text || JSON.stringify(zaddResult)) });
    }

    return res.json({ ok: true });
  }

  if (req.method === "GET") {
    const type = req.query.t;

    if (type === "stats") {
      const count = await kv("ZCARD", "supporters");
      if (count && count.error) {
        return res.json({ ok: false, error: "kv error: " + (count.text || JSON.stringify(count)) });
      }
      return res.json({ ok: true, total: count.result || 0, raw: count });
    }

    const countResp = await kv("ZCARD", "supporters");
    const handlesResp = await kv("ZREVRANGE", "supporters", 0, 199);

    if ((countResp && countResp.error) || (handlesResp && handlesResp.error)) {
      return res.json({
        ok: true,
        supporters: [],
        total: 0,
        debug: { count: countResp, handles: handlesResp },
      });
    }

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
