const { Connection, PublicKey } = require("@solana/web3.js");
const { Market } = require("@project-serum/serum");
const bs58 = require("bs58");
const { default: axios } = require("axios");
require("dotenv").config();

const HELIUS_API_KEY = process.env.HELIUS_API_KEY;
const JUPITER_API = "https://token.jup.ag/all";
const RAYDIUM_V4_PROGRAM_ID = new PublicKey(
  "675kPX9MHTjS2zt1qfr1NYHuzeLXfQM9H24wFSUt1Mp8"
);

class App {

  constructor() {
    this.init()
  }

  init() {
    this.connection = new Connection(
      "https://mainnet.helius-rpc.com?api-key=145de8ee-9bfc-4b90-b65f-cb53f0e64c73",
      "finalized"
    );
    this.readyForNewRequest = true;
    this.signatures = []
  }

  async start() {
    this.listenToRaydiumSwaps()
    this.startTxDetailsLoop()  
  }

  startTxDetailsLoop() {
    setInterval(async () => {
      const signaturesSlice = this.signatures.splice(0, 100)
      const transaactions = await this.parseTransaction(signaturesSlice)
      const transactionDescriptions = transaactions.map(transaaction => transaaction.description).filter(Boolean)
      console.log(transactionDescriptions)
    }, 1_000)
  }

  parseTransaction = async (signatures) => {
    const response = await fetch(
      "https://api.helius.xyz/v0/transactions/?api-key=" + HELIUS_API_KEY,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          transactions: signatures,
        }),
      }
    );
  
    const data = await response.json();
  
    return data;
  };

  listenToRaydiumSwaps() {  
    // Get token metadata
    // const tokenMetadata = await getTokenMetadata();
  
    console.log("Starting to listen for Raydium swaps...");
  
    this.connection.onLogs(
      RAYDIUM_V4_PROGRAM_ID,
      async (logs) => {
        if (!logs.logs.some((log) => log.includes("Program log:"))) {
          return;
        }

         // Extract swap information from the transaction
         const signature = logs.signature.toString();
    
        // Get enriched transaction data from Helius
        setTimeout(() => this.signatures.push(signature), 10_000);
      },
      "finalized"
    );
  }
}

const app = new App
app.start()
// Jupiter API for token metadata


// return;
// txInfo = await connection.getTransaction(signature, {
//   maxSupportedTransactionVersion: 0,
// });
// if (!txInfo || !txInfo.meta) return;

// // Look for token balances changes which indicate swaps
// const preTokenBalances = txInfo.meta.preTokenBalances || [];
// const postTokenBalances = txInfo.meta.postTokenBalances || [];

// if (preTokenBalances.length > 0 && postTokenBalances.length > 0) {
//   // Find the tokens involved in the swap
//   const tokens = new Set([
//     ...preTokenBalances.map((b) => b.mint),
//     ...postTokenBalances.map((b) => b.mint),
//   ]);

//   console.log(preTokenBalances, postTokenBalances);

//   // Log swap details with token names
//   console.log("\nNew swap detected:");
//   console.log("Transaction:", signature);
//   console.log("Tokens involved:");

//   tokens.forEach((tokenAddress) => {
//     const token = tokenMetadata[tokenAddress];
//     if (token) {
//       console.log(`- ${token.symbol} (${token.name})`);
//     } else {
//       console.log(`- Unknown token: ${tokenAddress}`);
//     }
//   });
// }

async function getTokenMetadata() {
  try {
    const response = await axios.get(JUPITER_API);
    return response.data.reduce((acc, token) => {
      acc[token.address] = token;
      return acc;
    }, {});
  } catch (error) {
    console.error("Error fetching token metadata:", error);
    return {};
  }
}
