/** Slash-command registry and help text for the terminal. */

export const COMMANDS = {
  '/help': 'Show available commands and keyboard shortcuts',
  '/models': 'List available AI models and switch the active one',
  '/model <name>': 'Switch to a specific model by name or number',
  '/clear': 'Clear the terminal output',
  '/reset': 'Reset the conversation history',
  '/system': 'Show or set a custom system prompt',
}

const BORDER = '─'
const W = 56 // inner width

function pad(text, width) {
  return text + ' '.repeat(Math.max(0, width - text.length))
}

function row(text) {
  return `│ ${pad(text, W - 2)} │`
}

function divider(left = '├', right = '┤') {
  return `${left}${BORDER.repeat(W)}${right}`
}

export function getHelpText() {
  return [
    `┌${BORDER.repeat(W)}┐`,
    row('  MELVIN AI TERMINAL — COMMANDS'),
    divider(),
    row('  /help              Show this message'),
    row('  /models            List & switch AI models interactively'),
    row('  /model <name>      Switch to a model by name directly'),
    row('  /clear             Clear terminal output'),
    row('  /reset             Reset conversation history'),
    row('  /system            Show current system prompt'),
    row('  /system <text>     Set a custom system prompt'),
    divider(),
    row('  KEYBOARD SHORTCUTS'),
    divider(),
    row('  ↑ / ↓             Browse command history'),
    row('  Ctrl + C          Cancel streaming response'),
    row('  Ctrl + L          Clear terminal'),
    divider(),
    row('  SUPPORTED BASE MODELS'),
    divider(),
    row('  llama   qwen   gemma   deepseek   kimi (cloud)'),
    row('  Pull with: ollama pull <model>'),
    row('  Create Melvin: see melvin/README.md'),
    divider('└', '┘'),
  ].join('\n')
}
