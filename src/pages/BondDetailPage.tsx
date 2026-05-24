import { useParams, useNavigate } from 'react-router-dom'
import { useState, useEffect } from 'react'
import {
  ComposedChart, BarChart, Bar, Line,
  XAxis, YAxis, CartesianGrid, Tooltip,
  Legend, ResponsiveContainer,
} from 'recharts'
import { fetchSecurityData, fetchEodHistory } from '../api/tase'
import type { TaseSecurityData, TaseEodRecord } from '../api/tase'
import type { DailyMarketData, CashFlow, Bond } from '../types/bond'
import { formatPrice, formatYTM, formatDuration, calcParity, formatChartDate } from '../utils/formatters'
import { getBondById } from '../data/mockData'

// ── Helpers ───────────────────────────────────────────────────────────────────

/** DD/MM/YYYY → YYYY-MM-DD (for chart X-axis) */
function toIso(ddmmyyyy: string): string {
  const [d, m, y] = ddmmyyyy.split('/')
  return `${y}-${m}-${d}`
}

/** Derive coupon schedule from maturity date DD/MM/YYYY */
function couponSchedule(matDate: string): string {
  const [dd, mm] = matDate.split('/')
  const mo: Record<string, string> = {
    '01':'ינואר','02':'פברואר','03':'מרץ','04':'אפריל',
    '05':'מאי','06':'יוני','07':'יולי','08':'אוגוסט',
    '09':'ספטמבר','10':'אוקטובר','11':'נובמבר','12':'דצמבר',
  }
  return `${dd} ב${mo[mm] ?? mm} בכל שנה`
}

/** Generate bullet cash flows from today to maturity. */
function genCashFlows(couponPct: number, matDate: string): CashFlow[] {
  const matYear = parseInt(matDate.split('/')[2])
  const dm = matDate.substring(0, 5)  // DD/MM
  const startYear = new Date().getFullYear()
  return Array.from({ length: Math.max(1, matYear - startYear + 1) }, (_, i) => {
    const y = startYear + i
    const isLast = y === matYear
    return {
      date: `${dm}/${y}`,
      type: isLast ? 'קופון + פדיון קרן (מלא)' : 'קופון (ריבית)',
      principalPct: isLast ? 100 : 0,
      couponPct,
      status: 'forecast' as const,
    }
  })
}

// ── Mock fallback ─────────────────────────────────────────────────────────────

/** Convert a mock Bond to TaseSecurityData so the page can render it */
function bondToSecData(b: Bond): TaseSecurityData {
  return {
    Name:                 b.name,
    Type:                 b.issuerType === 'government' ? ' Government Bonds' : ' Corporate Bonds',
    SecuritySubType:      b.couponSchedule,
    LastRate:             b.lastPriceAgorot / 100,
    AnnualYield:          b.ytm,
    BrutoYield:           b.ytm,
    AnnualInterest:       b.couponRate.toFixed(5),
    Linkage:              b.indexingType === 'cpi' ? 'CPI' : '',
    RedemptionDate:       b.maturityDate,
    DaysUntilRedemption:  Math.round(b.duration * 365),
    RegisteredCapital:    0,
    MarketValue:          0,
    ISIN:                 '',
    Symbol:               b.securityId,
    TradeDate:            '',
  }
}

// ── Return calculations ───────────────────────────────────────────────────────

interface PeriodReturn {
  pct: number | null   // percentage change, null if no baseline available
  label: string        // display text e.g. "1.10%"
  positive: boolean
}

/**
 * Calculate MTD and YTD price returns from sorted dailyData.
 * Finds the last record BEFORE the start of the current month / year
 * as the baseline (i.e. closing price of Dec 31 / last day of prev month).
 */
function calcReturns(data: DailyMarketData[]): { mtd: PeriodReturn; ytd: PeriodReturn } {
  if (data.length === 0) {
    const empty: PeriodReturn = { pct: null, label: '—', positive: true }
    return { mtd: empty, ytd: empty }
  }

  const now        = new Date()
  const curYear    = now.getFullYear()
  const curMonth   = now.getMonth() + 1   // 1-based
  const startOfYear  = `${curYear}-01-01`
  const startOfMonth = `${curYear}-${String(curMonth).padStart(2, '0')}-01`

  const currentPrice = data[data.length - 1].priceAgorot

  const makePeriodReturn = (baselineDate: string): PeriodReturn => {
    // Find last record strictly before baselineDate
    const baseline = [...data]
      .reverse()
      .find((r) => r.date < baselineDate)

    if (!baseline) return { pct: null, label: '—', positive: true }

    const pct = (currentPrice - baseline.priceAgorot) / baseline.priceAgorot * 100
    const positive = pct >= 0
    const label = `${positive ? '+' : ''}${pct.toFixed(2)}%`
    return { pct, label, positive }
  }

  return {
    mtd: makePeriodReturn(startOfMonth),
    ytd: makePeriodReturn(startOfYear),
  }
}

/** Map TASE EOD records to our DailyMarketData format. */
function mapHistory(records: TaseEodRecord[], fallbackYtm: number): DailyMarketData[] {
  return records
    .map((r) => ({
      date: toIso(r.TradeDate),
      priceAgorot: Math.round(r.CloseRate * 100),
      ytm: r.BrutoYield > 0 ? r.BrutoYield : fallbackYtm,
      volumeThousands: Math.round((r.TurnOverValueShekel ?? 0) / 1000),
    }))
    .sort((a, b) => a.date.localeCompare(b.date))
}

// ── Sub-components ────────────────────────────────────────────────────────────

function DataFreshnessIndicator({ tradeDate }: { tradeDate?: string }) {
  return (
    <div className="flex items-center gap-2 bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs px-3 py-2 rounded-lg">
      <span className="w-2 h-2 rounded-full bg-emerald-500 shrink-0" />
      <span>
        נתונים אמיתיים מבורסת ת"א · EOD{' '}
        {tradeDate && <strong>{tradeDate}</strong>}
        {' '}· לא בזמן אמת
      </span>
    </div>
  )
}

function StaticInfoCard({ data, dailyData }: {
  data: TaseSecurityData
  dailyData: DailyMarketData[]
}) {
  const couponRate = parseFloat(data.AnnualInterest ?? '0')
  const priceAgorot = Math.round(data.LastRate * 100)
  const duration    = Math.round(data.DaysUntilRedemption / 365 * 82) / 100
  const parity      = calcParity(priceAgorot)
  const isGovt      = data.Type?.toLowerCase().includes('government')
  const isCpi       = data.Linkage === 'CPI'

  // Day change from history
  const lastTwo     = dailyData.slice(-2)
  const dayChange   = lastTwo.length === 2
    ? ((lastTwo[1].priceAgorot - lastTwo[0].priceAgorot) / lastTwo[0].priceAgorot * 100).toFixed(2)
    : null

  const fields = [
    { label: 'סוג מנפיק',   value: isGovt ? 'ממשלתי' : 'קונצרני' },
    { label: 'הצמדה',       value: isCpi ? 'צמוד מדד (CPI)' : 'שקלי (ללא הצמדה)' },
    { label: 'קופון',       value: `${couponRate.toFixed(2)}%` },
    { label: 'תדירות קופון', value: data.RedemptionDate ? couponSchedule(data.RedemptionDate) : '—' },
    { label: 'תאריך פדיון', value: data.RedemptionDate || '—' },
    { label: 'מחיר (₪)',   value: formatPrice(priceAgorot) },
    { label: 'תשואה לפדיון', value: formatYTM(data.AnnualYield ?? 0) },
    { label: 'מח"מ (שנים)', value: formatDuration(duration) },
    { label: 'פארי נוכחי',  value: parity.label, highlight: true },
    ...(dayChange !== null
      ? [{ label: 'שינוי יומי', value: `${parseFloat(dayChange) >= 0 ? '+' : ''}${dayChange}%`, highlight: false }]
      : []),
    { label: 'שווי שוק (₪M)', value: data.MarketValue ? data.MarketValue.toLocaleString() : '—' },
    { label: 'ISIN',          value: data.ISIN || '—' },
  ] as { label: string; value: string; highlight?: boolean }[]

  return (
    <div className="bg-white border border-slate-200 rounded-xl shadow-sm p-6">
      <h2 className="text-base font-semibold text-slate-700 mb-4 border-b border-slate-100 pb-2">
        א. מאפייני תשקיף
      </h2>
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-4">
        {fields.map(({ label, value, highlight }) => (
          <div key={label} className="space-y-0.5">
            <p className="text-xs text-slate-400 uppercase tracking-wide">{label}</p>
            <p className={[
              'text-sm font-semibold',
              highlight
                ? parity.isAbove ? 'text-emerald-600' : 'text-red-600'
                : 'text-slate-800',
            ].join(' ')}>
              {value}
            </p>
          </div>
        ))}
      </div>
    </div>
  )
}

function ReturnsCard({ dailyData }: { dailyData: DailyMarketData[] }) {
  const { mtd, ytd } = calcReturns(dailyData)

  const now       = new Date()
  const dd        = String(now.getDate()).padStart(2, '0')
  const mm        = String(now.getMonth() + 1).padStart(2, '0')
  const yyyy      = now.getFullYear()
  const todayStr  = `${dd}/${mm}/${yyyy}`

  const ReturnCell = ({ label, ret }: { label: string; ret: PeriodReturn }) => (
    <div className="flex-1 text-center px-6 py-4">
      <p className="text-xs text-slate-500 mb-2">{label}</p>
      {ret.pct === null ? (
        <p className="text-lg font-bold text-slate-400">—</p>
      ) : (
        <p className={`text-lg font-bold flex items-center justify-center gap-1 ${ret.positive ? 'text-emerald-600' : 'text-red-500'}`}>
          {ret.label}
          <span className="text-base">{ret.positive ? '↗' : '↘'}</span>
        </p>
      )}
    </div>
  )

  return (
    <div className="bg-white border border-slate-200 rounded-xl shadow-sm p-0 overflow-hidden">
      {/* Title bar */}
      <div className="flex items-center justify-between px-6 py-3 border-b border-slate-100">
        <h2 className="text-base font-semibold text-slate-700">תשואות</h2>
        <span className="text-xs text-slate-400">נכון ל- {todayStr}</span>
      </div>
      {/* Two columns */}
      <div className="flex divide-x divide-slate-100">
        <ReturnCell label="מתחילת החודש" ret={mtd} />
        <ReturnCell label="מתחילת השנה"  ret={ytd} />
      </div>
    </div>
  )
}

function PriceYieldTooltip({
  active, payload, label,
}: { active?: boolean; payload?: { name: string; value: number; color: string }[]; label?: string }) {
  if (!active || !payload?.length) return null
  return (
    <div className="bg-white border border-slate-200 rounded-lg shadow-lg px-3 py-2 text-xs space-y-1" dir="rtl">
      <p className="font-semibold text-slate-600 border-b border-slate-100 pb-1 mb-1">
        {label && formatChartDate(label)}
      </p>
      {payload.map((p) => (
        <p key={p.name} style={{ color: p.color }}>
          {p.name}:{' '}
          <strong>
            {p.name === 'מחיר (₪)' ? (p.value / 100).toFixed(2) : `${p.value.toFixed(2)}%`}
          </strong>
        </p>
      ))}
    </div>
  )
}

function PriceYieldChart({ data }: { data: DailyMarketData[] }) {
  const interval = Math.max(1, Math.floor(data.length / 8))
  return (
    <div className="bg-white border border-slate-200 rounded-xl shadow-sm p-6">
      <div className="mb-3">
        <h2 className="text-base font-semibold text-slate-700">ב. מחיר ותשואה לפדיון (90 יום)</h2>
        <p className="text-xs text-slate-400 mt-0.5">מחיר עולה ← תשואה יורדת (קורלציה הפוכה)</p>
      </div>
      <div dir="ltr">
        <ResponsiveContainer width="100%" height={280}>
          <ComposedChart data={data} margin={{ top: 5, right: 40, left: 10, bottom: 5 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
            <XAxis dataKey="date" tickFormatter={formatChartDate} interval={interval}
              tick={{ fontSize: 10, fill: '#94a3b8' }} tickLine={false} />
            <YAxis yAxisId="ytm" orientation="left" domain={['auto','auto']}
              tickFormatter={(v: number) => `${v.toFixed(1)}%`}
              tick={{ fontSize: 10, fill: '#f87171' }} tickLine={false} width={45}
              label={{ value: 'YTM %', angle: -90, position: 'insideLeft', style: { fontSize: 10, fill: '#f87171' }, offset: 10 }} />
            <YAxis yAxisId="price" orientation="right" domain={['auto','auto']}
              tickFormatter={(v: number) => (v / 100).toFixed(1)}
              tick={{ fontSize: 10, fill: '#3b82f6' }} tickLine={false} width={45}
              label={{ value: 'מחיר ₪', angle: 90, position: 'insideRight', style: { fontSize: 10, fill: '#3b82f6' }, offset: 10 }} />
            <Tooltip content={<PriceYieldTooltip />} />
            <Legend wrapperStyle={{ fontSize: 12, paddingTop: 8 }}
              formatter={(v) => <span style={{ color: '#475569' }}>{v}</span>} />
            <Line yAxisId="price" type="monotone" dataKey="priceAgorot" stroke="#3b82f6"
              dot={false} strokeWidth={2} name="מחיר (₪)" />
            <Line yAxisId="ytm" type="monotone" dataKey="ytm" stroke="#f87171"
              dot={false} strokeWidth={2} strokeDasharray="4 2" name="תשואה לפדיון (%)" />
          </ComposedChart>
        </ResponsiveContainer>
      </div>
    </div>
  )
}

function VolumeChart({ data }: { data: DailyMarketData[] }) {
  const interval = Math.max(1, Math.floor(data.length / 8))
  return (
    <div className="bg-white border border-slate-200 rounded-xl shadow-sm p-6">
      <h2 className="text-base font-semibold text-slate-700 mb-3">נפחי מסחר (₪ אלפים)</h2>
      <div dir="ltr">
        <ResponsiveContainer width="100%" height={160}>
          <BarChart data={data} margin={{ top: 5, right: 40, left: 10, bottom: 5 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" vertical={false} />
            <XAxis dataKey="date" tickFormatter={formatChartDate} interval={interval}
              tick={{ fontSize: 10, fill: '#94a3b8' }} tickLine={false} />
            <YAxis tickFormatter={(v: number) => `${v}K`}
              tick={{ fontSize: 10, fill: '#94a3b8' }} tickLine={false} width={40} />
            <Tooltip
              formatter={(v: number) => [`${v.toLocaleString()}K ₪`, 'נפח מסחר']}
              labelFormatter={formatChartDate}
              contentStyle={{ fontSize: 12, direction: 'rtl' }} />
            <Bar dataKey="volumeThousands" fill="#818cf8" name="נפח מסחר (₪K)" radius={[2,2,0,0]} />
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  )
}

function CashFlowTable({ flows }: { flows: CashFlow[] }) {
  const totalPrincipal = flows.reduce((s, f) => s + f.principalPct, 0)
  return (
    <div className="bg-white border border-slate-200 rounded-xl shadow-sm p-6">
      <div className="mb-4">
        <h2 className="text-base font-semibold text-slate-700">ג. לוח תזרים מזומנים חזוי</h2>
        <p className="text-xs text-slate-400 mt-0.5">מבוסס על תנאי התשקיף – תשלומים עתידיים עד פדיון מלא</p>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-slate-50 border-b border-slate-200 text-slate-500 text-xs uppercase tracking-wide">
              <th className="text-right px-4 py-2.5 font-medium">תאריך</th>
              <th className="text-right px-4 py-2.5 font-medium">סוג תשלום</th>
              <th className="text-left px-4 py-2.5 font-medium">אחוז קרן</th>
              <th className="text-left px-4 py-2.5 font-medium">ריבית קופון</th>
              <th className="text-right px-4 py-2.5 font-medium">סטטוס</th>
            </tr>
          </thead>
          <tbody>
            {flows.map((flow, idx) => (
              <tr key={flow.date}
                className={['border-b border-slate-100 last:border-0 hover:bg-slate-50', idx % 2 !== 0 ? 'bg-slate-50/40' : ''].join(' ')}>
                <td className="px-4 py-3 font-mono text-slate-700">{flow.date}</td>
                <td className="px-4 py-3">
                  <span className={`inline-flex px-2 py-0.5 rounded-full text-xs font-medium ${flow.principalPct > 0 ? 'bg-blue-100 text-blue-700' : 'bg-slate-100 text-slate-600'}`}>
                    {flow.type}
                  </span>
                </td>
                <td className="px-4 py-3 text-left font-mono">
                  {flow.principalPct > 0
                    ? <span className="font-semibold text-blue-700">{flow.principalPct}%</span>
                    : <span className="text-slate-400">—</span>}
                </td>
                <td className="px-4 py-3 text-left font-mono text-slate-700">{flow.couponPct}%</td>
                <td className="px-4 py-3 text-right">
                  <span className="inline-flex px-2 py-0.5 rounded-full text-xs font-medium bg-sky-100 text-sky-700">
                    חזוי
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr className="border-t-2 border-slate-200 bg-slate-50 font-semibold text-slate-700">
              <td className="px-4 py-3" colSpan={2}>סה"כ קרן לפדיון</td>
              <td className="px-4 py-3 text-left font-mono text-blue-700">{totalPrincipal}%</td>
              <td colSpan={2} />
            </tr>
          </tfoot>
        </table>
      </div>
    </div>
  )
}

// ── Page ──────────────────────────────────────────────────────────────────────
export default function BondDetailPage() {
  const { securityId } = useParams<{ securityId: string }>()
  const navigate = useNavigate()

  const [secData, setSecData]   = useState<TaseSecurityData | null>(null)
  const [history, setHistory]   = useState<TaseEodRecord[]>([])
  const [mockBond, setMockBond] = useState<Bond | null>(null)
  const [loading, setLoading]   = useState(true)
  const [error, setError]       = useState<string | null>(null)

  useEffect(() => {
    if (!securityId) return
    setLoading(true)
    setError(null)
    setMockBond(null)

    Promise.all([
      fetchSecurityData(securityId),
      fetchEodHistory(securityId),
    ])
      .then(([data, hist]) => {
        setSecData(data)
        setHistory(hist)
      })
      .catch(() => {
        // API failed or bond ID doesn't exist (404) — try mock data
        const mock = getBondById(securityId)
        if (mock) {
          setSecData(bondToSecData(mock))
          setMockBond(mock)
          setError(null)
        } else {
          setError('הנייר לא נמצא בבורסה ולא בנתוני הדמה')
        }
      })
      .finally(() => setLoading(false))
  }, [securityId])

  // ── Loading ────────────────────────────────────────────────────────────────
  if (loading) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center" dir="rtl">
        <div className="text-center space-y-3">
          <div className="w-10 h-10 border-4 border-blue-600 border-t-transparent rounded-full animate-spin mx-auto" />
          <p className="text-slate-500 text-sm">טוען נתוני אג"ח מבורסת ת"א...</p>
        </div>
      </div>
    )
  }

  // ── Error ──────────────────────────────────────────────────────────────────
  if (error || !secData) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center" dir="rtl">
        <div className="text-center space-y-4 max-w-md">
          <p className="text-red-500 text-lg font-semibold">שגיאה בטעינת הנייר</p>
          <p className="text-slate-400 text-sm">{error ?? 'הנייר לא נמצא'}</p>
          <button onClick={() => navigate('/')}
            className="px-4 py-2 bg-blue-600 text-white rounded-lg text-sm hover:bg-blue-700 transition-colors">
            חזרה לסקרינר
          </button>
        </div>
      </div>
    )
  }

  // ── Derived display values ─────────────────────────────────────────────────
  const couponRate  = parseFloat(secData.AnnualInterest ?? '0')
  const priceAgorot = Math.round(secData.LastRate * 100)
  const isGovt      = secData.Type?.toLowerCase().includes('government')
  const isHighYield = !isGovt && (secData.AnnualYield ?? 0) > 5.5
  // When using mock bond, use its pre-generated dailyData & cashFlows directly
  const dailyData   = mockBond ? mockBond.dailyData : mapHistory(history, secData.AnnualYield ?? 0)
  const cashFlows   = mockBond ? mockBond.cashFlows : (secData.RedemptionDate ? genCashFlows(couponRate, secData.RedemptionDate) : [])

  return (
    <div className="min-h-screen bg-slate-50" dir="rtl">

      {/* Header */}
      <header className="bg-white border-b border-slate-200 shadow-sm sticky top-0 z-10">
        <div className="max-w-7xl mx-auto px-6 py-4 flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <button onClick={() => navigate('/')}
              className="flex items-center gap-1.5 text-sm text-slate-500 hover:text-blue-600 transition-colors">
              ← חזרה לסקרינר
            </button>
            <span className="text-slate-300">|</span>
            <div>
              <h1 className="text-lg font-bold text-slate-800 flex items-center gap-2">
                {isHighYield && <span className="text-red-500">⚠</span>}
                {secData.Name}
                <span className="text-sm font-normal text-slate-400 font-mono">#{securityId}</span>
              </h1>
              <p className="text-xs text-slate-500">{secData.SecuritySubType}</p>
            </div>
          </div>
          <DataFreshnessIndicator tradeDate={secData.TradeDate} />
        </div>
      </header>

      {/* High-yield warning */}
      {isHighYield && (
        <div className="max-w-7xl mx-auto px-6 pt-4">
          <div className="flex items-start gap-2 bg-red-50 border border-red-200 rounded-lg px-4 py-3 text-sm text-red-700">
            <span className="text-base shrink-0">⚠️</span>
            <span>
              תשואה חריגה של <strong>{formatYTM(secData.AnnualYield ?? 0)}</strong> — אג"ח קונצרני עם{' '}
              <strong>סיכון אשראי גבוה</strong>. בדוק דוחות מנפיק לפני כל החלטת השקעה.
            </span>
          </div>
        </div>
      )}

      <main className="max-w-7xl mx-auto px-6 py-6 space-y-6">
        <StaticInfoCard data={secData} dailyData={dailyData} />

        {dailyData.length > 0 && <ReturnsCard dailyData={dailyData} />}

        <div className="space-y-4">
          {dailyData.length > 0
            ? <>
                <PriceYieldChart data={dailyData} />
                <VolumeChart data={dailyData} />
              </>
            : (
              <div className="bg-white border border-slate-200 rounded-xl shadow-sm p-8 text-center text-slate-400">
                אין נתוני מסחר היסטוריים זמינים לנייר זה
              </div>
            )}
        </div>

        {cashFlows.length > 0 && <CashFlowTable flows={cashFlows} />}

        <p className="text-xs text-slate-400 text-center pb-4">
          * נתוני תזרים מזומנים הינם חזוי בלבד. אינם מהוים ייעוץ השקעות.
          מקור: api.tase.co.il
        </p>
      </main>
    </div>
  )
}
