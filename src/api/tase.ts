/**
 * Typed wrappers for the TASE internal SPA API (api.tase.co.il).
 * No API key required – only the Referer header (added by Vite proxy).
 * All calls go through /api/tase/* which Vite proxies to the real endpoint.
 */

// ── Raw response types ────────────────────────────────────────────────────────

export interface TaseEntity {
  Id: string
  Name: string
  Smb: string
  ISIN: string | null
  Type: number
  SubType: string | null
  SubTypeDesc: string   // "Corporate Bonds" | "Government Bonds" | ...
  SubId: string | null
}

export interface TaseSecurityData {
  Name: string
  Type: string           // " Government Bonds" | " Corporate Bonds"
  SecuritySubType: string
  LastRate: number       // clean price, base-100  (119.2 = ₪119.20 per ₪100 nominal)
  AnnualYield: number    // YTM %
  BrutoYield: number
  AnnualInterest: string // coupon rate as string, e.g. "4.25000"
  Linkage: string        // "CPI" | ""
  RedemptionDate: string // DD/MM/YYYY
  DaysUntilRedemption: number
  RegisteredCapital: number
  MarketValue: number
  ISIN: string
  Symbol: string
  TradeDate: string      // DD/MM/YYYY — last trading date
}

export interface TaseEodRecord {
  TradeDate: string       // DD/MM/YYYY
  CloseRate: number       // base-100 price
  OpenRate: number
  HighRate: number
  LowRate: number
  BrutoYield: number      // YTM on that day
  TurnOverValueShekel: number  // ILS turnover
  DealsNo: number
}

// ── Constants ─────────────────────────────────────────────────────────────────

const HDR: HeadersInit = { 'Content-Type': 'application/json' }

// SubTypeDesc values from TASE (English exact match, Hebrew partial match)
const BOND_SUBTYPES_EN = new Set(['Corporate Bonds', 'Government Bonds', 'Corporate Bonds TASE UP'])

function isBondSubType(subTypeDesc: string): boolean {
  if (!subTypeDesc) return false
  if (BOND_SUBTYPES_EN.has(subTypeDesc)) return true
  // Hebrew: any SubTypeDesc containing "אגרות חוב" or "אגח" is a bond type
  return subTypeDesc.includes('אגרות חוב') || subTypeDesc.includes('אגח') || subTypeDesc.includes('אג"ח')
}

// ── Timeout helper ────────────────────────────────────────────────────────────

async function fetchWithTimeout(
  url: string,
  options: RequestInit = {},
  timeoutMs = 15_000,
): Promise<Response> {
  const controller = new AbortController()
  const tid = setTimeout(() => controller.abort(), timeoutMs)
  try {
    return await fetch(url, { ...options, signal: controller.signal })
  } finally {
    clearTimeout(tid)
  }
}

// ── API calls ─────────────────────────────────────────────────────────────────

/** Fetch all TASE bond securities (≈1,000 items). Single call, no auth. */
export async function fetchBondEntities(): Promise<TaseEntity[]> {
  const res = await fetchWithTimeout('/api/tase/content/searchentities?lang=0', { headers: HDR })
  if (!res.ok) throw new Error(`רשימת ניירות: שגיאת שרת ${res.status}`)
  const raw: unknown = await res.json()
  // TASE may return a plain array or wrap results in an object
  const all: TaseEntity[] = Array.isArray(raw)
    ? raw
    : Array.isArray((raw as Record<string, unknown>)?.Data)
      ? (raw as Record<string, unknown>).Data as TaseEntity[]
      : []
  if (all.length === 0) throw new Error('תגובה ריקה מהבורסה')
  return all.filter((e) => isBondSubType(e.SubTypeDesc))
}

/** Fetch current price, YTM, and meta for a single bond. */
export async function fetchSecurityData(id: string): Promise<TaseSecurityData> {
  const res = await fetchWithTimeout(
    `/api/tase/company/securitydata?securityId=${id}&lang=0`,
    { headers: HDR },
  )
  if (!res.ok) throw new Error(`נייר ${id}: שגיאת שרת ${res.status}`)
  return res.json() as Promise<TaseSecurityData>
}

/** Fetch last ~150 trading-day EOD records for a bond (covers YTD + 90-day chart). */
export async function fetchEodHistory(id: string): Promise<TaseEodRecord[]> {
  const now  = new Date()
  const dTo  = now.toISOString().split('T')[0]
  const dFrom = new Date(now.getTime() - 150 * 24 * 60 * 60 * 1000)
    .toISOString().split('T')[0]

  const res = await fetchWithTimeout('/api/tase/security/historyeod', {
    method: 'POST',
    headers: HDR,
    body: JSON.stringify({
      dFrom, dTo,
      oId: id,
      pageNum: 1,
      pType: '8',
      TotalRec: 1,
      lang: '0',
    }),
  })
  if (!res.ok) throw new Error(`היסטוריה ${id}: שגיאת שרת ${res.status}`)
  const json: unknown = await res.json()
  if (Array.isArray(json)) return json as TaseEodRecord[]
  const obj = json as Record<string, unknown>
  return (obj['Items'] ?? obj['Data'] ?? obj['HistoryData'] ?? []) as TaseEodRecord[]
}
