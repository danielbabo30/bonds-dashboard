/**
 * Vercel Serverless Function — TASE API proxy
 * Called via rewrite: /api/tase/:path* → /api/proxy?p=:path*
 */
export default async function handler(req, res) {
  // Handle CORS preflight
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,PUT,OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type')
  if (req.method === 'OPTIONS') return res.status(204).end()

  try {
    const p   = Array.isArray(req.query.p) ? req.query.p.join('/') : (req.query.p ?? '')
    const qs  = new URLSearchParams()

    for (const [key, val] of Object.entries(req.query)) {
      if (key === 'p') continue
      Array.isArray(val) ? val.forEach((v) => qs.append(key, v)) : qs.append(key, String(val))
    }

    const targetUrl = `https://api.tase.co.il/api/${p}${qs.toString() ? `?${qs}` : ''}`
    const method = req.method ?? 'GET'

    const headers = {
      'Origin':          'https://www.tase.co.il',
      'Referer':         'https://www.tase.co.il/',
      'Host':            'api.tase.co.il',
      'User-Agent':      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
      'Accept':          'application/json, text/plain, */*',
      'Accept-Language': 'he-IL,he;q=0.9,en-US;q=0.8,en;q=0.7',
      'Accept-Encoding': 'gzip, deflate, br',
      'Cache-Control':   'no-cache',
      'Pragma':          'no-cache',
      'Sec-Fetch-Dest':  'empty',
      'Sec-Fetch-Mode':  'cors',
      'Sec-Fetch-Site':  'same-site',
    }

    // Only add Content-Type for requests with a body
    if (['POST', 'PUT'].includes(method)) {
      headers['Content-Type'] = 'application/json'
    }

    const opts = { method, headers }

    if (['POST', 'PUT'].includes(method) && req.body) {
      opts.body = typeof req.body === 'string' ? req.body : JSON.stringify(req.body)
    }

    const upstream = await fetch(targetUrl, opts)

    if (!upstream.ok) {
      const text = await upstream.text().catch(() => '')
      console.error(`[proxy] TASE ${upstream.status} for ${targetUrl}:`, text.slice(0, 200))
      return res.status(upstream.status).json({ error: `TASE_${upstream.status}`, body: text.slice(0, 300) })
    }

    const data = await upstream.json()
    res.setHeader('Cache-Control', 'no-store')
    return res.status(200).json(data)

  } catch (err) {
    console.error('[proxy]', err)
    return res.status(502).json({ error: 'proxy_error', details: String(err) })
  }
}
