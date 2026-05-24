export type IndexingType = 'shekel' | 'cpi'
export type IssuerType = 'government' | 'corporate'
export type InterestType = 'fixed' | 'variable'
export type PaymentStatus = 'paid' | 'forecast'

export interface CreditRating {
  sp?: string     // e.g. "AA-", "BBB+", "BB"
  moodys?: string // e.g. "Aa3", "Baa1", "Ba2"
}

export interface DailyMarketData {
  date: string          // YYYY-MM-DD
  priceAgorot: number   // price in agorot (9850 = ₪98.50 per ₪100 nominal)
  ytm: number           // yield to maturity %
  volumeThousands: number // trading volume in ₪ thousands
}

export interface CashFlow {
  date: string          // DD/MM/YYYY
  type: string
  principalPct: number
  couponPct: number
  status: PaymentStatus
}

export interface Bond {
  securityId: string
  name: string
  issuerName: string
  indexingType: IndexingType
  issuerType: IssuerType
  interestType: InterestType
  couponRate: number
  couponSchedule: string
  maturityDate: string   // DD/MM/YYYY
  lastPriceAgorot: number
  ytm: number
  duration: number
  creditRating: CreditRating
  dailyData: DailyMarketData[]
  cashFlows: CashFlow[]
}
