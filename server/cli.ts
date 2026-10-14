import { flushStore, startServer } from './index.ts'

const port = Number(process.env.PORT ?? 7431)
const hostname = process.env.HOST ?? '127.0.0.1'
const staticDir = process.env.NODE_ENV === 'production' ? 'dist' : undefined

startServer({ port, hostname, staticDir }).then(({ port }) => console.log(`Lumen API listening on http://${hostname}:${port}`))

for (const sig of ['SIGINT', 'SIGTERM'] as const) {
  process.on(sig, () => {
    flushStore()
    process.exit(0)
  })
}
