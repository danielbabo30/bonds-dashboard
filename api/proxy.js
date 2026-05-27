/**
 * Vercel Edge Function — TASE API proxy with session-cookie pre-fetch
 * Step 1: fetch www.tase.co.il to obtain a session cookie (mimics real browser)
 * Step 2: use that cookie in the actual api.tase.co.il call
 */
export const config = { runtime: 'edge' }

const BROWSER_UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36'

/** Fetch the TASE homepage and return its Set-Cookie value */
async function getTaseSessionCookie(): Promise<string> {
  try {
    const res = await fetch('https://www.tase.co.il/', {
      headers: {
        'User-Agent': BROWSER_UA,
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'he-IL,he;q=0.9,en;q=0.8',
        'Cache-Control': 'no-cache',
      },
    })
    const all: string[] =
      typeof (res.headers as unknown as { getSetCookie?: () => string[] }).getSetCookie === 'function'
        ? ((res.headers as unknown as { getSetCookie: () => string[] }).getSetCookie())
        : [res.headers.get('set-cookie') ?? ''].filter(Boolean)

    return all.map((c) => c.split(';')[0]).join('; ')
  } catch {
    return ''
  }
}

const corsHeaders: Record<string, string> = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET,POST,PUT,OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
}

export default async function handler(req: Request): Promise<Response> {
  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: corsHeaders })
  }

  try {
    const url = new URL(req.url)
    const pParam = url.searchParams.get('p') ?? ''
    const qs = new URLSearchParams()
    for (const [key, val] of url.searchParams.entries()) {
      if (key !== 'p') qs.append(key, val)
    }

    const targetUrl = `https://api.tase.co.il/api/${pParam}${qs.toString() ? `?${qs}` : ''}`
    const method = req.method

    // Step 1 – obtain a TASE session cookie to look like a real browser
    const sessionCookie = await getTaseSessionCookie()

    const headers: Record<string, string> = {
      'Origin':          'https://www.tase.co.il',
      'Referer':         'https://www.tase.co.il/',
      'User-Agent':      BROWSER_UA,
      'Accept':          'application/json, text/plain, */*',
      'Accept-Language': 'he-IL,he;q=0.9,en-US;q=0.8,en;q=0.7',
      'Cache-Control':   'no-cache',
      'Pragma':          'no-cache',
      'Sec-Fetch-Dest':  'empty',
      'Sec-Fetch-Mode':  'cors',
      'Sec-Fetch-Site':  'same-site',
      ...(sessionCookie ? { 'Cookie': sessionCookie } : {}),
    }

    if (method === 'POST' || method === 'PUT') {
      headers['Content-Type'] = 'application/json'
    }

    const fetchOpts: RequestInit = { method, headers }
    if ((method === 'POST' || method === 'PUT') && req.body) {
      fetchOpts.body = await req.text()
    }

    // Step 2 – call the actual TASE API
    const upstream = await fetch(targetUrl, fetchOpts)

    if (!upstream.ok) {
      const text = await upstream.text().catch(() => '')
      console.error(`[proxy] TASE ${upstream.status} | cookie=${!!sessionCookie} | ${text.slice(0, 150)}`)
      return new Response(
        JSON.stringify({ error: `TASE_${upstream.status}`, cookie: !!sessionCookie, body: text.slice(0, 300) }),
        { status: upstream.status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      )
    }

    const body = await upstream.text()
    return new Response(body, {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
    })
  } catch (err) {
    return new Response(
      JSON.stringify({ error: 'proxy_error', details: String(err) }),
      { status: 502, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    )
  }
}
