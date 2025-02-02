import { PublicKey } from "@solana/web3.js"

export const sleep = ms => new Promise(resolve => setTimeout(resolve, ms))

export const isValidSolAddress = (address: string) => {
  try {
    new PublicKey(address)
    return true
  } catch (error) {
    return false
  }
}
