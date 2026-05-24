import type { Bond, DailyMarketData, CashFlow, CreditRating } from '../types/bond'

// ── Deterministic historical-data generator ──────────────────────────────────
// TASE trades Sun–Thu; Fri (5) + Sat (6) are skipped.
function generateDailyData(
  basePrice: number,
  baseYtm: number,
  seed: number,
  days = 90,
): DailyMarketData[] {
  const data: DailyMarketData[] = []
  const start = new Date('2026-02-17')
  for (let i = 0; i < days; i++) {
    const d = new Date(start)
    d.setDate(start.getDate() + i)
    if (d.getDay() === 5 || d.getDay() === 6) continue
    const w1 = Math.sin(i * seed * 0.23 + seed)
    const w2 = Math.cos(i * seed * 0.11 + seed * 2.3)
    const trend = Math.sin(i * 0.04) * 40
    const priceDelta = w1 * 70 + w2 * 35 + trend
    const price = Math.round(basePrice + priceDelta)
    const ytm = Math.max(0.1, Math.round((baseYtm - (priceDelta / basePrice) * baseYtm * 0.45) * 100) / 100)
    const volume = Math.round(400 + Math.abs(w1) * 1800 + Math.abs(w2) * 600)
    data.push({ date: d.toISOString().split('T')[0], priceAgorot: price, ytm, volumeThousands: volume })
  }
  return data
}

// ── Cash-flow helpers ────────────────────────────────────────────────────────
function bulletFlows(dates: string[], couponPct: number): CashFlow[] {
  return dates.map((date, i) => ({
    date, couponPct, status: 'forecast' as const,
    type: i === dates.length - 1 ? 'קופון + פדיון קרן (מלא)' : 'קופון (ריבית)',
    principalPct: i === dates.length - 1 ? 100 : 0,
  }))
}

function amortFlows(dates: string[], couponPct: number, numPrincipalPeriods: number): CashFlow[] {
  const couponOnly = dates.length - numPrincipalPeriods
  const pctPer = Math.round(100 / numPrincipalPeriods)
  return dates.map((date, i) => {
    const isPrincipal = i >= couponOnly
    return {
      date, couponPct, status: 'forecast' as const,
      type: isPrincipal ? 'קופון + תשלום קרן' : 'קופון (ריבית)',
      principalPct: isPrincipal ? pctPer : 0,
    }
  })
}

/** Build cash-flow dates from a "DD/MM" coupon anchor and a "DD/MM/YYYY" maturity date. */
function mkFlows(dayMonth: string, maturityDate: string, couponPct: number, amortLastN = 0): CashFlow[] {
  const matYear = parseInt(maturityDate.split('/')[2])
  const dates: string[] = []
  for (let y = 2026; y <= matYear; y++) dates.push(`${dayMonth}/${y}`)
  return amortLastN === 0 ? bulletFlows(dates, couponPct) : amortFlows(dates, couponPct, amortLastN)
}

// ── Bond definitions ─────────────────────────────────────────────────────────
// GOVT rating (Israel, S&P A+ / Moody's A1 as of PoC simulation)
const GOVT_RATING: CreditRating = { sp: 'A+', moodys: 'A1' }

const _manual: Bond[] = [

  // ═══════════════════════════════ GOVERNMENT – SHEKEL ════════════════════════
  {
    securityId: '1122334', name: 'ממשל שקלי 330', issuerName: 'מדינת ישראל',
    indexingType: 'shekel', issuerType: 'government', interestType: 'fixed',
    couponRate: 4.25, couponSchedule: '31 במרץ בכל שנה',
    maturityDate: '31/03/2030', lastPriceAgorot: 9848, ytm: 4.20, duration: 3.8,
    creditRating: GOVT_RATING,
    dailyData: generateDailyData(9848, 4.20, 1.1),
    cashFlows: mkFlows('31/03', '31/03/2030', 4.25),
  },
  {
    securityId: '2233445', name: 'שחר 532', issuerName: 'מדינת ישראל',
    indexingType: 'shekel', issuerType: 'government', interestType: 'fixed',
    couponRate: 4.50, couponSchedule: '15 ביולי בכל שנה',
    maturityDate: '15/07/2031', lastPriceAgorot: 10210, ytm: 4.45, duration: 5.2,
    creditRating: GOVT_RATING,
    dailyData: generateDailyData(10210, 4.45, 1.7),
    cashFlows: mkFlows('15/07', '15/07/2031', 4.50),
  },
  {
    securityId: '5566001', name: 'שחר 1030', issuerName: 'מדינת ישראל',
    indexingType: 'shekel', issuerType: 'government', interestType: 'fixed',
    couponRate: 3.75, couponSchedule: '31 באוקטובר בכל שנה',
    maturityDate: '31/10/2027', lastPriceAgorot: 9930, ytm: 3.75, duration: 1.5,
    creditRating: GOVT_RATING,
    dailyData: generateDailyData(9930, 3.75, 2.0),
    cashFlows: mkFlows('31/10', '31/10/2027', 3.75),
  },
  {
    securityId: '5577002', name: 'ממשל שקלי 1031', issuerName: 'מדינת ישראל',
    indexingType: 'shekel', issuerType: 'government', interestType: 'fixed',
    couponRate: 4.00, couponSchedule: '28 בפברואר בכל שנה',
    maturityDate: '28/02/2029', lastPriceAgorot: 9980, ytm: 4.00, duration: 2.5,
    creditRating: GOVT_RATING,
    dailyData: generateDailyData(9980, 4.00, 2.6),
    cashFlows: mkFlows('28/02', '28/02/2029', 4.00),
  },
  {
    securityId: '5588003', name: 'שחר 1033', issuerName: 'מדינת ישראל',
    indexingType: 'shekel', issuerType: 'government', interestType: 'fixed',
    couponRate: 4.75, couponSchedule: '15 באפריל בכל שנה',
    maturityDate: '15/04/2033', lastPriceAgorot: 10140, ytm: 4.75, duration: 7.1,
    creditRating: GOVT_RATING,
    dailyData: generateDailyData(10140, 4.75, 3.1),
    cashFlows: mkFlows('15/04', '15/04/2033', 4.75),
  },
  {
    securityId: '5599004', name: 'ממשל שקלי 635', issuerName: 'מדינת ישראל',
    indexingType: 'shekel', issuerType: 'government', interestType: 'fixed',
    couponRate: 5.00, couponSchedule: '30 ביוני בכל שנה',
    maturityDate: '30/06/2035', lastPriceAgorot: 10290, ytm: 5.00, duration: 9.2,
    creditRating: GOVT_RATING,
    dailyData: generateDailyData(10290, 5.00, 3.7),
    cashFlows: mkFlows('30/06', '30/06/2035', 5.00),
  },
  {
    securityId: '6600005', name: 'שחר 826', issuerName: 'מדינת ישראל',
    indexingType: 'shekel', issuerType: 'government', interestType: 'fixed',
    couponRate: 4.25, couponSchedule: '31 באוגוסט בכל שנה',
    maturityDate: '31/08/2029', lastPriceAgorot: 10020, ytm: 4.25, duration: 3.1,
    creditRating: GOVT_RATING,
    dailyData: generateDailyData(10020, 4.25, 4.2),
    cashFlows: mkFlows('31/08', '31/08/2029', 4.25),
  },

  // ═══════════════════════════════ GOVERNMENT – CPI ════════════════════════
  {
    securityId: '3344556', name: 'גליל 5930', issuerName: 'מדינת ישראל',
    indexingType: 'cpi', issuerType: 'government', interestType: 'fixed',
    couponRate: 1.75, couponSchedule: '30 בספטמבר בכל שנה',
    maturityDate: '30/09/2029', lastPriceAgorot: 10385, ytm: 1.85, duration: 4.5,
    creditRating: GOVT_RATING,
    dailyData: generateDailyData(10385, 1.85, 2.3),
    cashFlows: mkFlows('30/09', '30/09/2029', 1.75),
  },
  {
    securityId: '4455667', name: 'גליל 6032', issuerName: 'מדינת ישראל',
    indexingType: 'cpi', issuerType: 'government', interestType: 'fixed',
    couponRate: 2.00, couponSchedule: '31 בינואר בכל שנה',
    maturityDate: '31/01/2032', lastPriceAgorot: 10560, ytm: 2.10, duration: 6.1,
    creditRating: GOVT_RATING,
    dailyData: generateDailyData(10560, 2.10, 3.1),
    cashFlows: mkFlows('31/01', '31/01/2032', 2.00),
  },
  {
    securityId: '6611006', name: 'גליל 5531', issuerName: 'מדינת ישראל',
    indexingType: 'cpi', issuerType: 'government', interestType: 'fixed',
    couponRate: 1.50, couponSchedule: '30 בנובמבר בכל שנה',
    maturityDate: '30/11/2028', lastPriceAgorot: 10215, ytm: 1.50, duration: 2.8,
    creditRating: GOVT_RATING,
    dailyData: generateDailyData(10215, 1.50, 4.8),
    cashFlows: mkFlows('30/11', '30/11/2028', 1.50),
  },
  {
    securityId: '6622007', name: 'גליל 6033', issuerName: 'מדינת ישראל',
    indexingType: 'cpi', issuerType: 'government', interestType: 'fixed',
    couponRate: 2.25, couponSchedule: '31 במרץ בכל שנה',
    maturityDate: '31/03/2033', lastPriceAgorot: 10680, ytm: 2.25, duration: 7.5,
    creditRating: GOVT_RATING,
    dailyData: generateDailyData(10680, 2.25, 5.2),
    cashFlows: mkFlows('31/03', '31/03/2033', 2.25),
  },
  {
    securityId: '6633008', name: 'גליל 5128', issuerName: 'מדינת ישראל',
    indexingType: 'cpi', issuerType: 'government', interestType: 'fixed',
    couponRate: 1.00, couponSchedule: '28 בפברואר בכל שנה',
    maturityDate: '28/02/2027', lastPriceAgorot: 10090, ytm: 1.00, duration: 1.2,
    creditRating: GOVT_RATING,
    dailyData: generateDailyData(10090, 1.00, 5.8),
    cashFlows: mkFlows('28/02', '28/02/2027', 1.00),
  },
  {
    securityId: '6644009', name: 'גליל 6535', issuerName: 'מדינת ישראל',
    indexingType: 'cpi', issuerType: 'government', interestType: 'fixed',
    couponRate: 2.50, couponSchedule: '31 במאי בכל שנה',
    maturityDate: '31/05/2035', lastPriceAgorot: 10840, ytm: 2.50, duration: 9.8,
    creditRating: GOVT_RATING,
    dailyData: generateDailyData(10840, 2.50, 6.3),
    cashFlows: mkFlows('31/05', '31/05/2035', 2.50),
  },

  // ═══════════════════════════════ CORPORATE – CPI ═════════════════════════
  {
    securityId: '5566778', name: 'עזריאלי אגח ח', issuerName: 'קבוצת עזריאלי',
    indexingType: 'cpi', issuerType: 'corporate', interestType: 'fixed',
    couponRate: 3.50, couponSchedule: '15 ביוני בכל שנה',
    maturityDate: '15/06/2032', lastPriceAgorot: 10210, ytm: 2.50, duration: 4.1,
    creditRating: { sp: 'AA-', moodys: 'Aa3' },
    dailyData: generateDailyData(10210, 2.50, 3.9),
    cashFlows: mkFlows('15/06', '15/06/2032', 3.50, 4),
  },
  {
    securityId: '6677889', name: 'מליסרון אגח י', issuerName: 'מליסרון',
    indexingType: 'cpi', issuerType: 'corporate', interestType: 'fixed',
    couponRate: 3.10, couponSchedule: '31 בדצמבר בכל שנה',
    maturityDate: '31/12/2029', lastPriceAgorot: 9975, ytm: 3.10, duration: 3.5,
    creditRating: { sp: 'A', moodys: 'A2' },
    dailyData: generateDailyData(9975, 3.10, 4.5),
    cashFlows: mkFlows('31/12', '31/12/2029', 3.10, 2),
  },
  {
    securityId: '9900112', name: 'סלקום אגח יא', issuerName: 'סלקום ישראל',
    indexingType: 'cpi', issuerType: 'corporate', interestType: 'fixed',
    couponRate: 2.90, couponSchedule: '15 במרץ בכל שנה',
    maturityDate: '15/03/2031', lastPriceAgorot: 10145, ytm: 2.90, duration: 5.1,
    creditRating: { sp: 'BBB+', moodys: 'Baa1' },
    dailyData: generateDailyData(10145, 2.90, 5.7),
    cashFlows: mkFlows('15/03', '15/03/2031', 2.90),
  },
  {
    securityId: '7744009', name: 'בזק אגח יח', issuerName: 'בזק',
    indexingType: 'cpi', issuerType: 'corporate', interestType: 'fixed',
    couponRate: 3.20, couponSchedule: '30 באפריל בכל שנה',
    maturityDate: '30/04/2031', lastPriceAgorot: 10180, ytm: 3.20, duration: 4.8,
    creditRating: { sp: 'BBB+', moodys: 'Baa1' },
    dailyData: generateDailyData(10180, 3.20, 6.4),
    cashFlows: mkFlows('30/04', '30/04/2031', 3.20, 3),
  },
  {
    securityId: '7755010', name: 'רמי לוי אגח ד', issuerName: 'רמי לוי שיווק השקמה',
    indexingType: 'cpi', issuerType: 'corporate', interestType: 'fixed',
    couponRate: 3.50, couponSchedule: '31 ביולי בכל שנה',
    maturityDate: '31/07/2029', lastPriceAgorot: 10055, ytm: 3.50, duration: 3.3,
    creditRating: { sp: 'BBB', moodys: 'Baa2' },
    dailyData: generateDailyData(10055, 3.50, 7.1),
    cashFlows: mkFlows('31/07', '31/07/2029', 3.50, 2),
  },
  {
    securityId: '7766011', name: 'שופרסל אגח יז', issuerName: 'שופרסל',
    indexingType: 'cpi', issuerType: 'corporate', interestType: 'fixed',
    couponRate: 3.80, couponSchedule: '28 בפברואר בכל שנה',
    maturityDate: '28/02/2032', lastPriceAgorot: 10215, ytm: 3.80, duration: 5.2,
    creditRating: { sp: 'BBB+', moodys: 'Baa1' },
    dailyData: generateDailyData(10215, 3.80, 7.6),
    cashFlows: mkFlows('28/02', '28/02/2032', 3.80, 3),
  },
  {
    securityId: '7777012', name: 'אמות אגח יד', issuerName: 'אמות השקעות',
    indexingType: 'cpi', issuerType: 'corporate', interestType: 'fixed',
    couponRate: 2.75, couponSchedule: '31 באוקטובר בכל שנה',
    maturityDate: '31/10/2032', lastPriceAgorot: 10090, ytm: 2.75, duration: 6.1,
    creditRating: { sp: 'A-', moodys: 'A3' },
    dailyData: generateDailyData(10090, 2.75, 8.2),
    cashFlows: mkFlows('31/10', '31/10/2032', 2.75, 4),
  },
  {
    securityId: '7788013', name: 'אלרוב אגח ז', issuerName: 'אלרוב נדלן',
    indexingType: 'cpi', issuerType: 'corporate', interestType: 'fixed',
    couponRate: 3.00, couponSchedule: '30 ביוני בכל שנה',
    maturityDate: '30/06/2030', lastPriceAgorot: 10105, ytm: 3.00, duration: 4.5,
    creditRating: { sp: 'A-', moodys: 'A3' },
    dailyData: generateDailyData(10105, 3.00, 8.8),
    cashFlows: mkFlows('30/06', '30/06/2030', 3.00, 2),
  },
  {
    securityId: '7799014', name: 'חח"י אגח סה', issuerName: 'חברת החשמל לישראל',
    indexingType: 'cpi', issuerType: 'corporate', interestType: 'fixed',
    couponRate: 4.20, couponSchedule: '15 בדצמבר בכל שנה',
    maturityDate: '15/12/2033', lastPriceAgorot: 10430, ytm: 4.20, duration: 8.3,
    creditRating: { sp: 'BBB', moodys: 'Baa2' },
    dailyData: generateDailyData(10430, 4.20, 9.3),
    cashFlows: mkFlows('15/12', '15/12/2033', 4.20, 5),
  },
  {
    securityId: '8800015', name: 'רכבת ישראל אגח ב', issuerName: 'רכבת ישראל',
    indexingType: 'cpi', issuerType: 'corporate', interestType: 'fixed',
    couponRate: 2.50, couponSchedule: '31 באוגוסט בכל שנה',
    maturityDate: '31/08/2031', lastPriceAgorot: 10040, ytm: 2.50, duration: 5.5,
    creditRating: { sp: 'AA', moodys: 'Aa2' },  // government-owned
    dailyData: generateDailyData(10040, 2.50, 9.8),
    cashFlows: mkFlows('31/08', '31/08/2031', 2.50),
  },

  // ═══════════════════════════════ CORPORATE – SHEKEL ══════════════════════
  {
    securityId: '1011223', name: "גב-ים אגח יא", issuerName: "גב-ים לקרקעות",
    indexingType: 'shekel', issuerType: 'corporate', interestType: 'fixed',
    couponRate: 4.80, couponSchedule: '31 באוגוסט בכל שנה',
    maturityDate: '31/08/2029', lastPriceAgorot: 10078, ytm: 4.80, duration: 3.2,
    creditRating: { sp: 'BBB', moodys: 'Baa2' },
    dailyData: generateDailyData(10078, 4.80, 6.3),
    cashFlows: mkFlows('31/08', '31/08/2029', 4.80, 2),
  },
  {
    securityId: '8811016', name: 'דלק קבוצה אגח יב', issuerName: 'דלק קבוצה',
    indexingType: 'shekel', issuerType: 'corporate', interestType: 'fixed',
    couponRate: 5.20, couponSchedule: '31 במרץ בכל שנה',
    maturityDate: '31/03/2030', lastPriceAgorot: 9895, ytm: 5.20, duration: 3.5,
    creditRating: { sp: 'BB+', moodys: 'Ba1' },
    dailyData: generateDailyData(9895, 5.20, 10.4),
    cashFlows: mkFlows('31/03', '31/03/2030', 5.20, 2),
  },
  {
    securityId: '8822017', name: 'פלאפון אגח ג', issuerName: 'פלאפון תקשורת',
    indexingType: 'shekel', issuerType: 'corporate', interestType: 'fixed',
    couponRate: 4.90, couponSchedule: '30 בנובמבר בכל שנה',
    maturityDate: '30/11/2030', lastPriceAgorot: 9950, ytm: 4.90, duration: 4.2,
    creditRating: { sp: 'BBB', moodys: 'Baa2' },
    dailyData: generateDailyData(9950, 4.90, 10.9),
    cashFlows: mkFlows('30/11', '30/11/2030', 4.90, 2),
  },
  {
    securityId: '8833018', name: 'HOT אגח יז', issuerName: 'HOT טלקום',
    indexingType: 'shekel', issuerType: 'corporate', interestType: 'fixed',
    couponRate: 5.10, couponSchedule: '28 בפברואר בכל שנה',
    maturityDate: '28/02/2029', lastPriceAgorot: 9900, ytm: 5.10, duration: 2.9,
    creditRating: { sp: 'BB+', moodys: 'Ba1' },
    dailyData: generateDailyData(9900, 5.10, 11.5),
    cashFlows: mkFlows('28/02', '28/02/2029', 5.10, 2),
  },
  {
    securityId: '8844019', name: 'בינלאומי אגח יח', issuerName: 'בנק הבינלאומי',
    indexingType: 'shekel', issuerType: 'corporate', interestType: 'fixed',
    couponRate: 4.70, couponSchedule: '15 בספטמבר בכל שנה',
    maturityDate: '15/09/2031', lastPriceAgorot: 9990, ytm: 4.70, duration: 5.8,
    creditRating: { sp: 'A', moodys: 'A2' },
    dailyData: generateDailyData(9990, 4.70, 12.0),
    cashFlows: mkFlows('15/09', '15/09/2031', 4.70),
  },
  {
    securityId: '8855020', name: 'מזרחי-טפחות אגח יג', issuerName: 'בנק מזרחי-טפחות',
    indexingType: 'shekel', issuerType: 'corporate', interestType: 'fixed',
    couponRate: 4.60, couponSchedule: '31 בדצמבר בכל שנה',
    maturityDate: '31/12/2029', lastPriceAgorot: 10010, ytm: 4.60, duration: 3.7,
    creditRating: { sp: 'A+', moodys: 'A1' },
    dailyData: generateDailyData(10010, 4.60, 12.5),
    cashFlows: mkFlows('31/12', '31/12/2029', 4.60),
  },
  {
    securityId: '8866021', name: "כי\"ל אגח ח", issuerName: 'כימיקלים לישראל',
    indexingType: 'shekel', issuerType: 'corporate', interestType: 'fixed',
    couponRate: 5.40, couponSchedule: '30 ביוני בכל שנה',
    maturityDate: '30/06/2030', lastPriceAgorot: 9860, ytm: 5.40, duration: 4.1,
    creditRating: { sp: 'BBB+', moodys: 'Baa1' },
    dailyData: generateDailyData(9860, 5.40, 13.0),
    cashFlows: mkFlows('30/06', '30/06/2030', 5.40, 2),
  },

  // ── HIGH YIELD ⚠ (YTM > 5.5%) ────────────────────────────────────────────
  {
    securityId: '8877022', name: 'אלון רבוע כחול אגח ה', issuerName: 'אלון רבוע כחול',
    indexingType: 'shekel', issuerType: 'corporate', interestType: 'fixed',
    couponRate: 5.60, couponSchedule: '31 בינואר בכל שנה',
    maturityDate: '31/01/2029', lastPriceAgorot: 9820, ytm: 5.60, duration: 3.2,
    creditRating: { sp: 'BB+', moodys: 'Ba1' },
    dailyData: generateDailyData(9820, 5.60, 13.6),
    cashFlows: mkFlows('31/01', '31/01/2029', 5.60, 2),
  },
  {
    securityId: '7788990', name: 'טבע אגח יז', issuerName: 'טבע תעשיות',
    indexingType: 'shekel', issuerType: 'corporate', interestType: 'fixed',
    couponRate: 5.60, couponSchedule: '30 ביוני בכל שנה',
    maturityDate: '30/06/2028', lastPriceAgorot: 9640, ytm: 5.80, duration: 2.8,
    creditRating: { sp: 'BB+', moodys: 'Ba1' },
    dailyData: generateDailyData(9640, 5.80, 7.1),
    cashFlows: mkFlows('30/06', '30/06/2028', 5.60),
  },
  {
    securityId: '8899001', name: 'אפריקה ישראל אגח ו', issuerName: 'אפריקה ישראל',
    indexingType: 'shekel', issuerType: 'corporate', interestType: 'fixed',
    couponRate: 6.00, couponSchedule: '28 בפברואר בכל שנה',
    maturityDate: '28/02/2030', lastPriceAgorot: 9560, ytm: 6.20, duration: 4.5,
    creditRating: { sp: 'BB-', moodys: 'Ba3' },
    dailyData: generateDailyData(9560, 6.20, 8.9),
    cashFlows: mkFlows('28/02', '28/02/2030', 6.00, 3),
  },
  {
    securityId: '8888023', name: 'נייר חדרה אגח ג', issuerName: 'ניר חדרה',
    indexingType: 'shekel', issuerType: 'corporate', interestType: 'fixed',
    couponRate: 6.50, couponSchedule: '30 בספטמבר בכל שנה',
    maturityDate: '30/09/2028', lastPriceAgorot: 9480, ytm: 6.80, duration: 2.5,
    creditRating: { sp: 'B+', moodys: 'B1' },
    dailyData: generateDailyData(9480, 6.80, 14.2),
    cashFlows: mkFlows('30/09', '30/09/2028', 6.50),
  },
  {
    securityId: '9900025', name: 'ורידיס אגח ב', issuerName: 'ורידיס שירותי איכות הסביבה',
    indexingType: 'shekel', issuerType: 'corporate', interestType: 'fixed',
    couponRate: 7.00, couponSchedule: '31 במרץ בכל שנה',
    maturityDate: '31/03/2030', lastPriceAgorot: 9390, ytm: 7.20, duration: 3.8,
    creditRating: { sp: 'B', moodys: 'B2' },
    dailyData: generateDailyData(9390, 7.20, 14.8),
    cashFlows: mkFlows('31/03', '31/03/2030', 7.00, 2),
  },

  // ═══════════════════════════════ BATCH 2 – GOVERNMENT SHEKEL ════════════
  {
    securityId: '1133344', name: 'ממשל שקלי 732', issuerName: 'מדינת ישראל',
    indexingType: 'shekel', issuerType: 'government', interestType: 'fixed',
    couponRate: 3.50, couponSchedule: '31 בדצמבר בכל שנה',
    maturityDate: '31/12/2026', lastPriceAgorot: 9970, ytm: 3.50, duration: 0.8,
    creditRating: { sp: 'A+', moodys: 'A1' },
    dailyData: generateDailyData(9970, 3.50, 15.2),
    cashFlows: mkFlows('31/12', '31/12/2026', 3.50),
  },
  {
    securityId: '2244455', name: 'שחר 534', issuerName: 'מדינת ישראל',
    indexingType: 'shekel', issuerType: 'government', interestType: 'fixed',
    couponRate: 4.25, couponSchedule: '30 ביוני בכל שנה',
    maturityDate: '30/06/2027', lastPriceAgorot: 9990, ytm: 4.25, duration: 1.2,
    creditRating: { sp: 'A+', moodys: 'A1' },
    dailyData: generateDailyData(9990, 4.25, 15.7),
    cashFlows: mkFlows('30/06', '30/06/2027', 4.25),
  },
  {
    securityId: '3355566', name: 'ממשל שקלי 1234', issuerName: 'מדינת ישראל',
    indexingType: 'shekel', issuerType: 'government', interestType: 'fixed',
    couponRate: 4.50, couponSchedule: '31 במאי בכל שנה',
    maturityDate: '31/05/2030', lastPriceAgorot: 10060, ytm: 4.50, duration: 4.1,
    creditRating: { sp: 'A+', moodys: 'A1' },
    dailyData: generateDailyData(10060, 4.50, 16.1),
    cashFlows: mkFlows('31/05', '31/05/2030', 4.50),
  },
  {
    securityId: '4466677', name: 'שחר 137', issuerName: 'מדינת ישראל',
    indexingType: 'shekel', issuerType: 'government', interestType: 'fixed',
    couponRate: 3.25, couponSchedule: '28 בפברואר בכל שנה',
    maturityDate: '28/02/2027', lastPriceAgorot: 9960, ytm: 3.25, duration: 1.0,
    creditRating: { sp: 'A+', moodys: 'A1' },
    dailyData: generateDailyData(9960, 3.25, 16.5),
    cashFlows: mkFlows('28/02', '28/02/2027', 3.25),
  },
  {
    securityId: '5577788', name: 'ממשל שקלי 939', issuerName: 'מדינת ישראל',
    indexingType: 'shekel', issuerType: 'government', interestType: 'fixed',
    couponRate: 4.75, couponSchedule: '30 בספטמבר בכל שנה',
    maturityDate: '30/09/2032', lastPriceAgorot: 10190, ytm: 4.75, duration: 6.5,
    creditRating: { sp: 'A+', moodys: 'A1' },
    dailyData: generateDailyData(10190, 4.75, 17.0),
    cashFlows: mkFlows('30/09', '30/09/2032', 4.75),
  },
  {
    securityId: '6688899', name: 'שחר 840', issuerName: 'מדינת ישראל',
    indexingType: 'shekel', issuerType: 'government', interestType: 'fixed',
    couponRate: 5.25, couponSchedule: '31 באוגוסט בכל שנה',
    maturityDate: '31/08/2034', lastPriceAgorot: 10380, ytm: 5.25, duration: 8.8,
    creditRating: { sp: 'A+', moodys: 'A1' },
    dailyData: generateDailyData(10380, 5.25, 17.4),
    cashFlows: mkFlows('31/08', '31/08/2034', 5.25),
  },
  {
    securityId: '7799900', name: 'ממשל שקלי 436', issuerName: 'מדינת ישראל',
    indexingType: 'shekel', issuerType: 'government', interestType: 'fixed',
    couponRate: 4.00, couponSchedule: '30 באפריל בכל שנה',
    maturityDate: '30/04/2028', lastPriceAgorot: 10000, ytm: 4.00, duration: 2.0,
    creditRating: { sp: 'A+', moodys: 'A1' },
    dailyData: generateDailyData(10000, 4.00, 17.9),
    cashFlows: mkFlows('30/04', '30/04/2028', 4.00),
  },
  {
    securityId: '8810011', name: 'שחר 638', issuerName: 'מדינת ישראל',
    indexingType: 'shekel', issuerType: 'government', interestType: 'fixed',
    couponRate: 4.50, couponSchedule: '30 ביוני בכל שנה',
    maturityDate: '30/06/2031', lastPriceAgorot: 10120, ytm: 4.50, duration: 5.5,
    creditRating: { sp: 'A+', moodys: 'A1' },
    dailyData: generateDailyData(10120, 4.50, 18.3),
    cashFlows: mkFlows('30/06', '30/06/2031', 4.50),
  },

  // ═══════════════════════════════ BATCH 2 – GOVERNMENT CPI ════════════════
  {
    securityId: '9911122', name: 'גליל 7036', issuerName: 'מדינת ישראל',
    indexingType: 'cpi', issuerType: 'government', interestType: 'fixed',
    couponRate: 2.75, couponSchedule: '31 בדצמבר בכל שנה',
    maturityDate: '31/12/2036', lastPriceAgorot: 11050, ytm: 2.75, duration: 10.5,
    creditRating: { sp: 'A+', moodys: 'A1' },
    dailyData: generateDailyData(11050, 2.75, 18.7),
    cashFlows: mkFlows('31/12', '31/12/2036', 2.75),
  },
  {
    securityId: '1022233', name: 'גליל 5427', issuerName: 'מדינת ישראל',
    indexingType: 'cpi', issuerType: 'government', interestType: 'fixed',
    couponRate: 1.25, couponSchedule: '31 ביולי בכל שנה',
    maturityDate: '31/07/2027', lastPriceAgorot: 10140, ytm: 1.25, duration: 1.5,
    creditRating: { sp: 'A+', moodys: 'A1' },
    dailyData: generateDailyData(10140, 1.25, 19.1),
    cashFlows: mkFlows('31/07', '31/07/2027', 1.25),
  },
  {
    securityId: '3044455', name: 'גליל 5829', issuerName: 'מדינת ישראל',
    indexingType: 'cpi', issuerType: 'government', interestType: 'fixed',
    couponRate: 2.00, couponSchedule: '31 במרץ בכל שנה',
    maturityDate: '31/03/2029', lastPriceAgorot: 10330, ytm: 2.00, duration: 3.2,
    creditRating: { sp: 'A+', moodys: 'A1' },
    dailyData: generateDailyData(10330, 2.00, 19.5),
    cashFlows: mkFlows('31/03', '31/03/2029', 2.00),
  },
  {
    securityId: '4055566', name: 'גליל 6434', issuerName: 'מדינת ישראל',
    indexingType: 'cpi', issuerType: 'government', interestType: 'fixed',
    couponRate: 2.25, couponSchedule: '30 באפריל בכל שנה',
    maturityDate: '30/04/2034', lastPriceAgorot: 10720, ytm: 2.25, duration: 8.5,
    creditRating: { sp: 'A+', moodys: 'A1' },
    dailyData: generateDailyData(10720, 2.25, 19.9),
    cashFlows: mkFlows('30/04', '30/04/2034', 2.25),
  },
  {
    securityId: '5066677', name: 'גליל 5127', issuerName: 'מדינת ישראל',
    indexingType: 'cpi', issuerType: 'government', interestType: 'fixed',
    couponRate: 1.50, couponSchedule: '31 בינואר בכל שנה',
    maturityDate: '31/01/2028', lastPriceAgorot: 10220, ytm: 1.50, duration: 2.2,
    creditRating: { sp: 'A+', moodys: 'A1' },
    dailyData: generateDailyData(10220, 1.50, 20.3),
    cashFlows: mkFlows('31/01', '31/01/2028', 1.50),
  },

  // ═══════════════════════════════ BATCH 2 – CORPORATE CPI ═════════════════
  {
    securityId: '6077788', name: 'ביג אגח יב', issuerName: 'ביג מרכזי קניות',
    indexingType: 'cpi', issuerType: 'corporate', interestType: 'fixed',
    couponRate: 3.40, couponSchedule: '30 בנובמבר בכל שנה',
    maturityDate: '30/11/2030', lastPriceAgorot: 10170, ytm: 3.40, duration: 4.9,
    creditRating: { sp: 'A-', moodys: 'A3' },
    dailyData: generateDailyData(10170, 3.40, 20.7),
    cashFlows: mkFlows('30/11', '30/11/2030', 3.40, 3),
  },
  {
    securityId: '7088899', name: 'מגדל ביטוח אגח יד', issuerName: 'מגדל ביטוח',
    indexingType: 'cpi', issuerType: 'corporate', interestType: 'fixed',
    couponRate: 3.00, couponSchedule: '31 בינואר בכל שנה',
    maturityDate: '31/01/2032', lastPriceAgorot: 10080, ytm: 3.00, duration: 5.2,
    creditRating: { sp: 'A', moodys: 'A2' },
    dailyData: generateDailyData(10080, 3.00, 21.0),
    cashFlows: mkFlows('31/01', '31/01/2032', 3.00, 3),
  },
  {
    securityId: '8099900', name: 'הפניקס אגח ח', issuerName: 'הפניקס ביטוח',
    indexingType: 'cpi', issuerType: 'corporate', interestType: 'fixed',
    couponRate: 3.20, couponSchedule: '30 ביוני בכל שנה',
    maturityDate: '30/06/2031', lastPriceAgorot: 10130, ytm: 3.20, duration: 4.6,
    creditRating: { sp: 'A', moodys: 'A2' },
    dailyData: generateDailyData(10130, 3.20, 21.4),
    cashFlows: mkFlows('30/06', '30/06/2031', 3.20, 2),
  },
  {
    securityId: '9000011', name: 'כלל ביטוח אגח יב', issuerName: 'כלל ביטוח',
    indexingType: 'cpi', issuerType: 'corporate', interestType: 'fixed',
    couponRate: 2.80, couponSchedule: '31 בדצמבר בכל שנה',
    maturityDate: '31/12/2030', lastPriceAgorot: 10050, ytm: 2.80, duration: 3.9,
    creditRating: { sp: 'A-', moodys: 'A3' },
    dailyData: generateDailyData(10050, 2.80, 21.8),
    cashFlows: mkFlows('31/12', '31/12/2030', 2.80, 2),
  },
  {
    securityId: '1011332', name: 'מנורה מבטחים אגח י', issuerName: 'מנורה מבטחים',
    indexingType: 'cpi', issuerType: 'corporate', interestType: 'fixed',
    couponRate: 2.60, couponSchedule: '31 ביולי בכל שנה',
    maturityDate: '31/07/2032', lastPriceAgorot: 10020, ytm: 2.60, duration: 6.3,
    creditRating: { sp: 'A', moodys: 'A2' },
    dailyData: generateDailyData(10020, 2.60, 22.2),
    cashFlows: mkFlows('31/07', '31/07/2032', 2.60, 4),
  },
  {
    securityId: '2022443', name: 'שיכון ובינוי אגח ח', issuerName: 'שיכון ובינוי',
    indexingType: 'cpi', issuerType: 'corporate', interestType: 'fixed',
    couponRate: 3.60, couponSchedule: '28 בפברואר בכל שנה',
    maturityDate: '28/02/2030', lastPriceAgorot: 10195, ytm: 3.60, duration: 4.2,
    creditRating: { sp: 'BBB+', moodys: 'Baa1' },
    dailyData: generateDailyData(10195, 3.60, 22.6),
    cashFlows: mkFlows('28/02', '28/02/2030', 3.60, 2),
  },
  {
    securityId: '3033554', name: 'אשטרום קבוצה אגח ה', issuerName: 'אשטרום קבוצה',
    indexingType: 'cpi', issuerType: 'corporate', interestType: 'fixed',
    couponRate: 3.80, couponSchedule: '30 בספטמבר בכל שנה',
    maturityDate: '30/09/2029', lastPriceAgorot: 10210, ytm: 3.80, duration: 3.7,
    creditRating: { sp: 'BBB+', moodys: 'Baa1' },
    dailyData: generateDailyData(10210, 3.80, 23.0),
    cashFlows: mkFlows('30/09', '30/09/2029', 3.80, 2),
  },
  {
    securityId: '4044665', name: 'בריטיש ישראל אגח יג', issuerName: 'בריטיש ישראל',
    indexingType: 'cpi', issuerType: 'corporate', interestType: 'fixed',
    couponRate: 3.30, couponSchedule: '30 באפריל בכל שנה',
    maturityDate: '30/04/2032', lastPriceAgorot: 10145, ytm: 3.30, duration: 5.8,
    creditRating: { sp: 'A-', moodys: 'A3' },
    dailyData: generateDailyData(10145, 3.30, 23.4),
    cashFlows: mkFlows('30/04', '30/04/2032', 3.30, 3),
  },
  {
    securityId: '5055776', name: 'ישרס אגח יב', issuerName: 'ישרס',
    indexingType: 'cpi', issuerType: 'corporate', interestType: 'fixed',
    couponRate: 4.00, couponSchedule: '30 ביוני בכל שנה',
    maturityDate: '30/06/2031', lastPriceAgorot: 10240, ytm: 4.00, duration: 5.5,
    creditRating: { sp: 'BBB', moodys: 'Baa2' },
    dailyData: generateDailyData(10240, 4.00, 23.8),
    cashFlows: mkFlows('30/06', '30/06/2031', 4.00, 3),
  },
  {
    securityId: '6066887', name: 'שופרסל אגח יח', issuerName: 'שופרסל',
    indexingType: 'cpi', issuerType: 'corporate', interestType: 'fixed',
    couponRate: 3.70, couponSchedule: '31 באוגוסט בכל שנה',
    maturityDate: '31/08/2032', lastPriceAgorot: 10205, ytm: 3.70, duration: 6.0,
    creditRating: { sp: 'BBB+', moodys: 'Baa1' },
    dailyData: generateDailyData(10205, 3.70, 24.2),
    cashFlows: mkFlows('31/08', '31/08/2032', 3.70, 3),
  },
  {
    securityId: '7077998', name: 'בזק אגח יט', issuerName: 'בזק',
    indexingType: 'cpi', issuerType: 'corporate', interestType: 'fixed',
    couponRate: 3.40, couponSchedule: '31 במרץ בכל שנה',
    maturityDate: '31/03/2030', lastPriceAgorot: 10160, ytm: 3.40, duration: 3.5,
    creditRating: { sp: 'BBB+', moodys: 'Baa1' },
    dailyData: generateDailyData(10160, 3.40, 24.6),
    cashFlows: mkFlows('31/03', '31/03/2030', 3.40, 2),
  },
  {
    securityId: '8088009', name: 'סלקום אגח יב', issuerName: 'סלקום ישראל',
    indexingType: 'cpi', issuerType: 'corporate', interestType: 'fixed',
    couponRate: 3.10, couponSchedule: '30 בנובמבר בכל שנה',
    maturityDate: '30/11/2030', lastPriceAgorot: 10100, ytm: 3.10, duration: 4.3,
    creditRating: { sp: 'BBB+', moodys: 'Baa1' },
    dailyData: generateDailyData(10100, 3.10, 25.0),
    cashFlows: mkFlows('30/11', '30/11/2030', 3.10, 2),
  },
  {
    securityId: '9099110', name: 'אמות השקעות אגח טז', issuerName: 'אמות השקעות',
    indexingType: 'cpi', issuerType: 'corporate', interestType: 'fixed',
    couponRate: 2.90, couponSchedule: '31 בינואר בכל שנה',
    maturityDate: '31/01/2033', lastPriceAgorot: 10070, ytm: 2.90, duration: 7.1,
    creditRating: { sp: 'A-', moodys: 'A3' },
    dailyData: generateDailyData(10070, 2.90, 25.4),
    cashFlows: mkFlows('31/01', '31/01/2033', 2.90, 4),
  },
  {
    securityId: '1100221', name: 'HOT אגח יח', issuerName: 'HOT טלקום',
    indexingType: 'cpi', issuerType: 'corporate', interestType: 'fixed',
    couponRate: 3.90, couponSchedule: '30 בספטמבר בכל שנה',
    maturityDate: '30/09/2031', lastPriceAgorot: 10225, ytm: 3.90, duration: 5.1,
    creditRating: { sp: 'BBB-', moodys: 'Baa3' },
    dailyData: generateDailyData(10225, 3.90, 25.8),
    cashFlows: mkFlows('30/09', '30/09/2031', 3.90, 3),
  },

  // ═══════════════════════════════ BATCH 2 – CORPORATE SHEKEL ══════════════
  {
    securityId: '2111332', name: "כי\"ל אגח ט", issuerName: 'כימיקלים לישראל',
    indexingType: 'shekel', issuerType: 'corporate', interestType: 'fixed',
    couponRate: 5.30, couponSchedule: '31 במרץ בכל שנה',
    maturityDate: '31/03/2030', lastPriceAgorot: 9880, ytm: 5.30, duration: 3.5,
    creditRating: { sp: 'BBB+', moodys: 'Baa1' },
    dailyData: generateDailyData(9880, 5.30, 26.2),
    cashFlows: mkFlows('31/03', '31/03/2030', 5.30, 2),
  },
  {
    securityId: '3122443', name: 'שטראוס אגח ה', issuerName: 'שטראוס גרופ',
    indexingType: 'shekel', issuerType: 'corporate', interestType: 'fixed',
    couponRate: 4.60, couponSchedule: '30 ביוני בכל שנה',
    maturityDate: '30/06/2030', lastPriceAgorot: 9995, ytm: 4.60, duration: 4.0,
    creditRating: { sp: 'A-', moodys: 'A3' },
    dailyData: generateDailyData(9995, 4.60, 26.6),
    cashFlows: mkFlows('30/06', '30/06/2030', 4.60, 2),
  },
  {
    securityId: '4133554', name: "אלקטרה נד\"ל אגח ז", issuerName: 'אלקטרה נדלן',
    indexingType: 'shekel', issuerType: 'corporate', interestType: 'fixed',
    couponRate: 4.80, couponSchedule: '30 בנובמבר בכל שנה',
    maturityDate: '30/11/2029', lastPriceAgorot: 9960, ytm: 4.80, duration: 3.8,
    creditRating: { sp: 'BBB+', moodys: 'Baa1' },
    dailyData: generateDailyData(9960, 4.80, 27.0),
    cashFlows: mkFlows('30/11', '30/11/2029', 4.80, 2),
  },
  {
    securityId: '5144665', name: 'כלכלית ירושלים אגח ח', issuerName: 'כלכלית ירושלים',
    indexingType: 'shekel', issuerType: 'corporate', interestType: 'fixed',
    couponRate: 5.10, couponSchedule: '31 ביולי בכל שנה',
    maturityDate: '31/07/2031', lastPriceAgorot: 9910, ytm: 5.10, duration: 5.2,
    creditRating: { sp: 'BBB', moodys: 'Baa2' },
    dailyData: generateDailyData(9910, 5.10, 27.4),
    cashFlows: mkFlows('31/07', '31/07/2031', 5.10, 3),
  },
  {
    securityId: '6155776', name: 'אורמת תעשיות אגח ב', issuerName: 'אורמת תעשיות',
    indexingType: 'shekel', issuerType: 'corporate', interestType: 'fixed',
    couponRate: 4.40, couponSchedule: '28 בפברואר בכל שנה',
    maturityDate: '28/02/2032', lastPriceAgorot: 10025, ytm: 4.40, duration: 6.1,
    creditRating: { sp: 'BBB+', moodys: 'Baa1' },
    dailyData: generateDailyData(10025, 4.40, 27.8),
    cashFlows: mkFlows('28/02', '28/02/2032', 4.40, 3),
  },
  {
    securityId: '7166887', name: 'מגה-אור אגח ג', issuerName: 'מגה-אור',
    indexingType: 'shekel', issuerType: 'corporate', interestType: 'fixed',
    couponRate: 5.00, couponSchedule: '31 באוגוסט בכל שנה',
    maturityDate: '31/08/2029', lastPriceAgorot: 9940, ytm: 5.00, duration: 3.1,
    creditRating: { sp: 'BBB', moodys: 'Baa2' },
    dailyData: generateDailyData(9940, 5.00, 28.2),
    cashFlows: mkFlows('31/08', '31/08/2029', 5.00, 2),
  },
  {
    securityId: '8177998', name: 'פריגו ישראל אגח א', issuerName: 'פריגו ישראל',
    indexingType: 'shekel', issuerType: 'corporate', interestType: 'fixed',
    couponRate: 5.30, couponSchedule: '30 באפריל בכל שנה',
    maturityDate: '30/04/2031', lastPriceAgorot: 9870, ytm: 5.30, duration: 4.5,
    creditRating: { sp: 'BBB-', moodys: 'Baa3' },
    dailyData: generateDailyData(9870, 5.30, 28.6),
    cashFlows: mkFlows('30/04', '30/04/2031', 5.30, 3),
  },
  {
    securityId: '9188009', name: 'הפועלים אגח יב', issuerName: 'בנק הפועלים',
    indexingType: 'shekel', issuerType: 'corporate', interestType: 'fixed',
    couponRate: 4.30, couponSchedule: '31 בדצמבר בכל שנה',
    maturityDate: '31/12/2030', lastPriceAgorot: 10040, ytm: 4.30, duration: 3.9,
    creditRating: { sp: 'A+', moodys: 'A1' },
    dailyData: generateDailyData(10040, 4.30, 29.0),
    cashFlows: mkFlows('31/12', '31/12/2030', 4.30),
  },
  {
    securityId: '1199110', name: 'לאומי אגח טז', issuerName: 'בנק לאומי',
    indexingType: 'shekel', issuerType: 'corporate', interestType: 'fixed',
    couponRate: 4.20, couponSchedule: '30 ביוני בכל שנה',
    maturityDate: '30/06/2031', lastPriceAgorot: 10030, ytm: 4.20, duration: 5.1,
    creditRating: { sp: 'A+', moodys: 'A1' },
    dailyData: generateDailyData(10030, 4.20, 29.4),
    cashFlows: mkFlows('30/06', '30/06/2031', 4.20),
  },
  {
    securityId: '2200221', name: 'דיסקונט אגח ח', issuerName: 'בנק דיסקונט',
    indexingType: 'shekel', issuerType: 'corporate', interestType: 'fixed',
    couponRate: 4.35, couponSchedule: '31 במרץ בכל שנה',
    maturityDate: '31/03/2030', lastPriceAgorot: 10018, ytm: 4.35, duration: 4.7,
    creditRating: { sp: 'A', moodys: 'A2' },
    dailyData: generateDailyData(10018, 4.35, 29.8),
    cashFlows: mkFlows('31/03', '31/03/2030', 4.35),
  },
  {
    securityId: '3211332', name: 'ויזה כ.א.ל אגח ב', issuerName: 'כ.א.ל כרטיסי אשראי',
    indexingType: 'shekel', issuerType: 'corporate', interestType: 'fixed',
    couponRate: 4.55, couponSchedule: '30 בספטמבר בכל שנה',
    maturityDate: '30/09/2029', lastPriceAgorot: 10008, ytm: 4.55, duration: 3.6,
    creditRating: { sp: 'A', moodys: 'A2' },
    dailyData: generateDailyData(10008, 4.55, 30.2),
    cashFlows: mkFlows('30/09', '30/09/2029', 4.55),
  },
  {
    securityId: '4222443', name: 'מזרחי-טפחות אגח יד', issuerName: 'בנק מזרחי-טפחות',
    indexingType: 'shekel', issuerType: 'corporate', interestType: 'fixed',
    couponRate: 4.40, couponSchedule: '31 במאי בכל שנה',
    maturityDate: '31/05/2028', lastPriceAgorot: 10012, ytm: 4.40, duration: 2.8,
    creditRating: { sp: 'A+', moodys: 'A1' },
    dailyData: generateDailyData(10012, 4.40, 30.6),
    cashFlows: mkFlows('31/05', '31/05/2028', 4.40),
  },

  // ── BATCH 2 HIGH YIELD ⚠ ─────────────────────────────────────────────────
  {
    securityId: '5233554', name: 'אפריקה ישראל אגח ז', issuerName: 'אפריקה ישראל',
    indexingType: 'shekel', issuerType: 'corporate', interestType: 'fixed',
    couponRate: 6.30, couponSchedule: '31 במרץ בכל שנה',
    maturityDate: '31/03/2029', lastPriceAgorot: 9510, ytm: 6.40, duration: 3.1,
    creditRating: { sp: 'BB-', moodys: 'Ba3' },
    dailyData: generateDailyData(9510, 6.40, 31.0),
    cashFlows: mkFlows('31/03', '31/03/2029', 6.30, 2),
  },
  {
    securityId: '6244665', name: 'דור אלון אגח יד', issuerName: 'דור אלון אנרגיה',
    indexingType: 'shekel', issuerType: 'corporate', interestType: 'fixed',
    couponRate: 5.70, couponSchedule: '30 ביוני בכל שנה',
    maturityDate: '30/06/2031', lastPriceAgorot: 9710, ytm: 5.70, duration: 4.8,
    creditRating: { sp: 'BB', moodys: 'Ba2' },
    dailyData: generateDailyData(9710, 5.70, 31.4),
    cashFlows: mkFlows('30/06', '30/06/2031', 5.70, 3),
  },
  {
    securityId: '7255776', name: 'מבני תעשיה אגח יב', issuerName: 'מבני תעשיה',
    indexingType: 'shekel', issuerType: 'corporate', interestType: 'fixed',
    couponRate: 5.80, couponSchedule: '31 באוגוסט בכל שנה',
    maturityDate: '31/08/2029', lastPriceAgorot: 9680, ytm: 5.80, duration: 3.4,
    creditRating: { sp: 'BB+', moodys: 'Ba1' },
    dailyData: generateDailyData(9680, 5.80, 31.8),
    cashFlows: mkFlows('31/08', '31/08/2029', 5.80, 2),
  },
  {
    securityId: '8266887', name: 'דלק נדלן אגח ו', issuerName: 'דלק נדלן',
    indexingType: 'shekel', issuerType: 'corporate', interestType: 'fixed',
    couponRate: 6.10, couponSchedule: '31 בדצמבר בכל שנה',
    maturityDate: '31/12/2028', lastPriceAgorot: 9540, ytm: 6.10, duration: 2.9,
    creditRating: { sp: 'BB', moodys: 'Ba2' },
    dailyData: generateDailyData(9540, 6.10, 32.2),
    cashFlows: mkFlows('31/12', '31/12/2028', 6.10, 2),
  },
  {
    securityId: '9277998', name: 'אינטר ביח אגח יד', issuerName: 'אינטר ביח',
    indexingType: 'shekel', issuerType: 'corporate', interestType: 'fixed',
    couponRate: 7.50, couponSchedule: '30 בספטמבר בכל שנה',
    maturityDate: '30/09/2027', lastPriceAgorot: 9320, ytm: 7.80, duration: 1.8,
    creditRating: { sp: 'B+', moodys: 'B1' },
    dailyData: generateDailyData(9320, 7.80, 32.6),
    cashFlows: mkFlows('30/09', '30/09/2027', 7.50),
  },
  {
    securityId: '1288009', name: 'גולדן ארץ אגח ג', issuerName: 'גולדן ארץ',
    indexingType: 'shekel', issuerType: 'corporate', interestType: 'fixed',
    couponRate: 8.00, couponSchedule: '30 ביוני בכל שנה',
    maturityDate: '30/06/2028', lastPriceAgorot: 9250, ytm: 8.30, duration: 2.3,
    creditRating: { sp: 'B', moodys: 'B2' },
    dailyData: generateDailyData(9250, 8.30, 33.0),
    cashFlows: mkFlows('30/06', '30/06/2028', 8.00),
  },
]

// ── Programmatic bond generator (800 + bonds total) ─────────────────────────
const _SER = ['א','ב','ג','ד','ה','ו','ז','ח','ט','י','יא','יב']
const _DM  = ['31/01','28/02','31/03','30/04','31/05','30/06','31/07','31/08','30/09','31/10','30/11','31/12']
const _MHE: Record<string,string> = {
  '01':'ינואר','02':'פברואר','03':'מרץ','04':'אפריל',
  '05':'מאי',  '06':'יוני',  '07':'יולי','08':'אוגוסט',
  '09':'ספטמבר','10':'אוקטובר','11':'נובמבר','12':'דצמבר',
}
// 12 maturity years – used round-robin per series index
const _YR = [2027,2028,2028,2029,2029,2030,2030,2031,2032,2033,2035,2037]

interface IssSpec { n:string; sp:string; mo:string; cy:number; sy:number }
// cy = base CPI ytm (0 = shekel-only issuer), sy = base shekel ytm
const _ISSUERS: IssSpec[] = [
  // ── Real estate ────────────────────────────────────────────────────────────
  { n:'קבוצת נצבא',    sp:'AA-',  mo:'Aa3',  cy:2.4, sy:4.7 },
  { n:'ארקד נדלן',     sp:'A+',   mo:'A1',   cy:2.6, sy:4.9 },
  { n:'קנדה ישראל',    sp:'A',    mo:'A2',   cy:2.8, sy:5.0 },
  { n:'גינדי',         sp:'A',    mo:'A2',   cy:3.0, sy:5.1 },
  { n:'ריאליטי',       sp:'A-',   mo:'A3',   cy:3.1, sy:5.2 },
  { n:'עופר השקעות',   sp:'BBB+', mo:'Baa1', cy:3.3, sy:5.3 },
  { n:'חוסן ישראל',    sp:'BBB+', mo:'Baa1', cy:3.4, sy:5.4 },
  { n:'ספיר קורפ',     sp:'BBB',  mo:'Baa2', cy:3.5, sy:5.5 },
  { n:'יוחננוף',       sp:'BBB',  mo:'Baa2', cy:3.6, sy:5.5 },
  { n:'אי.די.בי נכסים',sp:'BBB-', mo:'Baa3', cy:3.8, sy:5.7 },
  { n:'קרסו נדלן',     sp:'A-',   mo:'A3',   cy:3.0, sy:5.2 },
  { n:'ארגו',          sp:'BBB+', mo:'Baa1', cy:3.4, sy:5.3 },
  { n:'רמות',          sp:'BBB',  mo:'Baa2', cy:3.5, sy:5.4 },
  { n:'מגוריט',        sp:'A',    mo:'A2',   cy:2.7, sy:5.0 },
  { n:'אזרים',         sp:'BBB+', mo:'Baa1', cy:3.3, sy:5.3 },
  { n:'נכסים ובניין',  sp:'A-',   mo:'A3',   cy:3.0, sy:5.1 },
  { n:'גבע נדלן',      sp:'BBB+', mo:'Baa1', cy:3.4, sy:5.4 },
  { n:'אלדד ייזום',    sp:'BBB-', mo:'Baa3', cy:3.7, sy:5.6 },
  { n:'אורבן קורפ',    sp:'BB+',  mo:'Ba1',  cy:0,   sy:5.8 },
  { n:'נורסטאר',       sp:'BBB',  mo:'Baa2', cy:3.5, sy:5.5 },
  // ── Insurance / Finance ────────────────────────────────────────────────────
  { n:'הראל ביטוח',    sp:'A+',   mo:'A1',   cy:2.5, sy:4.8 },
  { n:'אריה ביטוח',    sp:'A-',   mo:'A3',   cy:3.0, sy:5.2 },
  { n:'מור ביטוח',     sp:'BBB+', mo:'Baa1', cy:3.3, sy:5.3 },
  { n:'ביטוח ישיר',    sp:'BBB',  mo:'Baa2', cy:3.6, sy:5.5 },
  { n:'אלומות',        sp:'A',    mo:'A2',   cy:2.8, sy:5.0 },
  { n:'פסגות השקעות',  sp:'BBB+', mo:'Baa1', cy:3.2, sy:5.3 },
  { n:'כלל פיננסים',   sp:'A-',   mo:'A3',   cy:3.1, sy:5.2 },
  { n:'פריקו',         sp:'BBB',  mo:'Baa2', cy:3.5, sy:5.4 },
  { n:'אנליסט',        sp:'BBB-', mo:'Baa3', cy:3.8, sy:5.7 },
  { n:'אלבר',          sp:'A-',   mo:'A3',   cy:3.0, sy:5.2 },
  // ── Retail / Food ─────────────────────────────────────────────────────────
  { n:'ויקטורי',       sp:'BBB+', mo:'Baa1', cy:3.3, sy:5.3 },
  { n:'ניו-פארם',      sp:'BBB',  mo:'Baa2', cy:3.5, sy:5.5 },
  { n:'קופיקס',        sp:'BBB-', mo:'Baa3', cy:3.8, sy:5.6 },
  { n:'טמפו',          sp:'BBB+', mo:'Baa1', cy:3.3, sy:5.3 },
  { n:'אסם',           sp:'A',    mo:'A2',   cy:2.8, sy:5.0 },
  { n:'כנפיים',        sp:'BBB',  mo:'Baa2', cy:3.5, sy:5.5 },
  // ── Energy / Infra ────────────────────────────────────────────────────────
  { n:'אנרגיקס',       sp:'BBB+', mo:'Baa1', cy:3.4, sy:5.3 },
  { n:'פז נפט',        sp:'A-',   mo:'A3',   cy:3.0, sy:5.2 },
  { n:'פז-גז',         sp:'BBB+', mo:'Baa1', cy:3.3, sy:5.3 },
  { n:'נרות',          sp:'BBB',  mo:'Baa2', cy:3.5, sy:5.5 },
  { n:'דנאל',          sp:'BBB+', mo:'Baa1', cy:3.4, sy:5.3 },
  { n:'שגריר',         sp:'BBB',  mo:'Baa2', cy:3.5, sy:5.4 },
  // ── Pharma / Industry ─────────────────────────────────────────────────────
  { n:'ביומד',         sp:'BBB',  mo:'Baa2', cy:3.5, sy:5.5 },
  { n:'פרוטרום',       sp:'A-',   mo:'A3',   cy:3.0, sy:5.1 },
  { n:'ורונה',         sp:'BBB-', mo:'Baa3', cy:3.8, sy:5.7 },
  { n:'אביב פרמה',     sp:'BBB',  mo:'Baa2', cy:3.6, sy:5.5 },
  // ── Construction ─────────────────────────────────────────────────────────
  { n:'בוים בינוי',    sp:'BBB+', mo:'Baa1', cy:3.3, sy:5.3 },
  { n:'איגוד',         sp:'BBB',  mo:'Baa2', cy:3.5, sy:5.4 },
  { n:'טמרס',          sp:'BBB+', mo:'Baa1', cy:3.3, sy:5.3 },
  { n:'מגה בינוי',     sp:'BBB',  mo:'Baa2', cy:3.5, sy:5.5 },
  { n:'אוריה נדלן',    sp:'BBB+', mo:'Baa1', cy:3.4, sy:5.3 },
  // ── High Yield ────────────────────────────────────────────────────────────
  { n:'דרורים',        sp:'BB+',  mo:'Ba1',  cy:0,   sy:5.8 },
  { n:'נאות נטוע',     sp:'BB+',  mo:'Ba1',  cy:0,   sy:5.9 },
  { n:'גרין בניה',     sp:'BB',   mo:'Ba2',  cy:0,   sy:6.1 },
  { n:'פנינסולה',      sp:'BB',   mo:'Ba2',  cy:0,   sy:6.2 },
  { n:'ריגנסי',        sp:'BB-',  mo:'Ba3',  cy:0,   sy:6.5 },
  { n:'רוגובין',       sp:'BB+',  mo:'Ba1',  cy:0,   sy:5.8 },
  { n:'אגם',           sp:'B+',   mo:'B1',   cy:0,   sy:7.0 },
  { n:'קדם',           sp:'B+',   mo:'B1',   cy:0,   sy:7.2 },
  { n:'ביוטק ישראל',   sp:'B',    mo:'B2',   cy:0,   sy:7.5 },
  { n:'מדיטק',         sp:'B',    mo:'B2',   cy:0,   sy:7.8 },
  { n:'ויאה',          sp:'B-',   mo:'B3',   cy:0,   sy:8.5 },
  { n:'גרופ גמא',      sp:'CCC+', mo:'Caa1', cy:0,   sy:9.0 },
]
// 61 issuers × 12 bonds = 732 generated; total ≈ 812 bonds

function _genBonds(): Bond[] {
  const out: Bond[] = []
  let g = 0 // global sequence → securityId + seed

  _ISSUERS.forEach((iss, ii) => {
    const hasCpi = iss.cy > 0
    const cpiN   = hasCpi ? 6 : 0
    const shlN   = 12 - cpiN

    // ── CPI series (א–ו) ───────────────────────────────────────────────────
    for (let b = 0; b < cpiN; b++) {
      const matY    = _YR[b]
      const dm      = _DM[(ii * 3 + b) % 12]
      const [day, mon] = dm.split('/')
      const matDate = `${dm}/${matY}`
      const dur     = Math.round((matY - 2026) * 82) / 100
      const ytm     = Math.round((iss.cy + (matY - 2029) * 0.05) * 100) / 100
      const coupon  = Math.round(ytm * 4) / 4
      const price   = Math.max(8800, Math.min(12000,
                        Math.round(10000 + (coupon - ytm) * dur * 90)))
      const amort   = matY >= 2030 ? 3 : 0
      out.push({
        securityId:      String(2300000 + g + 1),
        name:            `${iss.n} אגח ${_SER[b]}`,
        issuerName:      iss.n,
        indexingType:    'cpi',
        issuerType:      'corporate',
        interestType:    'fixed',
        couponRate:      coupon,
        couponSchedule:  `${day} ב${_MHE[mon] ?? mon} בכל שנה`,
        maturityDate:    matDate,
        lastPriceAgorot: price,
        ytm,
        duration:        dur,
        creditRating:    { sp: iss.sp, moodys: iss.mo },
        dailyData:       generateDailyData(price, ytm, 50 + g * 0.3),
        cashFlows:       mkFlows(dm, matDate, coupon, amort),
      })
      g++
    }

    // ── Shekel series (ז–יב for CPI issuers, א–יב for shekel-only) ────────
    const serOff = hasCpi ? 6 : 0
    for (let b = 0; b < shlN; b++) {
      const matY    = _YR[b + (hasCpi ? 6 : 0)]
      const dm      = _DM[(ii * 3 + b + 4) % 12]
      const [day, mon] = dm.split('/')
      const matDate = `${dm}/${matY}`
      const dur     = Math.round((matY - 2026) * 82) / 100
      const ytm     = Math.round((iss.sy + (matY - 2029) * 0.05) * 100) / 100
      const coupon  = Math.round(ytm * 4) / 4
      const price   = Math.max(8800, Math.min(12000,
                        Math.round(10000 + (coupon - ytm) * dur * 90)))
      const amort   = matY >= 2030 ? 2 : 0
      out.push({
        securityId:      String(2300000 + g + 1),
        name:            `${iss.n} אגח ${_SER[serOff + b]}`,
        issuerName:      iss.n,
        indexingType:    'shekel',
        issuerType:      'corporate',
        interestType:    'fixed',
        couponRate:      coupon,
        couponSchedule:  `${day} ב${_MHE[mon] ?? mon} בכל שנה`,
        maturityDate:    matDate,
        lastPriceAgorot: price,
        ytm,
        duration:        dur,
        creditRating:    { sp: iss.sp, moodys: iss.mo },
        dailyData:       generateDailyData(price, ytm, 50 + g * 0.3),
        cashFlows:       mkFlows(dm, matDate, coupon, amort),
      })
      g++
    }
  })

  return out
}

export const bonds: Bond[] = [..._manual, ..._genBonds()]

export function getBondById(id: string): Bond | undefined {
  return bonds.find((b) => b.securityId === id)
}
