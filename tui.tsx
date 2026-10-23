/** @jsxImportSource @opentui/solid */
import type { SessionStatsInfo } from "@opencode/client"
import { Plugin } from "@opencode/plugin/tui"
import type { Context } from "@opencode/plugin/tui/context"
import { For, Show, createSignal } from "solid-js"

const RANGES = ["all", "30d", "7d", "today"] as const
type Range = (typeof RANGES)[number]

type Settings = {
  visible: boolean
  range: Range
}

const RANGE_LABELS: Record<Range, string> = {
  all: "ALL TIME",
  "30d": "LAST 30 DAYS",
  "7d": "LAST 7 DAYS",
  today: "TODAY",
}

const RANGE_SHORT: Record<Range, string> = {
  all: "all",
  "30d": "30d",
  "7d": "7d",
  today: "today",
}

const REFRESH_EVENTS = new Set([
  "session.created",
  "session.deleted",
  "session.execution.failed",
  "session.execution.interrupted",
  "session.execution.succeeded",
  "session.idle",
  "session.moved",
  "session.usage.updated",
  "session.viewed",
  "project.updated",
])

function totalTokens(tokens: SessionStatsInfo["tokens"]) {
  return tokens.input + tokens.output + tokens.reasoning + tokens.cache.read + tokens.cache.write
}

function decimal(value: number) {
  return value >= 100 ? value.toFixed(0) : value.toFixed(1).replace(/\.0$/, "")
}

function compact(value: number) {
  if (!Number.isFinite(value) || value <= 0) return "0"
  if (value >= 1_000_000_000) return `${decimal(value / 1_000_000_000)}b`
  if (value >= 1_000_000) return `${decimal(value / 1_000_000)}m`
  if (value >= 1_000) return `${decimal(value / 1_000)}k`
  return String(Math.round(value))
}

function money(value: number) {
  if (!value) return "$0.00"
  return `$${value.toFixed(value >= 1 ? 2 : 4)}`
}

function truncate(value: string, width: number) {
  return value.length <= width ? value : `${value.slice(0, Math.max(1, width - 1))}…`
}

function successRate(stats: SessionStatsInfo) {
  if (stats.tools.mode === "none" || stats.tools.totals.calls === 0) return undefined
  return (stats.tools.totals.succeeded / stats.tools.totals.calls) * 100
}

function normalizeRange(value: unknown): Range {
  return RANGES.includes(value as Range) ? (value as Range) : "all"
}

const RANGE_ALIASES: Record<string, Range> = {
  all: "all",
  lifetime: "all",
  forever: "all",
  "30d": "30d",
  "30": "30d",
  month: "30d",
  monthly: "30d",
  "7d": "7d",
  "7": "7d",
  week: "7d",
  weekly: "7d",
  today: "today",
  day: "today",
  daily: "today",
  "1d": "today",
  "24h": "today",
}

function resolveRangeInput(input: string | undefined): { range?: Range; invalid?: string } {
  if (!input?.trim()) return {}
  const tokens = input
    .trim()
    .toLowerCase()
    .split(/\s+/)
    .map((token) => token.replace(/^\//, ""))
    .filter((token) => token && token !== "usage-range")
  if (tokens.length === 0) return {}
  for (const token of tokens) {
    const range = RANGE_ALIASES[token]
    if (range) return { range }
  }
  return { invalid: tokens.join(" ") }
}

function nextRange(range: Range): Range {
  return RANGES[(RANGES.indexOf(range) + 1) % RANGES.length]
}

function rangeFrom(range: Range, now: number, timeZone: string): number | undefined {
  if (range === "all") return undefined
  if (range === "today") return startOfDay(now, timeZone)
  const days = range === "7d" ? 7 : 30
  return now - days * 24 * 60 * 60 * 1000
}

function timeZoneOffset(epoch: number, timeZone: string): number {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    hour12: false,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  }).formatToParts(new Date(epoch))
  const get = (type: Intl.DateTimeFormatPartTypes) => {
    const value = parts.find((part) => part.type === type)?.value
    return value === undefined ? 0 : Number(value)
  }
  const hour = get("hour") % 24
  const asUTC = Date.UTC(get("year"), get("month") - 1, get("day"), hour, get("minute"), get("second"))
  return asUTC - epoch
}

function startOfDay(now: number, timeZone: string): number {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date(now))
  const get = (type: Intl.DateTimeFormatPartTypes) => {
    const value = parts.find((part) => part.type === type)?.value
    return value === undefined ? 0 : Number(value)
  }
  const midnight = Date.UTC(get("year"), get("month") - 1, get("day"))
  let result = midnight
  for (let index = 0; index < 2; index++) {
    result = midnight - timeZoneOffset(result, timeZone)
  }
  return result
}

function UsagePanel(props: {
  theme: Context["theme"]
  stats: () => SessionStatsInfo | undefined
  error: () => string | undefined
  range: () => Range
  limit: number
}) {
  const theme = props.theme

  return (
    <box flexDirection="column" gap={0} marginTop={1}>
      <text fg={theme.text.muted}>{`USAGE · ${RANGE_LABELS[props.range()]}`}</text>
      <Show
        when={props.stats()}
        fallback={<text fg={theme.text.muted}>{props.error() ?? "Loading usage…"}</text>}
      >
        {(value) => {
          // Keep the accessor: Show does not re-run its child when stats change.
          const stats = value
          const rate = () => successRate(stats())
          const rateText = () => {
            const current = rate()
            return current === undefined ? undefined : `${current.toFixed(1)}%`
          }
          return (
            <box flexDirection="column" gap={0}>
              <text fg={theme.text.base}>{`${stats().sessions} sessions · ${stats().prompts} prompts`}</text>
              <text fg={theme.text.base}>{`${stats().steps} steps · ${compact(totalTokens(stats().tokens))} tokens`}</text>
              <text fg={theme.text.muted}>{`${money(stats().cost)} · ${stats().activeDays} active days`}</text>
              <text fg={theme.text.muted}>
                {rateText() ? `tools ${rateText()} · ${stats().streak}d streak` : `${stats().streak}d streak`}
              </text>
              <text fg={theme.text.muted}>MODELS</text>
              <Show when={stats().models.length > 0} fallback={<text fg={theme.text.muted}>no model usage yet</text>}>
                <For each={stats().models.slice(0, props.limit)}>
                  {(model) => (
                    <text fg={theme.text.base} wrapMode="none" truncate>
                      {`${truncate(model.model.id, 22).padEnd(22)} ${compact(totalTokens(model.tokens)).padStart(5)}`}
                    </text>
                  )}
                </For>
              </Show>
              <Show when={props.error()}>
                {(message) => (
                  <text fg={theme.text.feedback.warning.base} wrapMode="word">
                    {message()}
                  </text>
                )}
              </Show>
            </box>
          )
        }}
      </Show>
    </box>
  )
}

function HomeStatus(props: {
  theme: Context["theme"]
  stats: () => SessionStatsInfo | undefined
  range: () => Range
}) {
  return (
    <Show when={props.stats()}>
      {(value) => {
        // Keep the accessor so refreshes update the footer without remounting.
        const stats = value
        return (
          <text fg={props.theme.text.muted}>
            {`${RANGE_SHORT[props.range()]} · ${compact(totalTokens(stats().tokens))} tok · ${money(stats().cost)} · ${stats().sessions} chats`}
          </text>
        )
      }}
    </Show>
  )
}

export default Plugin.define({
  id: "usage-stats.cli",
  setup(context) {
    const limit =
      typeof context.options.limit === "number" && context.options.limit > 0
        ? Math.floor(context.options.limit)
        : 5
    const refreshSeconds =
      typeof context.options.refreshSeconds === "number" && context.options.refreshSeconds >= 5
        ? Math.floor(context.options.refreshSeconds)
        : 60
    const timezone =
      typeof context.options.timezone === "string"
        ? context.options.timezone
        : Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC"

    const [settings, updateSettings] = context.storage.store("settings", {
      initial: { visible: context.options.defaultVisible !== false, range: "all" } as Settings,
    })
    const currentRange = () => normalizeRange(settings.range)
    const [stats, setStats] = createSignal<SessionStatsInfo>()
    const [error, setError] = createSignal<string>()

    let disposed = false
    let inFlight = false
    let queued = false
    let debounce: ReturnType<typeof setTimeout> | undefined

    const refresh = async (force = false) => {
      if (disposed) return
      if (!force && !settings.visible) return
      if (inFlight) {
        queued = true
        return
      }

      inFlight = true
      const range = currentRange()
      const to = Date.now()
      const from = rangeFrom(range, to, timezone)
      try {
        const next = await context.client.session.stats({
          tools: "summary",
          timezone,
          ...(from === undefined ? {} : { from, to }),
        })
        if (disposed || currentRange() !== range) return
        setStats(next)
        setError(undefined)
      } catch (cause) {
        if (disposed || currentRange() !== range) return
        const message = cause instanceof Error ? cause.message : String(cause)
        setError(message.length > 80 ? `${message.slice(0, 77)}…` : message)
      } finally {
        inFlight = false
        if (queued && !disposed) {
          queued = false
          void refresh()
        }
      }
    }

    const schedule = () => {
      if (debounce) clearTimeout(debounce)
      debounce = setTimeout(() => {
        debounce = undefined
        void refresh()
      }, 1200)
    }

    const stopEvents = context.data.listen(({ details }) => {
      if (!settings.visible || !REFRESH_EVENTS.has(details.type)) return
      schedule()
    })
    const timer = setInterval(() => void refresh(), refreshSeconds * 1000)

    context.ui.slot({
      append: "sidebar.content",
      render: () => (
        <Show when={settings.visible}>
          <UsagePanel theme={context.theme} stats={stats} error={error} range={currentRange} limit={limit} />
        </Show>
      ),
    })

    context.ui.slot({
      append: "home.footer.status",
      render: () => (
        <Show when={settings.visible}>
          <HomeStatus theme={context.theme} stats={stats} range={currentRange} />
        </Show>
      ),
    })

    context.keymap.layer(() => ({
      mode: "global",
      priority: 10,
      commands: [
        {
          id: "usage.toggle",
          title: "Toggle usage stats",
          description: "Show or hide local usage statistics",
          group: "Usage",
          bind: "ctrl+alt+s",
          palette: true,
          slash: { name: "usage" },
          suggested: true,
          run: () => {
            const visible = !settings.visible
            void updateSettings((draft) => {
              draft.visible = visible
            })
            if (visible) void refresh(true)
            context.ui.toast.show({
              message: visible
                ? "Usage stats on · open the session sidebar for details"
                : "Usage stats off",
              variant: "info",
            })
          },
        },
        {
          id: "usage.range",
          title: "Cycle usage range",
          description: "Switch usage stats between all time, 30 days, 7 days, and today",
          group: "Usage",
          bind: "ctrl+alt+r",
          palette: true,
          slash: { name: "usage-range", arguments: true },
          run: async (input) => {
            const argument = resolveRangeInput(input)
            if (argument.invalid) {
              context.ui.toast.show({
                message: `Unknown range "${argument.invalid}" — use all, 30d, 7d, or today`,
                variant: "warning",
              })
              return
            }
            const range = argument.range ?? nextRange(currentRange())
            if (input?.trim()) {
              try {
                context.keymap.dispatch("prompt.clear")
              } catch {
                // The prompt may not be focused when invoked outside slash completion.
              }
            }
            await updateSettings((draft) => {
              draft.range = range
            })
            void refresh(true)
            context.ui.toast.show({
              message: `Usage range: ${RANGE_LABELS[range]}`,
              variant: "info",
            })
          },
        },
        {
          id: "usage.refresh",
          title: "Refresh usage stats",
          group: "Usage",
          palette: true,
          slash: { name: "usage-refresh" },
          run: async () => {
            await refresh(true)
            const failure = error()
            context.ui.toast.show({
              message: failure ? "Usage stats unavailable" : "Usage stats refreshed",
              variant: failure ? "warning" : "success",
            })
          },
        },
      ],
      bindings: ["usage.toggle", "usage.range"],
    }))

    void refresh()

    return () => {
      disposed = true
      if (debounce) clearTimeout(debounce)
      clearInterval(timer)
      stopEvents()
    }
  },
})
