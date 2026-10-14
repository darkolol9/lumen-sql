# Lumen SQL

A fast, good-looking local SQL workbench for **MySQL**, **Snowflake** and **ClickHouse**, modelled on Snowsight: workspaces, worksheets, a schema explorer, results with column statistics and charts, plus an AI assistant (any OpenRouter model) that can explore your schema and propose SQL as a reviewable diff.

```bash
pnpm install
pnpm dev          # API on :7431, UI on http://localhost:5173
```

Production: `pnpm build && pnpm start` (serves the UI and API from http://127.0.0.1:7431).

## Desktop app (Linux)

The same app packaged with Electron. It runs the API inside the app (on `127.0.0.1:7432`, or a free port if that's taken), so nothing else needs to be running.

```bash
pnpm build:desktop                 # → dist-desktop/release/lumen-sql-<version>-x86_64.AppImage
desktop/install.sh                 # install to ~/.local/opt and add it to the app launcher
desktop/install.sh --import-data   # also copy ./data into the desktop app (first install only)
pnpm dev:desktop                   # dev: API + Vite + an Electron window with hot reload
```

`pnpm build:desktop:rpm` and `build:desktop:deb` build packages instead; rpm needs `rpm-build` installed. The desktop app keeps its own data in `~/.config/Lumen SQL/data`, separate from the web version's `./data`.

## Sample databases

```bash
docker compose -f dev/docker-compose.yml up -d     # MySQL 8.4 on 127.0.0.1:3316
```

Three seeded databases: `shop` (e-commerce), `saas` (accounts, subscriptions, 150k events) and `hr` (employee hierarchy, salaries). Users: `lumen`/`lumen` (full access) and `reader`/`reader` (SELECT only). Run `docker compose -f dev/docker-compose.yml down -v` to wipe and reseed.

## Features

**Editor**
- Monaco with schema-aware autocomplete: tables in `FROM`/`JOIN`, columns resolved through aliases (`o.`), cross-database `db.table`, Snowflake `db.schema.table`, CTE names, dialect-specific functions.
- JOIN suggestions that infer the `ON` clause from key naming (`customers c ON c.id = o.customer_id`).
- Hover a table name to see its columns. Statement-under-cursor gutter marker; failing statements get an inline error marker.
- `Ctrl/⌘+Enter` runs the statement under the cursor (or the selection), `Ctrl/⌘+Shift+Enter` runs everything, `Shift+Alt+F` formats.
- Confirmation before `DROP`/`TRUNCATE` or `DELETE`/`UPDATE` without a `WHERE`.

**Results**
- Virtualized grid: sort, filter, resize columns, keyboard navigation, double-click to inspect JSON values, `Ctrl+C` to copy a cell.
- Column inspector, Snowsight-style: null %, distinct values, min/max/mean, histograms and top values.
- Chart view (bar/line, up to 4 series), and copy as TSV/Markdown or export as CSV/JSON.
- One tab per statement when you run a script. Running queries can be cancelled.

**Workspaces**: group worksheets into workspaces. Worksheets autosave and remember their connection, database and schema. Query history is searchable and filterable by errors or AI runs. `Ctrl/⌘+P` opens the command palette.

**AI assistant** (right panel, `Ctrl/⌘+K`)
- Add your OpenRouter key in the panel or in Settings, and pick any tool-capable model with live pricing.
- Agent loop with tools: `list_databases`, `list_tables`, `describe_table`, `search_schema`, `run_query` and `write_to_editor`.
- The assistant sees your editor, your selection, the last error and a preview of the last result.
- **AI queries are always read-only**, even on writable connections. Write statements can only reach your editor as a proposal.
- Proposed SQL opens as a diff. You can edit it before you accept (`Ctrl/⌘+Shift+Enter`) or reject it (`Esc`).
- One-click "Fix with AI" on errors, and Explain / Optimize / Document actions in the editor's right-click menu.

**Read-only connections** (an option on every connection)
- An allow-list SQL guard runs on the server for every engine. It understands strings, comments and quoted identifiers, and catches tricks like `WITH … DELETE`, `SELECT … INTO OUTFILE` and `FOR UPDATE`.
- ClickHouse also enforces it server-side (`readonly=2`). MySQL sessions also use `READ ONLY` transactions.
- Snowflake relies on the guard alone, so pair it with a read-only role for full protection.

## Connections

| Engine | Auth |
|---|---|
| MySQL | user/password, optional TLS |
| ClickHouse | HTTP(S) interface, port 8123 (or 8443 with HTTPS) |
| Snowflake | password, key pair (PEM), programmatic access token, or browser SSO |

## Security notes

- The server binds to `127.0.0.1` only. Override it with `HOST` / `PORT`.
- Data is stored in `./data/lumen.json`. Passwords, keys, tokens and the OpenRouter key are encrypted with AES-256-GCM using `data/.secret.key`, or `LUMEN_SECRET` if you set it. Secrets are never sent back to the browser.
- Use `LUMEN_DATA_DIR` to move the data directory.

## Layout

```
server/            Hono API: drivers, catalog cache, AI agent, encrypted store
  drivers/         mysql.ts · snowflake.ts · clickhouse.ts (common interface)
  ai.ts            OpenRouter streaming + tool loop
  cli.ts           entry point for `pnpm dev` / `pnpm start`
desktop/           Electron main process, bundling script, electron-builder config, installer
shared/            types + SQL lexer, statement splitter, read-only guard
web/src/
  lib/             monaco setup + completion engine, editor actions, api client
  store/           zustand app + AI chat state
  components/      UI
```
