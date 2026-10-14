// Bundles the Electron main process (with the API server inlined) into dist-desktop/,
// next to a copy of the built UI and a minimal package.json, which is all electron-builder packs.
import { build } from 'esbuild'
import { cpSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'

const out = 'dist-desktop/app'
const mainOnly = process.argv.includes('--main-only')
const pkg = JSON.parse(readFileSync('package.json', 'utf8'))

if (!mainOnly) rmSync(out, { recursive: true, force: true })
mkdirSync(out, { recursive: true })

await build({
  entryPoints: ['desktop/main.ts'],
  outfile: `${out}/main.cjs`,
  bundle: true,
  platform: 'node',
  format: 'cjs',
  target: 'node22',
  external: ['electron'],
  sourcemap: 'linked',
  logLevel: 'warning',
})

if (!mainOnly) {
  if (!existsSync('dist/index.html')) throw new Error('dist/ is missing: run vite build first')
  cpSync('dist', `${out}/ui`, { recursive: true })
  cpSync('desktop/icon.png', `${out}/icon.png`)
  writeFileSync(
    `${out}/package.json`,
    JSON.stringify(
      {
        name: pkg.name,
        productName: 'Lumen SQL',
        version: pkg.version,
        description: 'SQL workbench for MySQL, Snowflake and ClickHouse',
        author: 'darkolol9',
        main: 'main.cjs',
        // window class, so the launcher icon groups with the running window
        desktopName: 'lumen-sql.desktop',
      },
      null,
      2,
    ),
  )
}
