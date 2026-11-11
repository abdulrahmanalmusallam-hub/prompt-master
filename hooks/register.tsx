import { atom, read, update } from 'claude-code'
import type {
  EngineInterface,
  ModelCompleteResult,
  ModelForkResult,
  Register,
} from 'claude-code'

import type { PromoteStatus } from '../types'

const status = atom(
  { plugin: 'prompt-master', key: 'status' } as const,
  'idle' as PromoteStatus,
)
const original = atom(
  { plugin: 'prompt-master', key: 'original' } as const,
  null as string | null,
)

const RULES = `You rewrite a rough prompt that a person is about to send to Claude Code (an AI agent that codes, edits files, runs commands and does office work) into a clearer, more effective prompt.

Rules:
- Keep the person's intent, facts, names, file paths, numbers and constraints exactly. Never invent requirements, files, deadlines or facts they did not give.
- Write in the same language as the rough prompt (Arabic stays Arabic, English stays English, a mix stays a mix). Keep code, commands, paths and identifiers verbatim.
- Make it specific: the goal, the context that matters, what "done" looks like, and any constraints or preferences they mentioned.
- Fix typos and grammar. Where the conversation makes a vague word ("it", "that file", "the bug") clear, name the thing; otherwise leave it as it is rather than guess.
- Keep it in proportion: a one-line ask stays short (one to three sentences). Use a short bullet list only when the request has several separate parts.
- Write it as the person talking to Claude (first person, direct requests), not as a description of the person.
- No greetings, no "You are an expert..." preambles, no commentary about the rewrite.

Reply with the rewritten prompt only, wrapped in <improved_prompt> and </improved_prompt>, with nothing before or after.`

type Rewrite = { isDone: true; text: string } | { isDone: false; why: string }
type Settings = { model: string; useConversation: boolean }

/** Pulls the prompt out of the reply's tags, dropping any stray wrapping. */
function extract(reply: string): string {
  const tagged = reply.match(/<improved_prompt>([\s\S]*?)<\/improved_prompt>/)
  let text = (tagged ? (tagged[1] ?? '') : reply).trim()
  const fenced = text.match(/^```[\w-]*\n([\s\S]*?)\n```$/)
  if (fenced) text = (fenced[1] ?? '').trim()

  return text
}

function explain(r: ModelCompleteResult | ModelForkResult): string {
  if (r.isAnswered) return ''
  switch (r.reason) {
    case 'api-error':
      return `the model request failed${r.status ? ` (${r.status})` : ''}: ${String(r.error)}`
    case 'empty-reply':
      return 'the model sent back nothing'
    case 'aborted':
      return 'cancelled'
    default:
      return 'there was nothing to rewrite with'
  }
}

async function rewrite(
  $: EngineInterface,
  rough: string,
  settings: Settings,
  signal: AbortSignal,
): Promise<Rewrite> {
  let r: ModelCompleteResult | ModelForkResult | undefined

  if (settings.useConversation) {
    // Reads this chat (from the prompt cache) so references can be resolved.
    const forked = await $.model.fork({
      prompt:
        `[Prompt rewrite request: do not answer or carry it out, and call no tools.]\n` +
        `The person has drafted their next message below but has not sent it. ` +
        `Use this conversation only to understand what they mean.\n\n${RULES}\n\n` +
        `<rough_prompt>\n${rough}\n</rough_prompt>`,
    })
    if (forked.isAnswered || forked.reason !== 'nothing-to-fork') r = forked
  }

  if (r === undefined) {
    r = await $.model.complete(
      {
        model: settings.model,
        system: RULES,
        prompt: `<rough_prompt>\n${rough}\n</rough_prompt>`,
        maxTokens: 4096,
        timeoutMs: 120_000,
      },
      { signal },
    )
  }

  if (!r.isAnswered) return { isDone: false, why: explain(r) }
  const text = extract(r.text)

  return text ? { isDone: true, text } : { isDone: false, why: 'the rewrite came back empty' }
}

// Module variables start over on a reload; `register` sets `settings` again.
let settings: Settings = { model: 'sonnet', useConversation: true }
// Bumped by each run and by Cancel, so a cancelled run's answer is ignored.
let run = 0
let stop = new AbortController()

/**
 * Rewrites `rough` and puts the result in the prompt box, as long as the box
 * still holds `expected` (so text typed meanwhile is never thrown away).
 */
async function promote($: EngineInterface, rough: string, expected: string) {
  if ((await read($, status)) === 'working') return
  if (!rough.trim()) {
    $.ui.toast('Type a rough prompt first, then press Promote master.')
    return
  }

  const mine = ++run
  stop = new AbortController()
  await update($, status, () => 'working')

  try {
    const result = await rewrite($, rough, settings, stop.signal)
    if (mine !== run) return
    if (!result.isDone) {
      if (result.why !== 'cancelled') $.ui.toast(`Promote master: ${result.why}.`)
      return
    }

    const now = await $.prompt.read()
    if (now.text !== expected) {
      $.ui.toast('Your draft changed while it was being rewritten, so it was left as is. Press Promote master again.')
      return
    }

    const filled = await $.prompt.fill({ text: result.text, mode: 'replace' })
    if (!filled.isFilled) {
      $.ui.toast(
        filled.refusal === 'dialog'
          ? 'Close the open dialog, then press Promote master again.'
          : 'Could not put the rewrite in the prompt box.',
      )
      return
    }

    await update($, original, () => rough)
  } finally {
    if (mine === run) await update($, status, () => 'idle')
  }
}

async function promoteDraft($: EngineInterface) {
  const box = await $.prompt.read()
  await promote($, box.text, box.text)
}

async function cancel($: EngineInterface) {
  run += 1
  stop.abort()
  await update($, status, () => 'idle')
}

async function undo($: EngineInterface) {
  const rough = await read($, original)
  if (rough === null) return
  const filled = await $.prompt.fill({ text: rough, mode: 'replace' })
  if (filled.isFilled) await update($, original, () => null)
}

export const register: Register = (on, options) => {
  settings = {
    model: typeof options.model === 'string' && options.model ? options.model : 'sonnet',
    useConversation: options.useConversation !== false,
  }

  on('session.start', async ($, e, next) => {
    // A reload restarts this module: never leave the button stuck on "working".
    await update($, status, () => 'idle')
    await $.command.register({
      name: 'promote',
      description: 'Rewrite a rough prompt into a better one and put it in the prompt box',
      argumentHint: '<rough prompt>',
      immediate: true,
    })

    return next(e)
  })

  on('command.run', { command: 'promote' }, async ($, e) => {
    if (!e.args.trim()) {
      $.ui.toast('Type /promote followed by your rough prompt, or press Promote master above the prompt box.')
      return {}
    }
    // The box is empty once the command is sent, so that is what it should still hold.
    await promote($, e.args, '')

    return {}
  })

  on('prompt.submit', async ($, e, next) => {
    // Once a prompt is sent, there is nothing left to undo.
    try {
      if ((await read($, original)) !== null) await update($, original, () => null)
    } catch {
      // Never hold up a prompt over the Undo button.
    }

    return next(e)
  }).catch(($, e, next) => next(e))

  on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => {
    if (e.props.hasSurvey) return next(e)

    const { Box, Button, Text } = $.ui.resolve(e)
    const working = (await read($, status)) === 'working'
    const canUndo = (await read($, original)) !== null

    if (working) {
      return (
        <Box>
          <Text dimColor>✨ Promoting your prompt… </Text>
          <Button key="cancel" label="Cancel" onPress={() => void cancel($)} />
        </Box>
      )
    }

    return (
      <Box>
        <Button
          key="promote"
          label="✨ Promote master"
          variant="primary"
          onPress={() => void promoteDraft($)}
        />
        {canUndo && <Text> </Text>}
        {canUndo && <Button key="undo" label="Undo" onPress={() => void undo($)} />}
        <Text dimColor>
          {canUndo ? '  Rewritten. Review it, then send.' : '  Rewrites the prompt below'}
        </Text>
      </Box>
    )
  })
}
