export type PromoteStatus = 'idle' | 'working'

declare module 'claude-code' {
  interface PluginState {
    'prompt-master': {
      /** Whether a rewrite is running now. */
      status: PromoteStatus
      /** The rough prompt the last rewrite replaced, for Undo; null when there is nothing to undo. */
      original: string | null
    }
  }
}
