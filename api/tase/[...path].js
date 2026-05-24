/**
 * Vercel Serverless Function — TASE API proxy
 *
 * Handles all requests to /api/tase/* and forwards them to
 * https://api.tase.co.il/api/* adding the required Referer header.
 *
 * Replaces the Vite dev-server proxy (which only works during `npm run dev`).
 */

export default async function handler(req, res) {
  // Build target path from catch-all segments
  const segments = Array.isArray(req.query.path)
    ? req.query.path
    : req.query.path
    ? [req.query.path]
    : []

  // Forward all query params except the internal 'path' catch-all
  const qs = new URLSearchParams()
  for (const [key, val] of Object.entries(req.query)) {
    if (key !== 'path') qs.append(key, String(val))
  }

  const qString   = qs.toString()
  const targetUrl = `https://api.tase.co.il/api/${segments.join('/')}${qString ? `?${qString}` : ''}`

  /** @type {RequestInit} */
  const fetchOptions = {
    method:  req.method ?? 'GET',
    headers: {
      'Content-Type': 'application/json',
      'Referer':       'https://www.tase.co.il/',
      'Cache-Control': 'no-cache',
    },
  }

  if (req.method === 'POST' && req.body) {
    fetchOptions.body = typeof req.body === 'string'
      ? req.body
      : JSON.stringify(req.body)
  }

  try {
    const upstream = await fetch(targetUrl, fetchOptions)
    const data     = await upstream.json()

    // Pass CORS headers so the browser doesn't block the response
    res.setHeader('Access-Control-Allow-Origin', '*')
    res.status(upstream.status).json(data)
  } catch (err) {
    res.status(502).json({ error: 'TASE proxy error', details: String(err) })
  }
}
