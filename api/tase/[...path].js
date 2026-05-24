/**
 * Vercel Serverless Function — TASE API proxy
 * Routes: /api/tase/* → https://api.tase.co.il/api/*
 * Adds required Referer header to bypass TASE CORS restriction.
 */

export const config = { api: { bodyParser: true } }

export default async function handler(req, res) {
  try {
    // Build target path from catch-all segments
    const raw      = req.query.path          // array or string
    const segments = Array.isArray(raw) ? raw : raw ? [raw] : []

    // Forward all query params except the internal 'path' catch-all key
    const qs = new URLSearchParams()
    for (const [key, val] of Object.entries(req.query)) {
      if (key === 'path') continue
      if (Array.isArray(val)) val.forEach((v) => qs.append(key, v))
      else qs.append(key, String(val))
    }

    const qStr      = qs.toString()
    const targetUrl = `https://api.tase.co.il/api/${segments.join('/')}${qStr ? `?${qStr}` : ''}`

    /** @type {RequestInit} */
    const opts = {
      method:  req.method ?? 'GET',
      headers: {
        'Content-Type':  'application/json',
        'Referer':        'https://www.tase.co.il/',
        'Cache-Control':  'no-cache',
        'User-Agent':     'Mozilla/5.0',
      },
    }

    if ((req.method === 'POST' || req.method === 'PUT') && req.body) {
      opts.body = typeof req.body === 'string' ? req.body : JSON.stringify(req.body)
    }

    const upstream = await fetch(targetUrl, opts)

    if (!upstream.ok) {
      const text = await upstream.text().catch(() => '')
      return res.status(upstream.status).json({ error: `TASE ${upstream.status}`, body: text })
    }

    const data = await upstream.json()
    res.setHeader('Access-Control-Allow-Origin', '*')
    res.setHeader('Cache-Control', 'no-store')
    return res.status(200).json(data)

  } catch (err) {
    console.error('[tase-proxy] error:', err)
    return res.status(502).json({ error: 'proxy_error', details: String(err) })
  }
}
