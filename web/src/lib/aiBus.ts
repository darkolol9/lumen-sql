import { useApp } from '../store/app'

/** Lightweight event bus so the editor, results and palette can drive the AI panel. */
export const AI_FOCUS = 'lumen:ai-focus'
export const AI_ASK = 'lumen:ai-ask'

export function focusAi() {
  useApp.getState().setPrefs({ aiOpen: true })
  requestAnimationFrame(() => window.dispatchEvent(new CustomEvent(AI_FOCUS)))
}

export function askAi(prompt: string) {
  useApp.getState().setPrefs({ aiOpen: true })
  // give the panel a frame to mount if it was closed
  setTimeout(() => window.dispatchEvent(new CustomEvent(AI_ASK, { detail: prompt })), 30)
}
