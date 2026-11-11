# Promote master

A Claude Code mod that turns a rough prompt into a clearer one before you send it.

Type your prompt the way it comes to you, then click **✨ Promote master** in the strip just above the prompt box. The rewritten prompt replaces your draft in the box. Nothing is sent: you read it, edit it if you like, and send it yourself. **Undo** puts your original draft back.

- Keeps your meaning, names, file paths, numbers and code exactly, and adds no requirements you didn't give.
- Writes in the same language you typed (Arabic stays Arabic, English stays English).
- Reads the current conversation by default, so words like "it" or "that file" get spelled out.
- Never overwrites your draft if you keep typing while it works.
- `/promote <rough prompt>` does the same thing as a command.

## Install

At the prompt of a terminal session:

```
/plugin install prompt-master --marketplace abdulrahmanalmusallam-hub/prompt-master
```

Answer `y` to add the marketplace, then pick a scope (user installs it for every session).

From a shell:

```bash
claude plugin install prompt-master --marketplace abdulrahmanalmusallam-hub/prompt-master
```

In the Claude desktop app, where `/plugin` does not run: click **+** next to the prompt box, then **Plugins**, **Add marketplace** with `abdulrahmanalmusallam-hub/prompt-master`, then **Add plugin**.

## Settings

| Option | Default | What it does |
| --- | --- | --- |
| `useConversation` | on | Let the rewrite read the current chat so vague references become specific. Uses the session's own model. |
| `model` | `sonnet` | The model that rewrites when the chat isn't used (or there is no chat yet): `sonnet`, `opus` or `haiku`. |

Change them with `/plugin configure prompt-master@prompt-master`.

## Requirements

Claude Code 2.1.317 or newer (tested on 2.1.317 and 2.1.321). The button draws in the terminal and in the desktop app.
