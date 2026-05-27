/**
 * Vercel Edge Function — TASE API proxy
 * Runs on Cloudflare edge network (not AWS Lambda), different IP range
 * Called via rewrite: /api/tase/:path* → /api/proxy?p=:path*
 */
export const config = { runtime: 'edge' }

export default async function handler(req) {
  const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET,POST,PUT,OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
  }

  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: corsHeaders })
  }

  try {
    const url = new URL(req.url)
    const pParam = url.searchParams.get('p') ?? ''

    // Rebuild query string (everything except 'p')
    const qs = new URLSearchParams()
    for (const [key, val] of url.searchParams.entries()) {
      if (key !== 'p') qs.append(key, val)
    }

    const targetUrl = `https://api.tase.co.il/api/${pParam}${qs.toString() ? `?${qs}` : ''}`
    const method = req.method

    const headers = {
      'Origin':          'https://www.tase.co.il',
      'Referer':         'https://www.tase.co.il/',
      'Host':            'api.tase.co.il',
      'User-Agent':      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
      'Accept':          'application/json, text/plain, */*',
      'Accept-Language': 'he-IL,he;q=0.9,en-US;q=0.8,en;q=0.7',
      'Cache-Control':   'no-cache',
      'Pragma':          'no-cache',
      'Sec-Fetch-Dest':  'empty',
      'Sec-Fetch-Mode':  'cors',
      'Sec-Fetch-Site':  'same-site',
    }

    if (method === 'POST' || method === 'PUT') {
      headers['Content-Type'] = 'application/json'
    }

    const fetchOpts = { method, headers }

    if ((method === 'POST' || method === 'PUT') && req.body) {
      fetchOpts.body = await req.text()
    }

    const upstream = await fetch(targetUrl, fetchOpts)

    if (!upstream.ok) {
      const text = await upstream.text().catch(() => '')
      return new Response(
        JSON.stringify({ error: `TASE_${upstream.status}`, body: text.slice(0, 300) }),
        { status: upstream.status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    const data = await upstream.text() // keep as raw text to avoid double-parse
    return new Response(data, {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
    })

  } catch (err) {
    return new Response(
      JSON.stringify({ error: 'proxy_error', details: String(err) }),
      { status: 502, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }
}
