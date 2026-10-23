# Usage Stats for OpenCode

An OpenCode V2 TUI plugin that shows local usage statistics in the session sidebar.

It aggregates **all models and all chats** handled by the connected OpenCode server, not only the currently open session.

Tested with OpenCode `2.0.32`.

## Features

- Session, prompt, step, token, and cost totals.
- Active days and streak.
- Tool-call success rate.
- Top models by token usage.
- All-time, 30-day, 7-day, and today ranges.
- Toggleable sidebar panel and a compact home-screen footer summary.

## Install

### From GitHub

```sh
opencode plugin add github:sripadt/opencode-usage-stats
```

This requires `package.json` at the repository root. Private repositories require working Git credentials.

`opencode plugin add` writes the global OpenCode plugin config. If you specifically want CLI-only wiring (active while connected to a remote server), add the package to `~/.config/opencode/cli.json` instead. Do not configure it in both places.

Restart OpenCode after installation.

### From a local checkout

Add the checkout path to your CLI/TUI plugin config:

```json
{
  "$schema": "https://opencode.ai/v2/cli.json",
  "plugins": ["/absolute/path/to/opencode-usage-stats"]
}
```

The CLI config lives at `~/.config/opencode/cli.json`. Putting the plugin there keeps it active even when the CLI is connected to a remote server.

For a project-scoped install, add the package or checkout path to `opencode.json(c)` instead. Do not configure the plugin in both places at once.

## Usage

Open a session and show the sidebar with `Ctrl+X`, then `B` by default. The usage block is appended after the existing sidebar content, below the active MCP list.

```text
USAGE · ALL TIME
123 sessions · 456 prompts
789 steps · 12.3m tokens
$1.23 · 7 active days
tools 98.0% · 4d streak
MODELS
model-name             1.2m
another-model          0.8m
```

Values above are examples. Model IDs are truncated to 22 characters.

A compact summary is also added to the home screen footer:

```text
all · 12.3m tok · $1.23 · 123 chats
```

## Controls

| Action | Keybind | Slash command | Palette |
| --- | --- | --- | --- |
| Show/hide stats | `Ctrl+Alt+S` | `/usage` | Toggle usage stats |
| Cycle range | `Ctrl+Alt+R` | `/usage-range` | Cycle usage range |
| Set a specific range | — | `/usage-range 7d` | — |
| Refresh now | — | `/usage-refresh` | Refresh usage stats |

Visibility and range are persisted in OpenCode plugin storage.

If a keybind is intercepted by your terminal or OS, use the slash command or the command palette instead.

### Ranges

`/usage-range` cycles through:

```text
ALL TIME → LAST 30 DAYS → LAST 7 DAYS → TODAY → ALL TIME
```

It also accepts an explicit value:

```text
/usage-range all
/usage-range 30d
/usage-range 7d
/usage-range today
```

Aliases such as `month`, `week`, and `daily` are accepted too.

`TODAY` means from midnight in the configured timezone to now. `7d` and `30d` are rolling windows, not calendar weeks or months.

## Configuration

The CLI config schema accepts an object form, which allows plugin options:

```json
{
  "$schema": "https://opencode.ai/v2/cli.json",
  "plugins": [
    {
      "package": "opencode-usage-stats",
      "options": {
        "limit": 5,
        "refreshSeconds": 60,
        "timezone": "Europe/Berlin",
        "defaultVisible": true
      }
    }
  ]
}
```

If you use a local checkout instead of a package name, put its path in `package`.

| Option | Default | Description |
| --- | --- | --- |
| `limit` | `5` | Number of models shown in the sidebar. |
| `refreshSeconds` | `60` | Background refresh interval. Values below `5` fall back to `60`. |
| `timezone` | System timezone | Timezone used for day/streak calculations and the `TODAY` boundary. |
| `defaultVisible` | `true` | Initial visibility on first run. A saved toggle state takes precedence afterward. |

With no options, the plugin uses the defaults above.

## How it loads

```json
{
  "exports": {
    ".": "./index.ts",
    "./tui": "./tui.tsx"
  }
}
```

- `./tui` is the actual TUI plugin. It registers the sidebar slot, home footer, commands, keybinds, and stats fetching.
- `.` is a no-op server entry so the package is recognized as an OpenCode plugin. It does not add server-side behavior.

## Data source

The plugin calls the connected server's stats endpoint through the OpenCode client:

```ts
context.client.session.stats({
  tools: "summary",
  timezone,
  from,
  to,
})
```

That is the same data used by `opencode stats --all` for the all-time range. It comes from the server's OpenCode database when connected to a local server. If the CLI is connected to a remote server, the numbers are for that remote server.

The plugin only talks to the connected OpenCode server. It does not call third-party services.

## Refresh behavior

- On relevant session events, debounced by 1.2 seconds.
- Every `refreshSeconds` seconds while visible.
- Immediately after `/usage-refresh`, a range change, or toggling stats on.

Stale responses are ignored if the range changed while a request was in flight.

## Development

```sh
git clone https://github.com/sripadt/opencode-usage-stats.git
cd opencode-usage-stats
npm install
npx tsc -p tsconfig.json
```

There are no tests, lint, formatter, or codegen scripts. Typecheck is the only automated verification.

Restart OpenCode after changing the plugin. `opencode reload` reloads configuration, not local plugin code.

## Files

| File | Purpose |
| --- | --- |
| `tui.tsx` | TUI plugin: sidebar block, home footer, commands, range switching, data fetching. |
| `index.ts` | No-op server entry so the package is recognized by OpenCode. |
| `package.json` | Package name and `"."` / `"./tui"` exports. |
| `tsconfig.json` | Type-check configuration. |

## Troubleshooting

- **Nothing appears in the sidebar** — open the session sidebar (`Ctrl+X`, then `B`) and make sure stats are enabled (`Ctrl+Alt+S` or `/usage`). The block is at the bottom of the sidebar content.
- **`/usage` or `/usage-range` is missing** — the plugin is not loaded. Check the `plugins` entry in your OpenCode config and restart.
- **Numbers look empty** — the selected range may have no activity. Try `/usage-range all`.
- **A keybind does nothing** — the terminal or OS may be capturing it. Use the slash command or palette entry.
- **Cost is `$0.00`** — free/local models often report zero cost; this is expected.
