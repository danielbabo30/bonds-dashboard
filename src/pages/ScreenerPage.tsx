import { useState, useMemo, useEffect, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import type { IssuerType } from '../types/bond'
import { fetchBondEntities, fetchSecurityData } from '../api/tase'
import type { TaseEntity, TaseSecurityData } from '../api/tase'
import { formatPrice, formatYTM, formatDuration, getLastBusinessDate } from '../utils/formatters'
import { bonds as mockBonds } from '../data/mockData'

// ── Mock-data fallback helpers ────────────────────────────────────────────────

/** Convert a mock Bond into a TaseEntity (used when live API is unreachable) */
function mockToEntity(b: (typeof mockBonds)[0]): TaseEntity {
  return {
    Id: b.securityId,
    Name: b.name,
    Smb: b.securityId,
    ISIN: null,
    Type: 1,
    SubType: null,
    SubTypeDesc: b.issuerType === 'government' ? 'Government Bonds' : 'Corporate Bonds',
    SubId: null,
  }
}

/** Convert a mock Bond into a TaseSecurityData shape (used to pre-fill cache) */
function mockToSecurityData(b: (typeof mockBonds)[0]): TaseSecurityData {
  return {
    Name: b.name,
    Type: b.issuerType === 'government' ? ' Government Bonds' : ' Corporate Bonds',
    SecuritySubType: '',
    LastRate: b.lastPriceAgorot / 100,
    AnnualYield: b.ytm,
    BrutoYield: b.ytm,
    AnnualInterest: b.couponRate.toFixed(5),
    Linkage: b.indexingType === 'cpi' ? 'CPI' : '',
    RedemptionDate: b.maturityDate,   // already DD/MM/YYYY
    DaysUntilRedemption: Math.round(b.duration * 365),
    RegisteredCapital: 0,
    MarketValue: 0,
    ISIN: '',
    Symbol: b.securityId,
    TradeDate: '',
  }
}

// ── Helpers ───────────────────────────────────────────────────────────────────

/** SubTypeDesc from TASE may arrive in English (lang=1) or Hebrew (lang=0) */
function isGovtSubType(subTypeDesc: string): boolean {
  if (!subTypeDesc) return false
  if (subTypeDesc === 'Government Bonds') return true
  return subTypeDesc.includes('ממשלתי')
}

// ── Constants ─────────────────────────────────────────────────────────────────
const ANOMALY_THRESHOLD = 5.5
const PAGE_SIZE = 20
const FAVORITES_KEY = 'bond-screener-favorites-v2'   // v2 = real TASE IDs

type SortKey =
  | 'name' | 'securityId' | 'indexingType' | 'issuerType'
  | 'lastPriceAgorot' | 'ytm' | 'duration' | 'maturityDate'
type SortDir = 'asc' | 'desc'
type IndexFilter = 'all' | 'shekel' | 'cpi'
type DurationBucket = 'all' | 'short' | 'medium' | 'long'
type YtmBucket = 'all' | '0-2' | '2-4' | '4-6' | '6+'

// ── Row helpers (work on nullable detail) ─────────────────────────────────────
function getYtm(d: TaseSecurityData | null)       { return d?.AnnualYield ?? null }
function getPrice(d: TaseSecurityData | null)     { return d ? Math.round(d.LastRate * 100) : null }
function getDuration(d: TaseSecurityData | null)  { return d ? Math.round(d.DaysUntilRedemption / 365 * 82) / 100 : null }
function getMaturity(d: TaseSecurityData | null)  { return d?.RedemptionDate ?? null }
function getIsCpi(d: TaseSecurityData | null)     { return d ? d.Linkage === 'CPI' : null }
function matDateNum(s: string) {
  const [dd, mm, yy] = s.split('/')
  return parseInt(`${yy}${mm}${dd}`)
}

// ── Sort comparator ────────────────────────────────────────────────────────────
function compareRows(
  a: TaseEntity, b: TaseEntity,
  da: TaseSecurityData | null, db: TaseSecurityData | null,
  key: SortKey, dir: SortDir,
): number {
  let r = 0

  const nullable = <T,>(va: T | null, vb: T | null, cmp: (x: T, y: T) => number) => {
    if (va === null && vb === null) return 0
    if (va === null) return 1   // unloaded → end
    if (vb === null) return -1
    return cmp(va, vb)
  }

  switch (key) {
    case 'name':          r = a.Name.localeCompare(b.Name, 'en'); break
    case 'securityId':    r = a.Id.localeCompare(b.Id); break
    case 'issuerType':    r = (isGovtSubType(a.SubTypeDesc) ? 0 : 1) - (isGovtSubType(b.SubTypeDesc) ? 0 : 1); break
    case 'indexingType':  r = nullable(getIsCpi(da), getIsCpi(db), (x, y) => (x ? 0 : 1) - (y ? 0 : 1)); break
    case 'ytm':           r = nullable(getYtm(da), getYtm(db), (x, y) => x - y); break
    case 'lastPriceAgorot': r = nullable(getPrice(da), getPrice(db), (x, y) => x - y); break
    case 'duration':      r = nullable(getDuration(da), getDuration(db), (x, y) => x - y); break
    case 'maturityDate':  r = nullable(getMaturity(da), getMaturity(db), (x, y) => matDateNum(x) - matDateNum(y)); break
  }
  return dir === 'asc' ? r : -r
}

// ── Windowed paginator ────────────────────────────────────────────────────────
function buildPageWindow(current: number, total: number): (number | '…')[] {
  if (total <= 9) return Array.from({ length: total }, (_, i) => i + 1)
  const set = new Set<number>()
  set.add(1); set.add(total)
  for (let p = Math.max(1, current - 2); p <= Math.min(total, current + 2); p++) set.add(p)
  const sorted = Array.from(set).sort((a, b) => a - b)
  const result: (number | '…')[] = []
  for (let i = 0; i < sorted.length; i++) {
    if (i > 0 && sorted[i] - sorted[i - 1] > 1) result.push('…')
    result.push(sorted[i])
  }
  return result
}

// ── Sub-components ────────────────────────────────────────────────────────────
function DataFreshnessIndicator({ tradeDate, isMock, mockReason }: { tradeDate?: string; isMock?: boolean; mockReason?: string }) {
  if (isMock) {
    return (
      <div className="flex items-center gap-2 bg-amber-50 border border-amber-200 text-amber-800 text-xs px-3 py-2 rounded-lg max-w-xs" title={mockReason}>
        <span className="w-2 h-2 rounded-full bg-amber-400 shrink-0" />
        <span>נתוני דמה · בורסת ת"א לא זמינה{mockReason ? ` (${mockReason})` : ''}</span>
      </div>
    )
  }
  return (
    <div className="flex items-center gap-2 bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs px-3 py-2 rounded-lg">
      <span className="w-2 h-2 rounded-full bg-emerald-500 shrink-0 animate-pulse" />
      <span>
        נתונים אמיתיים מבורסת ת"א · EOD{' '}
        {tradeDate
          ? <><strong>{tradeDate}</strong></>
          : <strong>{getLastBusinessDate()}</strong>}
        {' '}17:30 · לא בזמן אמת
      </span>
    </div>
  )
}

interface SortableThProps {
  label: string; colKey: SortKey; sortKey: SortKey; sortDir: SortDir
  onSort: (k: SortKey) => void; alignLeft?: boolean
}
function SortableTh({ label, colKey, sortKey, sortDir, onSort, alignLeft }: SortableThProps) {
  const active = sortKey === colKey
  return (
    <th
      onClick={() => onSort(colKey)}
      className={[
        'px-4 py-3 font-semibold text-slate-600 cursor-pointer select-none',
        'hover:bg-slate-200 active:bg-slate-300 transition-colors',
        alignLeft ? 'text-left' : 'text-right',
      ].join(' ')}
    >
      <span className="inline-flex items-center gap-1">
        {label}
        <span className={['text-xs', active ? 'text-blue-500' : 'text-slate-300'].join(' ')}>
          {active ? (sortDir === 'asc' ? '▲' : '▼') : '↕'}
        </span>
      </span>
    </th>
  )
}

/** Pulsing skeleton cell shown while details are loading */
function Skel() {
  return <span className="inline-block w-12 h-3 rounded bg-slate-200 animate-pulse" />
}

/** Copy-to-clipboard button shown next to the security ID */
function CopyIdButton({ id }: { id: string }) {
  const [copied, setCopied] = useState(false)

  const handleCopy = (e: React.MouseEvent) => {
    e.stopPropagation()
    navigator.clipboard.writeText(id).then(() => {
      setCopied(true)
      setTimeout(() => setCopied(false), 1500)
    }).catch(() => {/* ignore */})
  }

  return (
    <button
      onClick={handleCopy}
      title={copied ? 'הועתק!' : 'העתק מספר נייר'}
      className={[
        'mr-1.5 p-0.5 rounded transition-all focus:outline-none',
        copied
          ? 'text-emerald-500'
          : 'text-slate-300 hover:text-slate-500',
      ].join(' ')}
    >
      {copied
        ? (
          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" fill="currentColor" className="w-3.5 h-3.5">
            <path fillRule="evenodd" d="M12.416 3.376a.75.75 0 0 1 .208 1.04l-5 7.5a.75.75 0 0 1-1.154.114l-3-3a.75.75 0 0 1 1.06-1.06l2.353 2.353 4.493-6.74a.75.75 0 0 1 1.04-.207Z" clipRule="evenodd" />
          </svg>
        ) : (
          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" fill="currentColor" className="w-3.5 h-3.5">
            <path fillRule="evenodd" d="M11 2.5a.5.5 0 0 0-.5-.5h-5a.5.5 0 0 0-.5.5v1H4a2 2 0 0 0-2 2V12a2 2 0 0 0 2 2h8a2 2 0 0 0 2-2V5.5a2 2 0 0 0-2-2h-.5v-1Zm-6 1h6v1H5v-1Zm-1 2.5h8a.5.5 0 0 1 .5.5V12a.5.5 0 0 1-.5.5H4A.5.5 0 0 1 3.5 12V6.5a.5.5 0 0 1 .5-.5Z" clipRule="evenodd" />
          </svg>
        )}
    </button>
  )
}

// ── Main page ─────────────────────────────────────────────────────────────────
export default function ScreenerPage() {
  const navigate = useNavigate()

  // ── Live data state ─────────────────────────────────────────────────────────
  const [entities, setEntities]           = useState<TaseEntity[]>([])
  const [detailsCache, setDetailsCache]   = useState<Record<string, TaseSecurityData>>({})
  const [fetchingIds, setFetchingIds]     = useState<Set<string>>(new Set())
  const [listLoading, setListLoading]     = useState(true)
  const [listError, setListError]         = useState<string | null>(null)
  const [loadedCount, setLoadedCount]     = useState(0)
  const [usingMockData, setUsingMockData] = useState(false)
  const [mockReason, setMockReason]       = useState<string>('')
  const [syncing, setSyncing]             = useState(false)
  const [lastSyncedAt, setLastSyncedAt]   = useState<Date | null>(null)

  // ── Filter / sort / page state ──────────────────────────────────────────────
  const [search, setSearch]               = useState('')
  const [indexFilter, setIndexFilter]     = useState<IndexFilter>('all')
  const [issuerFilter, setIssuerFilter]   = useState<IssuerType | 'all'>('all')
  const [durationFilter, setDurationFilter] = useState<DurationBucket>('all')
  const [ytmFilter, setYtmFilter]         = useState<YtmBucket>('all')
  const [sortKey, setSortKey]             = useState<SortKey>('name')
  const [sortDir, setSortDir]             = useState<SortDir>('asc')
  const [page, setPage]                   = useState(1)
  const [favorites, setFavorites]         = useState<Set<string>>(() => {
    try {
      const raw = localStorage.getItem(FAVORITES_KEY)
      return new Set(raw ? (JSON.parse(raw) as string[]) : [])
    } catch { return new Set() }
  })

  // ── Data loader (used on mount + manual sync) ──────────────────────────────
  const syncData = useCallback((isManual = false) => {
    if (isManual) {
      setSyncing(true)
      // Clear cached details so fresh data is fetched for visible rows
      setDetailsCache({})
      setFetchingIds(new Set())
      setLoadedCount(0)
    } else {
      setListLoading(true)
    }
    setListError(null)

    fetchBondEntities()
      .then((data) => {
        setEntities(data)
        setUsingMockData(false)
        setLastSyncedAt(new Date())
      })
      .catch((e: Error) => {
        const reason = e.name === 'AbortError' ? 'timeout (15s)' : e.message
        console.warn('TASE API unavailable, using mock data:', reason)
        setMockReason(reason)
        const mockEntities = mockBonds.map(mockToEntity)
        const mockCache: Record<string, TaseSecurityData> = {}
        mockBonds.forEach((b) => { mockCache[b.securityId] = mockToSecurityData(b) })
        setEntities(mockEntities)
        setDetailsCache(mockCache)
        setLoadedCount(mockBonds.length)
        setUsingMockData(true)
        setListError(null)
        setLastSyncedAt(new Date())
      })
      .finally(() => {
        setListLoading(false)
        setSyncing(false)
      })
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // ── Load on mount ───────────────────────────────────────────────────────────
  useEffect(() => { syncData(false) }, [])

  // Reset to page 1 when filter/sort changes
  useEffect(() => { setPage(1) }, [search, indexFilter, issuerFilter, durationFilter, ytmFilter, sortKey])

  // ── Derived: filtered + sorted entity list ──────────────────────────────────
  const filteredSorted = useMemo<TaseEntity[]>(() => {
    const hasDetailFilter = indexFilter !== 'all' || ytmFilter !== 'all' || durationFilter !== 'all'

    return entities
      .filter((e) => {
        const d = detailsCache[e.Id] ?? null
        const isGovt = isGovtSubType(e.SubTypeDesc)

        // Text search (always available)
        if (search) {
          const q = search.toLowerCase()
          if (!e.Name.toLowerCase().includes(q) && !e.Id.includes(q)) return false
        }
        // Issuer type (always available)
        if (issuerFilter === 'government' && !isGovt) return false
        if (issuerFilter === 'corporate'  &&  isGovt) return false

        // Detail-dependent filters
        if (d) {
          const isCpi = d.Linkage === 'CPI'
          if (indexFilter === 'cpi'    && !isCpi) return false
          if (indexFilter === 'shekel' &&  isCpi) return false
          const ytm = d.AnnualYield ?? 0
          if (ytmFilter === '0-2' && (ytm < 0  || ytm >= 2)) return false
          if (ytmFilter === '2-4' && (ytm < 2  || ytm >= 4)) return false
          if (ytmFilter === '4-6' && (ytm < 4  || ytm >= 6)) return false
          if (ytmFilter === '6+'  &&  ytm < 6) return false
          const dur = Math.round(d.DaysUntilRedemption / 365 * 82) / 100
          if (durationFilter === 'short'  && dur >= 2) return false
          if (durationFilter === 'medium' && (dur < 2 || dur >= 5)) return false
          if (durationFilter === 'long'   && dur < 5) return false
        } else if (hasDetailFilter) {
          // Bond not yet loaded and a detail filter is active → hide it
          return false
        }
        return true
      })
      .sort((a, b) =>
        compareRows(a, b, detailsCache[a.Id] ?? null, detailsCache[b.Id] ?? null, sortKey, sortDir)
      )
  }, [entities, detailsCache, search, indexFilter, issuerFilter, durationFilter, ytmFilter, sortKey, sortDir])

  // ── Pagination ──────────────────────────────────────────────────────────────
  const pinned    = filteredSorted.filter((e) => favorites.has(e.Id))
  const rest      = filteredSorted.filter((e) => !favorites.has(e.Id))
  const totalPages = Math.max(1, Math.ceil(rest.length / PAGE_SIZE))
  const safePage   = Math.min(page, totalPages)
  const pageSlice  = rest.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE)
  const visibleRows = [...pinned, ...pageSlice]

  // ── Lazy-load details for currently visible rows ────────────────────────────
  const loadDetails = useCallback(async (ids: string[]) => {
    const toFetch = ids.filter((id) => !detailsCache[id] && !fetchingIds.has(id))
    if (toFetch.length === 0) return

    setFetchingIds((prev) => new Set([...prev, ...toFetch]))
    const results = await Promise.all(
      toFetch.map((id) =>
        fetchSecurityData(id)
          .then((data) => ({ id, data }))
          .catch(() => null),
      ),
    )
    const updates: Record<string, TaseSecurityData> = {}
    results.forEach((r) => { if (r) updates[r.id] = r.data })
    setDetailsCache((prev) => ({ ...prev, ...updates }))
    setLoadedCount((n) => n + Object.keys(updates).length)
    setFetchingIds((prev) => {
      const next = new Set(prev)
      toFetch.forEach((id) => next.delete(id))
      return next
    })
  }, [detailsCache, fetchingIds])

  useEffect(() => {
    if (visibleRows.length === 0) return
    void loadDetails(visibleRows.map((e) => e.Id))
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visibleRows.map((e) => e.Id).join(',')])

  // ── Handlers ────────────────────────────────────────────────────────────────
  const handleSort = (key: SortKey) => {
    if (sortKey === key) {
      setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'))
    } else {
      setSortKey(key)
      setSortDir('asc')
    }
  }

  const toggleFavorite = (id: string, e: React.MouseEvent) => {
    e.stopPropagation()
    setFavorites((prev) => {
      const next = new Set(prev)
      if (next.has(id)) { next.delete(id) } else { next.add(id) }
      try { localStorage.setItem(FAVORITES_KEY, JSON.stringify([...next])) } catch (_) { /* ignore */ }
      return next
    })
  }

  // ── Derive last trade date from any loaded detail ───────────────────────────
  const anyDetail  = Object.values(detailsCache)[0]
  const tradeDate  = anyDetail?.TradeDate

  const isAnomaly = (d: TaseSecurityData | null, isGovt: boolean) =>
    !isGovt && (d?.AnnualYield ?? 0) > ANOMALY_THRESHOLD

  // ── Render ──────────────────────────────────────────────────────────────────
  return (
    <div className="min-h-screen bg-slate-50" dir="rtl">

      {/* Header */}
      <header className="bg-white border-b border-slate-200 shadow-sm sticky top-0 z-10">
        <div className="max-w-7xl mx-auto px-6 py-4 flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="text-xl font-bold text-slate-800 tracking-tight">📊 בונד סקרינר</h1>
            <p className="text-xs text-slate-500 mt-0.5">
              מסך ראשי – ניתוח אגרות חוב TASE ·{' '}
              {usingMockData ? 'נתוני דמה' : 'נתונים אמיתיים'}
            </p>
          </div>
          <div className="flex items-center gap-3">
            <DataFreshnessIndicator tradeDate={tradeDate} isMock={usingMockData} mockReason={mockReason} />

            {/* Manual sync button */}
            <button
              onClick={() => syncData(true)}
              disabled={syncing || listLoading}
              title="סנכרן נתונים עכשיו"
              className={[
                'flex items-center gap-2 px-3 py-2 rounded-lg border text-sm font-medium transition-all',
                syncing
                  ? 'border-blue-300 bg-blue-50 text-blue-500 cursor-wait'
                  : 'border-slate-300 bg-white text-slate-600 hover:bg-slate-50 hover:border-slate-400 active:bg-slate-100',
                (listLoading && !syncing) ? 'opacity-40 cursor-not-allowed' : '',
              ].join(' ')}
            >
              <svg
                xmlns="http://www.w3.org/2000/svg"
                viewBox="0 0 20 20"
                fill="currentColor"
                className={['w-4 h-4', syncing ? 'animate-spin' : ''].join(' ')}
              >
                <path fillRule="evenodd"
                  d="M15.312 11.424a5.5 5.5 0 0 1-9.201 2.466l-.312-.311h2.433a.75.75 0 0 0 0-1.5H3.989a.75.75 0 0 0-.75.75v4.242a.75.75 0 0 0 1.5 0v-2.43l.31.31a7 7 0 0 0 11.712-3.138.75.75 0 0 0-1.449-.39Zm1.23-3.723a.75.75 0 0 0 .219-.53V2.929a.75.75 0 0 0-1.5 0v2.43l-.31-.31A7 7 0 0 0 3.239 8.188a.75.75 0 1 0 1.448.389A5.5 5.5 0 0 1 13.89 6.11l.311.31h-2.432a.75.75 0 0 0 0 1.5h4.243a.75.75 0 0 0 .53-.219Z"
                  clipRule="evenodd" />
              </svg>
              <span>
                {syncing ? 'מסנכרן...' : 'סנכרן'}
              </span>
            </button>
          </div>
        </div>

        {/* Last synced timestamp */}
        {lastSyncedAt && !syncing && (
          <div className="max-w-7xl mx-auto px-6 pb-2 flex justify-end">
            <span className="text-xs text-slate-400">
              סונכרן לאחרונה: {lastSyncedAt.toLocaleTimeString('he-IL', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
            </span>
          </div>
        )}
      </header>

      <main className="max-w-7xl mx-auto px-6 py-6 space-y-4">

        {/* ── Filter bar ─────────────────────────────────────────────────────── */}
        <div className="bg-white border border-slate-200 rounded-xl shadow-sm p-4 space-y-3">
          <input
            type="text"
            placeholder="🔍  חיפוש לפי שם נייר או מספר נייר..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 text-right"
          />
          <div className="flex flex-wrap gap-2 items-center">
            <select value={indexFilter} onChange={(e) => setIndexFilter(e.target.value as IndexFilter)}
              className="border border-slate-300 rounded-lg px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-500">
              <option value="all">כל סוגי הצמדה</option>
              <option value="shekel">שקלי</option>
              <option value="cpi">צמוד מדד</option>
            </select>
            <select value={issuerFilter} onChange={(e) => setIssuerFilter(e.target.value as typeof issuerFilter)}
              className="border border-slate-300 rounded-lg px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-500">
              <option value="all">כל המנפיקים</option>
              <option value="government">ממשלתי</option>
              <option value="corporate">קונצרני</option>
            </select>
            <select value={durationFilter} onChange={(e) => setDurationFilter(e.target.value as DurationBucket)}
              className="border border-slate-300 rounded-lg px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-500">
              <option value="all">כל טווחי מח"מ</option>
              <option value="short">מח"מ קצר (עד 2)</option>
              <option value="medium">מח"מ בינוני (2–5)</option>
              <option value="long">מח"מ ארוך (מעל 5)</option>
            </select>
            <select value={ytmFilter} onChange={(e) => setYtmFilter(e.target.value as YtmBucket)}
              className="border border-slate-300 rounded-lg px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-500">
              <option value="all">כל טווחי תשואה</option>
              <option value="0-2">תשואה 0%–2%</option>
              <option value="2-4">תשואה 2%–4%</option>
              <option value="4-6">תשואה 4%–6%</option>
              <option value="6+">תשואה מעל 6%</option>
            </select>

            {/* Stats */}
            <span className="text-sm text-slate-400 mr-auto">
              {listLoading
                ? 'טוען רשימת ניירות...'
                : `${filteredSorted.length} ניירות`}
              {loadedCount > 0 && ` · ${loadedCount} נטענו`}
              {favorites.size > 0 && ` · ${favorites.size} ⭐`}
            </span>
          </div>
        </div>

        {/* ── Error banner ───────────────────────────────────────────────────── */}
        {listError && (
          <div className="flex items-start gap-2 text-sm text-red-700 bg-red-50 border border-red-200 rounded-lg px-4 py-3">
            <span>⚠️</span>
            <span><strong>שגיאה בטעינת נתוני הבורסה:</strong> {listError}<br />
              ודא שהשרת פועל עם <code>npm run dev</code> (proxy נדרש לעקוף CORS).</span>
          </div>
        )}

        {/* ── Loading spinner ─────────────────────────────────────────────────── */}
        {listLoading && (
          <div className="flex items-center justify-center py-20">
            <div className="text-center space-y-3">
              <div className="w-10 h-10 border-4 border-blue-600 border-t-transparent rounded-full animate-spin mx-auto" />
              <p className="text-slate-500 text-sm">טוען רשימת אגח"ים מבורסת ת"א...</p>
              <p className="text-slate-400 text-xs">עד 15 שניות · במקרה של כישלון יוצגו נתוני דמה</p>
            </div>
          </div>
        )}

        {/* ── Anomaly note ───────────────────────────────────────────────────── */}
        {!listLoading && visibleRows.some((e) =>
          isAnomaly(detailsCache[e.Id] ?? null, isGovtSubType(e.SubTypeDesc))
        ) && (
          <div className="flex items-start gap-2 text-sm text-red-700 bg-red-50 border border-red-200 rounded-lg px-4 py-2.5">
            <span className="shrink-0">⚠️</span>
            <span>שורות באדום — אג"ח קונצרני עם <strong>תשואה חריגה מעל {ANOMALY_THRESHOLD}%</strong>.</span>
          </div>
        )}

        {/* ── Table ──────────────────────────────────────────────────────────── */}
        {!listLoading && (
          <div className="bg-white border border-slate-200 rounded-xl shadow-sm overflow-x-auto">
            <table className="w-full text-sm min-w-[900px]">
              <thead>
                <tr className="bg-slate-100 border-b border-slate-200">
                  <th className="px-3 py-3 w-10 text-center text-slate-400 text-xs font-medium">⭐</th>
                  <SortableTh label="שם הנייר"      colKey="name"            sortKey={sortKey} sortDir={sortDir} onSort={handleSort} />
                  <SortableTh label="מספר נייר"     colKey="securityId"      sortKey={sortKey} sortDir={sortDir} onSort={handleSort} />
                  <SortableTh label="הצמדה"         colKey="indexingType"    sortKey={sortKey} sortDir={sortDir} onSort={handleSort} />
                  <SortableTh label="מנפיק"         colKey="issuerType"      sortKey={sortKey} sortDir={sortDir} onSort={handleSort} />
                  <SortableTh label="מחיר (₪)"     colKey="lastPriceAgorot" sortKey={sortKey} sortDir={sortDir} onSort={handleSort} alignLeft />
                  <SortableTh label="תשואה לפדיון" colKey="ytm"             sortKey={sortKey} sortDir={sortDir} onSort={handleSort} alignLeft />
                  <SortableTh label='מח"מ'          colKey="duration"        sortKey={sortKey} sortDir={sortDir} onSort={handleSort} alignLeft />
                  <SortableTh label="תאריך פדיון"  colKey="maturityDate"    sortKey={sortKey} sortDir={sortDir} onSort={handleSort} alignLeft />
                </tr>
              </thead>
              <tbody>
                {visibleRows.length === 0 && (
                  <tr>
                    <td colSpan={9} className="text-center py-16 text-slate-400">
                      לא נמצאו ניירות ערך התואמים את הסינון
                    </td>
                  </tr>
                )}
                {visibleRows.map((entity, idx) => {
                  const d       = detailsCache[entity.Id] ?? null
                  const isFetching = fetchingIds.has(entity.Id)
                  const isGovt  = isGovtSubType(entity.SubTypeDesc)
                  const isFav   = favorites.has(entity.Id)
                  const anomaly = isAnomaly(d, isGovt)
                  const ytm     = getYtm(d)
                  const price   = getPrice(d)
                  const dur     = getDuration(d)
                  const mat     = getMaturity(d)
                  const cpi     = getIsCpi(d)

                  return (
                    <tr
                      key={entity.Id}
                      onClick={() => navigate(`/bond/${entity.Id}`)}
                      className={[
                        'cursor-pointer transition-colors border-b border-slate-100 last:border-0',
                        isFav
                          ? 'bg-yellow-50 hover:bg-yellow-100'
                          : anomaly
                          ? 'bg-red-50 hover:bg-red-100'
                          : idx % 2 === 0
                          ? 'bg-white hover:bg-slate-50'
                          : 'bg-slate-50/50 hover:bg-slate-100',
                      ].join(' ')}
                    >
                      {/* Star */}
                      <td className="px-3 py-3 text-center" onClick={(e) => e.stopPropagation()}>
                        <button
                          onClick={(e) => toggleFavorite(entity.Id, e)}
                          title={isFav ? 'הסר מהמועדפים' : 'הוסף למועדפים'}
                          className={[
                            'text-lg leading-none transition-transform hover:scale-125 focus:outline-none',
                            isFav ? 'text-yellow-400' : 'text-slate-200 hover:text-yellow-300',
                          ].join(' ')}
                        >
                          {isFav ? '★' : '☆'}
                        </button>
                      </td>

                      {/* Name */}
                      <td className="px-4 py-3 font-medium text-slate-800 max-w-[200px] truncate">
                        {isFav && <span className="text-yellow-500 ml-1 text-xs">📌</span>}
                        {anomaly && !isFav && <span className="text-red-500 ml-1">⚠</span>}
                        {d?.Name ?? entity.Name}
                      </td>

                      {/* ID */}
                      <td className="px-4 py-3 text-slate-500 font-mono text-xs" onClick={(e) => e.stopPropagation()}>
                        <span className="inline-flex items-center gap-0.5">
                          {entity.Id}
                          <CopyIdButton id={entity.Id} />
                        </span>
                      </td>

                      {/* Indexing */}
                      <td className="px-4 py-3">
                        {usingMockData
                          ? <span className="text-slate-300 text-xs">—</span>
                          : isFetching && cpi === null
                          ? <Skel />
                          : cpi === null
                          ? <span className="text-slate-300 text-xs">—</span>
                          : (
                            <span className={`inline-flex px-2 py-0.5 rounded-full text-xs font-medium ${cpi ? 'bg-amber-100 text-amber-700' : 'bg-emerald-100 text-emerald-700'}`}>
                              {cpi ? 'צמוד מדד' : 'שקלי'}
                            </span>
                          )}
                      </td>

                      {/* Issuer type */}
                      <td className="px-4 py-3">
                        <span className={`inline-flex px-2 py-0.5 rounded-full text-xs font-medium ${isGovt ? 'bg-blue-100 text-blue-700' : 'bg-purple-100 text-purple-700'}`}>
                          {isGovt ? 'ממשלתי' : 'קונצרני'}
                        </span>
                      </td>

                      {/* Price */}
                      <td className="px-4 py-3 text-left font-mono text-slate-800">
                        {usingMockData ? '—' : isFetching && price === null ? <Skel /> : price !== null ? formatPrice(price) : '—'}
                      </td>

                      {/* YTM */}
                      <td className="px-4 py-3 text-left font-mono font-semibold text-slate-700">
                        {usingMockData ? '—' : isFetching && ytm === null ? <Skel /> : ytm !== null ? formatYTM(ytm) : '—'}
                      </td>

                      {/* Duration */}
                      <td className="px-4 py-3 text-left font-mono text-slate-700">
                        {usingMockData ? '—' : isFetching && dur === null ? <Skel /> : dur !== null ? formatDuration(dur) : '—'}
                      </td>

                      {/* Maturity */}
                      <td className="px-4 py-3 text-left text-slate-600">
                        {usingMockData ? '—' : isFetching && mat === null ? <Skel /> : mat ?? '—'}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}

        {/* ── Pagination ─────────────────────────────────────────────────────── */}
        {!listLoading && totalPages > 1 && (
          <div className="flex items-center justify-between bg-white border border-slate-200 rounded-xl shadow-sm px-6 py-3">
            <button
              disabled={safePage <= 1}
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              className="flex items-center gap-1.5 px-4 py-2 text-sm rounded-lg border border-slate-300 hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
            >
              הקודם →
            </button>
            <div className="flex items-center gap-1">
              {buildPageWindow(safePage, totalPages).map((item, i) =>
                item === '…' ? (
                  <span key={`e${i}`} className="w-8 h-8 flex items-center justify-center text-slate-400 text-sm select-none">…</span>
                ) : (
                  <button
                    key={item}
                    onClick={() => setPage(item)}
                    className={[
                      'w-8 h-8 rounded-lg text-sm font-medium transition-colors',
                      item === safePage ? 'bg-blue-600 text-white' : 'text-slate-600 hover:bg-slate-100',
                    ].join(' ')}
                  >
                    {item}
                  </button>
                )
              )}
            </div>
            <button
              disabled={safePage >= totalPages}
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
              className="flex items-center gap-1.5 px-4 py-2 text-sm rounded-lg border border-slate-300 hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
            >
              ← הבא
            </button>
          </div>
        )}

        {/* Page info */}
        {!listLoading && (
          <p className="text-xs text-slate-400 text-center pb-2">
            {pinned.length > 0 && `${pinned.length} מועדפים · `}
            עמוד {safePage} מתוך {totalPages} · {rest.length} ניירות · לחץ על שורה לפרטים
            {fetchingIds.size > 0 && ` · טוען ${fetchingIds.size} נתונים...`}
          </p>
        )}
      </main>
    </div>
  )
}
