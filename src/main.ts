require('dotenv').config()
import { App } from './app'

async function main() {
  const app = new App()
  app.start()
}

main().catch(console.error)
