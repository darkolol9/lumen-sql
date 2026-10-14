/**
 * Theme registry: the single source of truth for app colors, editor syntax colors and chart series.
 * Every color is a #rrggbb hex so it can feed both CSS variables and Monaco (which needs hex).
 */
export interface ThemeDef {
  id: string
  name: string
  dark: boolean
  ui: {
    canvas: string
    panel: string
    raised: string
    hover: string
    active: string
    line: string
    lineStrong: string
    fg: string
    muted: string
    faint: string
    accent: string
    accentFg: string
    ai: string
    ok: string
    warn: string
    bad: string
  }
  syntax: { keyword: string; string: string; number: string; comment: string; predefined: string; quote: string; operator: string }
  /** Chart series; defaults to accent / warn / ok / ai. */
  series?: [string, string, string, string]
}

export const THEMES: ThemeDef[] = [
  {
    id: 'dark',
    name: 'Lumen Dark',
    dark: true,
    ui: { canvas: '#07090f', panel: '#0c1018', raised: '#121722', hover: '#181e2b', active: '#1e2636', line: '#1b2130', lineStrong: '#283044', fg: '#e7eaf3', muted: '#9098ad', faint: '#5d667c', accent: '#38bdf8', accentFg: '#04121c', ai: '#a78bfa', ok: '#34d399', warn: '#fbbf24', bad: '#f87171' },
    syntax: { keyword: '#7dd3fc', string: '#a5e3a0', number: '#fbbf24', comment: '#5d667c', predefined: '#d8b4fe', quote: '#fda4af', operator: '#94a3b8' },
    series: ['#3987e5', '#d95926', '#199e70', '#c98500'],
  },
  {
    id: 'light',
    name: 'Lumen Light',
    dark: false,
    ui: { canvas: '#f3f5f9', panel: '#ffffff', raised: '#f8f9fc', hover: '#eef1f6', active: '#e4e9f2', line: '#e3e7ef', lineStrong: '#cfd6e3', fg: '#111827', muted: '#5b6477', faint: '#98a1b3', accent: '#0e8fd6', accentFg: '#ffffff', ai: '#7c3aed', ok: '#059669', warn: '#b45309', bad: '#dc2626' },
    syntax: { keyword: '#0369a1', string: '#15803d', number: '#b45309', comment: '#98a1b3', predefined: '#7c3aed', quote: '#be123c', operator: '#475569' },
    series: ['#2a78d6', '#eb6834', '#1baf7a', '#eda100'],
  },
  {
    id: 'midnight',
    name: 'Midnight',
    dark: true,
    ui: { canvas: '#000000', panel: '#05060a', raised: '#0b0d13', hover: '#12151d', active: '#181c26', line: '#141821', lineStrong: '#222836', fg: '#e6e8ee', muted: '#8b92a5', faint: '#4f5668', accent: '#60a5fa', accentFg: '#020617', ai: '#c084fc', ok: '#4ade80', warn: '#facc15', bad: '#f87171' },
    syntax: { keyword: '#93c5fd', string: '#86efac', number: '#fcd34d', comment: '#4f5668', predefined: '#d8b4fe', quote: '#fda4af', operator: '#94a3b8' },
  },
  {
    id: 'tokyo-night',
    name: 'Tokyo Night',
    dark: true,
    ui: { canvas: '#16161e', panel: '#1a1b26', raised: '#1f2335', hover: '#24283b', active: '#292e42', line: '#232433', lineStrong: '#3b4261', fg: '#c0caf5', muted: '#9aa5ce', faint: '#565f89', accent: '#7aa2f7', accentFg: '#16161e', ai: '#bb9af7', ok: '#9ece6a', warn: '#e0af68', bad: '#f7768e' },
    syntax: { keyword: '#bb9af7', string: '#9ece6a', number: '#ff9e64', comment: '#565f89', predefined: '#7dcfff', quote: '#73daca', operator: '#89ddff' },
  },
  {
    id: 'dracula',
    name: 'Dracula',
    dark: true,
    ui: { canvas: '#21222c', panel: '#282a36', raised: '#2e303e', hover: '#343746', active: '#44475a', line: '#343746', lineStrong: '#4a4e63', fg: '#f8f8f2', muted: '#b6b9cc', faint: '#6272a4', accent: '#bd93f9', accentFg: '#1e1f29', ai: '#ff79c6', ok: '#50fa7b', warn: '#ffb86c', bad: '#ff5555' },
    syntax: { keyword: '#ff79c6', string: '#f1fa8c', number: '#bd93f9', comment: '#6272a4', predefined: '#8be9fd', quote: '#50fa7b', operator: '#ff79c6' },
  },
  {
    id: 'catppuccin-mocha',
    name: 'Catppuccin Mocha',
    dark: true,
    ui: { canvas: '#11111b', panel: '#1e1e2e', raised: '#252536', hover: '#2a2b3c', active: '#313244', line: '#2a2b3c', lineStrong: '#45475a', fg: '#cdd6f4', muted: '#a6adc8', faint: '#6c7086', accent: '#89b4fa', accentFg: '#11111b', ai: '#cba6f7', ok: '#a6e3a1', warn: '#f9e2af', bad: '#f38ba8' },
    syntax: { keyword: '#cba6f7', string: '#a6e3a1', number: '#fab387', comment: '#6c7086', predefined: '#89dceb', quote: '#f5c2e7', operator: '#94e2d5' },
  },
  {
    id: 'nord',
    name: 'Nord',
    dark: true,
    ui: { canvas: '#272c36', panel: '#2e3440', raised: '#343a47', hover: '#3b4252', active: '#434c5e', line: '#3b4252', lineStrong: '#4c566a', fg: '#eceff4', muted: '#b8c0cf', faint: '#6b7589', accent: '#88c0d0', accentFg: '#2e3440', ai: '#b48ead', ok: '#a3be8c', warn: '#ebcb8b', bad: '#bf616a' },
    syntax: { keyword: '#81a1c1', string: '#a3be8c', number: '#b48ead', comment: '#616e88', predefined: '#88c0d0', quote: '#8fbcbb', operator: '#81a1c1' },
  },
  {
    id: 'one-dark',
    name: 'One Dark',
    dark: true,
    ui: { canvas: '#21252b', panel: '#282c34', raised: '#2c313a', hover: '#2f343f', active: '#3a3f4b', line: '#2f343e', lineStrong: '#3e4451', fg: '#d7dae0', muted: '#abb2bf', faint: '#5c6370', accent: '#61afef', accentFg: '#1e2127', ai: '#c678dd', ok: '#98c379', warn: '#e5c07b', bad: '#e06c75' },
    syntax: { keyword: '#c678dd', string: '#98c379', number: '#d19a66', comment: '#5c6370', predefined: '#56b6c2', quote: '#e06c75', operator: '#56b6c2' },
  },
  {
    id: 'github-dark',
    name: 'GitHub Dark',
    dark: true,
    ui: { canvas: '#010409', panel: '#0d1117', raised: '#161b22', hover: '#1c2128', active: '#21262d', line: '#21262d', lineStrong: '#30363d', fg: '#e6edf3', muted: '#9198a1', faint: '#6e7681', accent: '#4493f8', accentFg: '#0d1117', ai: '#ab7df8', ok: '#3fb950', warn: '#d29922', bad: '#f85149' },
    syntax: { keyword: '#ff7b72', string: '#a5d6ff', number: '#79c0ff', comment: '#8b949e', predefined: '#d2a8ff', quote: '#ffa657', operator: '#ff7b72' },
  },
  {
    id: 'monokai',
    name: 'Monokai',
    dark: true,
    ui: { canvas: '#1e1f1c', panel: '#272822', raised: '#2d2e27', hover: '#34352f', active: '#3e3d32', line: '#34352f', lineStrong: '#49483e', fg: '#f8f8f2', muted: '#cfcfc2', faint: '#75715e', accent: '#a6e22e', accentFg: '#1e1f1c', ai: '#ae81ff', ok: '#a6e22e', warn: '#fd971f', bad: '#f92672' },
    syntax: { keyword: '#f92672', string: '#e6db74', number: '#ae81ff', comment: '#75715e', predefined: '#66d9ef', quote: '#fd971f', operator: '#f92672' },
    series: ['#66d9ef', '#fd971f', '#a6e22e', '#ae81ff'],
  },
  {
    id: 'gruvbox-dark',
    name: 'Gruvbox Dark',
    dark: true,
    ui: { canvas: '#1d2021', panel: '#282828', raised: '#32302f', hover: '#3c3836', active: '#504945', line: '#3c3836', lineStrong: '#504945', fg: '#ebdbb2', muted: '#bdae93', faint: '#7c6f64', accent: '#fabd2f', accentFg: '#1d2021', ai: '#d3869b', ok: '#b8bb26', warn: '#fe8019', bad: '#fb4934' },
    syntax: { keyword: '#fb4934', string: '#b8bb26', number: '#d3869b', comment: '#928374', predefined: '#8ec07c', quote: '#83a598', operator: '#fe8019' },
    series: ['#83a598', '#fe8019', '#b8bb26', '#d3869b'],
  },
  {
    id: 'solarized-dark',
    name: 'Solarized Dark',
    dark: true,
    ui: { canvas: '#00212b', panel: '#002b36', raised: '#04313d', hover: '#073642', active: '#0b4250', line: '#073642', lineStrong: '#0e4a59', fg: '#eee8d5', muted: '#93a1a1', faint: '#586e75', accent: '#268bd2', accentFg: '#002b36', ai: '#6c71c4', ok: '#859900', warn: '#b58900', bad: '#dc322f' },
    syntax: { keyword: '#859900', string: '#2aa198', number: '#d33682', comment: '#586e75', predefined: '#268bd2', quote: '#cb4b16', operator: '#93a1a1' },
  },
  {
    id: 'rose-pine',
    name: 'Rosé Pine',
    dark: true,
    ui: { canvas: '#191724', panel: '#1f1d2e', raised: '#26233a', hover: '#2a273f', active: '#403d52', line: '#26233a', lineStrong: '#403d52', fg: '#e0def4', muted: '#908caa', faint: '#6e6a86', accent: '#ebbcba', accentFg: '#191724', ai: '#c4a7e7', ok: '#9ccfd8', warn: '#f6c177', bad: '#eb6f92' },
    syntax: { keyword: '#9ccfd8', string: '#f6c177', number: '#ebbcba', comment: '#6e6a86', predefined: '#c4a7e7', quote: '#eb6f92', operator: '#908caa' },
  },
  {
    id: 'kanagawa',
    name: 'Kanagawa',
    dark: true,
    ui: { canvas: '#16161d', panel: '#1f1f28', raised: '#2a2a37', hover: '#2a2a37', active: '#363646', line: '#2a2a37', lineStrong: '#3d3d52', fg: '#dcd7ba', muted: '#c8c093', faint: '#727169', accent: '#7e9cd8', accentFg: '#16161d', ai: '#957fb8', ok: '#98bb6c', warn: '#e6c384', bad: '#e46876' },
    syntax: { keyword: '#957fb8', string: '#98bb6c', number: '#d27e99', comment: '#727169', predefined: '#7fb4ca', quote: '#e6c384', operator: '#c0a36e' },
  },
  {
    id: 'everforest-dark',
    name: 'Everforest Dark',
    dark: true,
    ui: { canvas: '#232a2e', panel: '#2d353b', raised: '#343f44', hover: '#343f44', active: '#3d484d', line: '#343f44', lineStrong: '#475258', fg: '#d3c6aa', muted: '#9da9a0', faint: '#7a8478', accent: '#a7c080', accentFg: '#232a2e', ai: '#d699b6', ok: '#83c092', warn: '#dbbc7f', bad: '#e67e80' },
    syntax: { keyword: '#e67e80', string: '#dbbc7f', number: '#d699b6', comment: '#859289', predefined: '#7fbbb3', quote: '#83c092', operator: '#e69875' },
    series: ['#7fbbb3', '#e69875', '#a7c080', '#d699b6'],
  },
  {
    id: 'ayu-mirage',
    name: 'Ayu Mirage',
    dark: true,
    ui: { canvas: '#1f2430', panel: '#242936', raised: '#282e3b', hover: '#2d3443', active: '#343d4f', line: '#2d3443', lineStrong: '#3d4659', fg: '#cccac2', muted: '#a2a6ad', faint: '#6c7a8b', accent: '#ffcc66', accentFg: '#1f2430', ai: '#dfbfff', ok: '#87d96c', warn: '#ffad66', bad: '#f28779' },
    syntax: { keyword: '#ffad66', string: '#d5ff80', number: '#dfbfff', comment: '#6c7a8b', predefined: '#73d0ff', quote: '#5ccfe6', operator: '#f29e74' },
    series: ['#73d0ff', '#ffad66', '#87d96c', '#dfbfff'],
  },
  {
    id: 'synthwave',
    name: 'Synthwave',
    dark: true,
    ui: { canvas: '#1e1a2b', panel: '#262335', raised: '#2a2139', hover: '#2f2945', active: '#3b3252', line: '#2f2945', lineStrong: '#463a5c', fg: '#f4eefe', muted: '#bbb3d1', faint: '#848bbd', accent: '#ff7edb', accentFg: '#1e1a2b', ai: '#36f9f6', ok: '#72f1b8', warn: '#fede5d', bad: '#fe4450' },
    syntax: { keyword: '#fede5d', string: '#ff8b39', number: '#f97e72', comment: '#848bbd', predefined: '#36f9f6', quote: '#ff7edb', operator: '#fede5d' },
  },
  {
    id: 'github-light',
    name: 'GitHub Light',
    dark: false,
    ui: { canvas: '#f6f8fa', panel: '#ffffff', raised: '#ffffff', hover: '#f3f4f6', active: '#eaeef2', line: '#e5e8eb', lineStrong: '#d1d9e0', fg: '#1f2328', muted: '#59636e', faint: '#818b98', accent: '#0969da', accentFg: '#ffffff', ai: '#8250df', ok: '#1a7f37', warn: '#9a6700', bad: '#d1242f' },
    syntax: { keyword: '#cf222e', string: '#0a3069', number: '#0550ae', comment: '#6e7781', predefined: '#8250df', quote: '#953800', operator: '#cf222e' },
  },
  {
    id: 'catppuccin-latte',
    name: 'Catppuccin Latte',
    dark: false,
    ui: { canvas: '#e6e9ef', panel: '#eff1f5', raised: '#f5f6f9', hover: '#e6e9ef', active: '#dce0e8', line: '#dce0e8', lineStrong: '#ccd0da', fg: '#4c4f69', muted: '#6c6f85', faint: '#9ca0b0', accent: '#1e66f5', accentFg: '#ffffff', ai: '#8839ef', ok: '#40a02b', warn: '#df8e1d', bad: '#d20f39' },
    syntax: { keyword: '#8839ef', string: '#40a02b', number: '#fe640b', comment: '#9ca0b0', predefined: '#04a5e5', quote: '#ea76cb', operator: '#179299' },
  },
  {
    id: 'solarized-light',
    name: 'Solarized Light',
    dark: false,
    ui: { canvas: '#eee8d5', panel: '#fdf6e3', raised: '#fffbee', hover: '#f5efdc', active: '#eee8d5', line: '#eee8d5', lineStrong: '#ddd6c1', fg: '#073642', muted: '#586e75', faint: '#93a1a1', accent: '#268bd2', accentFg: '#002b36', ai: '#6c71c4', ok: '#859900', warn: '#b58900', bad: '#dc322f' },
    syntax: { keyword: '#859900', string: '#2aa198', number: '#d33682', comment: '#93a1a1', predefined: '#268bd2', quote: '#cb4b16', operator: '#657b83' },
  },
  {
    id: 'gruvbox-light',
    name: 'Gruvbox Light',
    dark: false,
    ui: { canvas: '#f2e5bc', panel: '#fbf1c7', raised: '#f9f5d7', hover: '#f2e5bc', active: '#ebdbb2', line: '#ebdbb2', lineStrong: '#d5c4a1', fg: '#3c3836', muted: '#665c54', faint: '#a89984', accent: '#076678', accentFg: '#fbf1c7', ai: '#8f3f71', ok: '#79740e', warn: '#b57614', bad: '#9d0006' },
    syntax: { keyword: '#9d0006', string: '#79740e', number: '#8f3f71', comment: '#928374', predefined: '#427b58', quote: '#076678', operator: '#af3a03' },
    series: ['#076678', '#af3a03', '#79740e', '#8f3f71'],
  },
  {
    id: 'rose-pine-dawn',
    name: 'Rosé Pine Dawn',
    dark: false,
    ui: { canvas: '#f2e9e1', panel: '#faf4ed', raised: '#fffaf3', hover: '#f4ede8', active: '#dfdad9', line: '#ebe3dc', lineStrong: '#dfdad9', fg: '#575279', muted: '#797593', faint: '#9893a5', accent: '#286983', accentFg: '#fffaf3', ai: '#907aa9', ok: '#56949f', warn: '#ea9d34', bad: '#b4637a' },
    syntax: { keyword: '#286983', string: '#ea9d34', number: '#d7827e', comment: '#9893a5', predefined: '#907aa9', quote: '#b4637a', operator: '#797593' },
  },
  {
    id: 'everforest-light',
    name: 'Everforest Light',
    dark: false,
    ui: { canvas: '#f4f0d9', panel: '#fdf6e3', raised: '#fffbef', hover: '#f4f0d9', active: '#e6e2cc', line: '#efebd4', lineStrong: '#e0dcc7', fg: '#5c6a72', muted: '#829181', faint: '#a6b0a0', accent: '#8da101', accentFg: '#2d353b', ai: '#df69ba', ok: '#35a77c', warn: '#dfa000', bad: '#f85552' },
    syntax: { keyword: '#f85552', string: '#dfa000', number: '#df69ba', comment: '#a6b0a0', predefined: '#3a94c5', quote: '#35a77c', operator: '#f57d26' },
    series: ['#3a94c5', '#f57d26', '#8da101', '#df69ba'],
  },
]

export const DEFAULT_THEME = 'dark'
export const themeById = (id: string | undefined) => THEMES.find((t) => t.id === id) ?? THEMES[0]
export const monacoThemeId = (id: string) => `lumen-${themeById(id).id}`

const alpha = (hex: string, a: number) => `color-mix(in srgb, ${hex} ${Math.round(a * 100)}%, transparent)`

/** Applies a theme's tokens to the document root (overriding the defaults in index.css). */
export function applyTheme(id: string) {
  const t = themeById(id)
  const u = t.ui
  const root = document.documentElement
  const vars: Record<string, string> = {
    canvas: u.canvas,
    panel: u.panel,
    raised: u.raised,
    hover: u.hover,
    active: u.active,
    line: u.line,
    'line-strong': u.lineStrong,
    fg: u.fg,
    muted: u.muted,
    faint: u.faint,
    accent: u.accent,
    'accent-fg': u.accentFg,
    'accent-soft': alpha(u.accent, t.dark ? 0.12 : 0.1),
    ai: u.ai,
    'ai-soft': alpha(u.ai, t.dark ? 0.12 : 0.08),
    ok: u.ok,
    warn: u.warn,
    bad: u.bad,
    'bad-soft': alpha(u.bad, t.dark ? 0.1 : 0.07),
  }
  for (const [k, v] of Object.entries(vars)) root.style.setProperty(`--c-${k}`, v)
  const series = t.series ?? [u.accent, u.warn, u.ok, u.ai]
  series.forEach((c, i) => root.style.setProperty(`--series-${i + 1}`, c))
  root.style.setProperty(
    '--shadow-pop',
    `0 16px ${t.dark ? '48px' : '40px'} -12px ${t.dark ? 'rgb(0 0 0 / 0.65)' : 'rgb(15 23 42 / 0.25)'}, 0 0 0 1px var(--c-line-strong)`,
  )
  root.style.setProperty(
    '--glow',
    t.dark ? `radial-gradient(1200px 500px at 10% -10%, ${alpha(u.accent, 0.07)}, transparent 60%), radial-gradient(900px 500px at 110% 0%, ${alpha(u.ai, 0.06)}, transparent 60%)` : 'none',
  )
  root.style.colorScheme = t.dark ? 'dark' : 'light'
  root.dataset.theme = t.dark ? 'dark' : 'light'
  root.dataset.themeId = t.id
}

const hex = (c: string) => c.replace('#', '')

/** Monaco theme data for a registry theme. */
export function monacoTheme(t: ThemeDef) {
  const u = t.ui
  const s = t.syntax
  return {
    base: (t.dark ? 'vs-dark' : 'vs') as 'vs-dark' | 'vs',
    inherit: true,
    rules: [
      { token: '', foreground: hex(u.fg) },
      { token: 'keyword', foreground: hex(s.keyword), fontStyle: 'bold' },
      { token: 'operator', foreground: hex(s.operator) },
      { token: 'string', foreground: hex(s.string) },
      { token: 'number', foreground: hex(s.number) },
      { token: 'comment', foreground: hex(s.comment), fontStyle: 'italic' },
      { token: 'predefined', foreground: hex(s.predefined) },
      { token: 'identifier.quote', foreground: hex(s.quote) },
      { token: 'delimiter', foreground: hex(u.muted) },
    ],
    colors: {
      'editor.background': u.panel,
      'editor.foreground': u.fg,
      'editorLineNumber.foreground': `${u.faint}99`,
      'editorLineNumber.activeForeground': u.muted,
      'editor.lineHighlightBackground': u.raised === u.panel ? u.hover : u.raised,
      'editor.lineHighlightBorder': '#00000000',
      'editor.selectionBackground': `${u.accent}40`,
      'editor.inactiveSelectionBackground': `${u.accent}20`,
      'editorCursor.foreground': u.accent,
      'editorIndentGuide.background1': u.line,
      'editorWhitespace.foreground': u.lineStrong,
      'editorSuggestWidget.background': u.raised,
      'editorSuggestWidget.border': u.lineStrong,
      'editorSuggestWidget.selectedBackground': u.active,
      'editorSuggestWidget.foreground': u.fg,
      'editorSuggestWidget.highlightForeground': u.accent,
      'editorSuggestWidget.focusHighlightForeground': u.accent,
      'editorHoverWidget.background': u.raised,
      'editorHoverWidget.border': u.lineStrong,
      'editorWidget.background': u.raised,
      'editorWidget.border': u.lineStrong,
      'input.background': u.panel,
      'scrollbarSlider.background': `${u.lineStrong}80`,
      'scrollbarSlider.hoverBackground': u.lineStrong,
      'diffEditor.insertedTextBackground': `${u.ok}26`,
      'diffEditor.removedTextBackground': `${u.bad}26`,
      'diffEditor.insertedLineBackground': `${u.ok}14`,
      'diffEditor.removedLineBackground': `${u.bad}14`,
      'editorGutter.background': u.panel,
    },
  }
}
