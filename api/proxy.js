/**
 * Vercel Serverless Function — TASE API proxy
 * Called via rewrite: /api/tase/:path* → /api/proxy?p=:path*
 */
export default async function handler(req, res) {
  try {
    const p   = Array.isArray(req.query.p) ? req.query.p.join('/') : (req.query.p ?? '')
    const qs  = new URLSearchParams()

    for (const [key, val] of Object.entries(req.query)) {
      if (key === 'p') continue
      Array.isArray(val) ? val.forEach((v) => qs.append(key, v)) : qs.append(key, String(val))
    }

    const targetUrl = `https://api.tase.co.il/api/${p}${qs.toString() ? `?${qs}` : ''}`

    const opts = {
      method:  req.method ?? 'GET',
      headers: {
        'Content-Type':   'application/json',
        'Referer':         'https://www.tase.co.il/',
        'User-Agent':      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept':          'application/json, text/plain, */*',
        'Accept-Language': 'he-IL,he;q=0.9,en;q=0.8',
        'Cache-Control':   'no-cache',
      },
    }

    if (['POST', 'PUT'].includes(req.method) && req.body) {
      opts.body = typeof req.body === 'string' ? req.body : JSON.stringify(req.body)
    }

    const upstream = await fetch(targetUrl, opts)

    if (!upstream.ok) {
      const text = await upstream.text().catch(() => '')
      return res.status(upstream.status).json({ error: `TASE_${upstream.status}`, body: text.slice(0, 300) })
    }

    const data = await upstream.json()
    res.setHeader('Access-Control-Allow-Origin', '*')
    res.setHeader('Cache-Control', 'no-store')
    return res.status(200).json(data)

  } catch (err) {
    console.error('[proxy]', err)
    return res.status(502).json({ error: 'proxy_error', details: String(err) })
  }
}
