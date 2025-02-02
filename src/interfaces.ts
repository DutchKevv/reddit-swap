export interface IToken {
  marketCap: number
  address: string
  swaps: any[]
  total: number
  details: IMintDetails
}

export interface ISwap {
  price: number
  source: string
  time: Date
  description: string
  side: TransactionSide
  token: string
  amount: number
}

export interface IMintDetails {
  address: string
  decimals: number
  freezeAuthority: string | null
  mintAuthority: string | null
  isInitialized: boolean
  rawSupply: string
  totalSupply: number
}

export type TransactionSide = 'BUY' | 'SELL'
