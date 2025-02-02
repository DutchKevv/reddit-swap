import { Connection, PublicKey } from '@solana/web3.js'
import { default as axios } from 'axios'
import { EnrichedTransaction } from 'helius-sdk'
import { IMintDetails, ISwap, IToken } from './interfaces'
import { isValidSolAddress, sleep } from './utils'
require('dotenv').config()

// const SOL_THRESHOLD = parseInt(process.env.SOL_THRESHOLD, 10) || 10;
const CHECK_INTERVAL = parseInt(process.env.CHECK_INTERVAL, 10) || 180 // 3 minutes
const HELIUS_API_KEY = process.env.HELIUS_API_KEY
const JUPITER_API = 'https://token.jup.ag/all'
const RAYDIUM_V4_PROGRAM_ID = new PublicKey('675kPX9MHTjS2zt1qfr1NYHuzeLXfQM9H24wFSUt1Mp8')

export class App {
  private connection: Connection
  private signatures: string[] = []
  private tokens: { [key: string]: IToken } = {}

  constructor() {
    this.init()
  }

  init() {
    this.connection = new Connection(`https://mainnet.helius-rpc.com?api-key=${HELIUS_API_KEY}`, 'finalized')
  }

  async start() {
    this.listenToRaydiumSwaps()
    this.startTxDetailsLoop()
    this.startDisplayTokensLoop()
  }

  startDisplayTokensLoop() {
    setInterval(async () => {
      const displayData = Object.values(this.tokens).map(token => {
        // get last 3 minutes
        const lastSwaps = token.swaps.filter(swap => swap.time > Date.now() - CHECK_INTERVAL * 1000)

        const lastSwapsAmount = lastSwaps.reduce((acc, swap) => acc + swap.amount, 0)

        return {
          token,
          address: token.address,
          mc: '',
          total: lastSwapsAmount,
          totalSwaps: lastSwaps.length,
        }
      })

      // sort by highest
      displayData.sort((a, b) => b.total - a.total)

      const top10Tokens = displayData.slice(0, 10)

      for (const token of top10Tokens) {
        if (!token.token.details) {
          token.token.details = await this.getTokenSupply(token.token.address)
          await sleep(1000)
        }

        if (token.token.details) {
            token.mc = '$' + token.token.details.totalSupply * token.token.swaps.at(-1).price
        }

        delete token.token
      }

      // get market cap of highest 1
      console.log(top10Tokens)
    }, 10_000)
  }

  startTxDetailsLoop() {
    setInterval(async () => {
      const signaturesSlice = this.signatures.splice(0, 100)
      const transaactions = await this.getTransactions(signaturesSlice)

      if (!transaactions?.length) {
        return
      }

      transaactions.filter(Boolean).map(transaaction => this.parseTransaction(transaaction))
    }, 1_000)
  }

  async getTransactions(signatures) {
    const response = await fetch('https://api.helius.xyz/v0/transactions/?api-key=' + HELIUS_API_KEY, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        transactions: signatures,
      }),
    })

    return response.json()
  }

  listenToRaydiumSwaps() {
    // Get token metadata
    // const tokenMetadata = await getTokenMetadata();

    console.log('Starting to listen for Raydium swaps...')

    this.connection.onLogs(
      RAYDIUM_V4_PROGRAM_ID,
      async logs => {
        if (!logs.logs.some(log => log.includes('Program log:'))) {
          return
        }

        // Extract swap information from the transaction
        const signature = logs.signature.toString()

        // Get enriched transaction data from Helius
        setTimeout(() => this.signatures.push(signature), 10_000)
      },
      'finalized',
    )
  }

  parseTransaction(transaction: EnrichedTransaction) {
    const lines = transaction.description.split(' ')
    const side = lines[3] === 'SOL' ? 'BUY' : 'SELL'

    if (side !== 'BUY') {
      return
    }

    if (lines[3] === 'SOL' && lines[6] === 'SOL') {
      return
    }

    if (lines[3] !== 'SOL' && lines[6] !== 'SOL') {
      return
    }

    const price = parseFloat(lines[2]) / parseFloat(lines[5])

    const swap: ISwap = {
      price,
      source: transaction.source,
      time: new Date(),
      description: transaction.description,
      side: side,
      token: side === 'BUY' ? lines[6] : lines[3],
      amount: parseFloat(side === 'BUY' ? lines[2] : lines[5]),
    }

    if (!this.tokens[swap.token]) {
      this.tokens[swap.token] = {
        marketCap: 0,
        address: swap.token,
        swaps: [],
        total: 0,
        details: null
      }
    }

    if (!swap.amount) {
      return
    }

    this.tokens[swap.token].swaps.push(swap)
    this.tokens[swap.token].total += swap.amount

    return swap
  }

  async getTokenMetadata() {
    try {
      const response = await axios.get(JUPITER_API)
      return response.data.reduce((acc, token) => {
        acc[token.address] = token
        return acc
      }, {})
    } catch (error) {
      console.error('Error fetching token metadata:', error)
      return {}
    }
  }

  async getTokenSupply(tokenMintAddress: string) {
    try {
      if (!isValidSolAddress(tokenMintAddress)) {
        return
      }

      // Create a PublicKey object from the token mint address
      const mintPubkey = new PublicKey(tokenMintAddress)

      // Get mint info using the correct method
      const mintInfo = await this.connection.getParsedAccountInfo(mintPubkey)

      if (!mintInfo.value) {
        throw new Error('Failed to find mint account')
      }

      const data = mintInfo.value.data

      // Parse the mint data
      if (!data || !('parsed' in data) || !data.parsed || !data.parsed.info) {
        throw new Error('Unable to parse mint data')
      }

      const parsedData = data.parsed.info

      // Calculate total supply considering decimals
      const totalSupply = Number(parsedData.supply) / Math.pow(10, parsedData.decimals)

      // Get additional mint details
      const mintDetails: IMintDetails = {
        address: tokenMintAddress,
        decimals: parsedData.decimals,
        freezeAuthority: parsedData.freezeAuthority || null,
        mintAuthority: parsedData.mintAuthority || null,
        isInitialized: parsedData.isInitialized,
        rawSupply: parsedData.supply,
        totalSupply: totalSupply,
      }

      return mintDetails
    } catch (error) {
      console.error('Error fetching token supply:', error)
      throw error
    }
  }
}