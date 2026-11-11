import { expect, test } from 'claude-code/testing'

const BAND = {
  plugin: 'prompt-master',
  component: 'AbovePrompt',
  requestId: 'above-prompt',
  props: {
    hasSurvey: false,
    isWorking: false,
    maxRows: 10,
    bodyColumns: 80,
    scroll: { offset: 0, bodyRows: 9 },
    view: {},
  },
} as const

const USAGE = {
  input_tokens: 10,
  output_tokens: 10,
  cache_read_input_tokens: 0,
  cache_creation_input_tokens: 0,
}

test('the button rewrites the draft and offers Undo, on terminal and desktop', async ($, on) => {
  // Nothing sits beneath the plugin: these hooks stand for the engine.
  let box = 'fix teh login bug its broken'
  const asked: string[] = []

  on('prompt.read', () => ({ value: { text: box, cursor: box.length } }))
  on('prompt.fill', (_, e) => {
    box = e.text
    return { isFilled: true }
  })
  on('model.fork', () => ({
    value: { isAnswered: false, reason: 'nothing-to-fork', usage: USAGE },
  }))
  on('model.complete', (_, e) => {
    asked.push(e.prompt)
    return {
      value: {
        isAnswered: true,
        text: '<improved_prompt>Fix the login bug: sign-in is broken.</improved_prompt>',
        usage: USAGE,
      },
    }
  })

  for (const surface of ['terminal', 'desktop'] as const) {
    box = 'fix teh login bug its broken'
    const ui = await $.ui.mount({ ...BAND, surface })

    expect(await ui.find({ key: 'promote' })).toBeDefined()
    expect(await ui.find({ key: 'undo' })).toBeUndefined()

    await ui.press({ key: 'promote' })

    expect(box).toBe('Fix the login bug: sign-in is broken.')
    expect(asked.at(-1)).toContain('fix teh login bug its broken')
    expect(await ui.find({ key: 'undo' })).toBeDefined()

    await ui.press({ key: 'undo' })

    expect(box).toBe('fix teh login bug its broken')
    expect(await ui.find({ key: 'undo' })).toBeUndefined()
    await ui.unmount()
  }
})

test('an empty prompt box asks for a draft and calls no model', async ($, on) => {
  const toasts: string[] = []
  let calls = 0

  on('prompt.read', () => ({ value: { text: '   ', cursor: 0 } }))
  on('ui.toast', (_, e) => {
    toasts.push(e.text)
    return { value: undefined }
  })
  on('model.complete', () => {
    calls += 1
    return { value: { isAnswered: false, reason: 'empty-reply', usage: USAGE } }
  })

  const ui = await $.ui.mount({ ...BAND, surface: 'desktop' })
  await ui.press({ key: 'promote' })

  expect(calls).toBe(0)
  expect(toasts.at(-1)).toContain('Type a rough prompt first')
  await ui.unmount()
})

test('text typed during the rewrite is never overwritten', async ($, on) => {
  const toasts: string[] = []
  let reads = 0
  let filled = false

  // The first read is the draft; by the second the person has kept typing.
  on('prompt.read', () => {
    reads += 1
    const text = reads === 1 ? 'draft' : 'draft and more'
    return { value: { text, cursor: text.length } }
  })
  on('prompt.fill', () => {
    filled = true
    return { isFilled: true }
  })
  on('ui.toast', (_, e) => {
    toasts.push(e.text)
    return { value: undefined }
  })
  on('model.fork', () => ({
    value: { isAnswered: true, text: '<improved_prompt>Better draft</improved_prompt>', usage: USAGE },
  }))

  const ui = await $.ui.mount({ ...BAND, surface: 'desktop' })
  await ui.press({ key: 'promote' })

  expect(filled).toBe(false)
  expect(toasts.at(-1)).toContain('left as is')
  await ui.unmount()
})

test('the band yields to a survey', async ($, on) => {
  on('ui.render', ($, e) => {
    const { Text } = $.ui.resolve(e)
    return <Text>engine</Text>
  })

  const ui = await $.ui.mount({
    ...BAND,
    surface: 'desktop',
    props: { ...BAND.props, hasSurvey: true },
  })

  expect(await ui.find({ key: 'promote' })).toBeUndefined()
  await ui.unmount()
})
