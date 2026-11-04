"use client"

/*
 * Review focus: Main application flow, authentication, Firestore items, themes, and chat.
 */

import { useState, useEffect, useMemo, useRef } from "react"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { DirectionAwareHover } from "@/components/direction-aware-hover"
import { CheckCircle2, AlertTriangle, Loader2, Send, Plus, XCircle, HelpCircle, X, RotateCw, ExternalLink, Trash2, ClipboardPaste, Search, Globe, PanelLeftClose, PanelLeftOpen, SquarePen, MoreVertical, Pin, PinOff, Pencil, MessageSquare, Sparkles, TrendingUp, ShieldCheck, Trophy, Compass, Flame, LockKeyhole } from "lucide-react"
import { computeProgress, HEATMAP_WEEKS, type ProgressStats } from "@/lib/progress"
import { cn } from "@/lib/utils"
import { auth, db, googleProvider } from "@/lib/firebase/config"
import {
  addDoc,
  collection,
  doc,
  getDocs,
  limit,
  onSnapshot,
  orderBy,
  query,
  Timestamp,
  updateDoc,
  deleteDoc,
  where,
  writeBatch,
} from "firebase/firestore"
import { onAuthStateChanged, signInWithPopup, signOut, type User } from "firebase/auth"
import { addVideoToFirestore } from "@/lib/firestore-helpers"
import { ThemeControls } from "@/components/theme-controls"
import { UserProfileDropdown } from "@/components/user-profile-dropdown"
import { EmailAuthForm } from "@/components/email-auth-form"
import { SettingsDialog } from "@/components/settings-dialog"
import { ChestifyLogo } from "@/components/chestify-logo"
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu"
import { SmallThumb, ThumbnailPlaceholder, platformName } from "@/components/thumbnail-placeholder"
import ReactMarkdown from "react-markdown"

type TimestampValue = Timestamp | { seconds: number } | Date | string | number

// Converts Firestore Timestamp, serialized seconds, Date, or primitive date
// values into the short date format used by the Recent Activity list.
function formatShortDate(timestamp: TimestampValue): string {
  try {
    let date: Date;
    if (timestamp instanceof Timestamp) {
      date = timestamp.toDate();
    } else if (typeof timestamp === "object" && "seconds" in timestamp) {
      date = new Date(timestamp.seconds * 1000);
    } else {
      date = new Date(timestamp);
    }
    
    return date.toLocaleDateString('en-GB', { 
      day: 'numeric', 
      month: 'short', 
      year: 'numeric' 
    });
  } catch (error) {
    return 'Just now';
  }
}

// Same conversions as formatShortDate, returning a Date (or null if unusable).
function toDate(timestamp?: TimestampValue): Date | null {
  if (!timestamp) return null
  const date =
    timestamp instanceof Timestamp
      ? timestamp.toDate()
      : typeof timestamp === "object" && "seconds" in timestamp
        ? new Date(timestamp.seconds * 1000)
        : new Date(timestamp)
  return Number.isNaN(date.getTime()) ? null : date
}

type TabType = "library" | "add" | "chat" | "progress"

type VideoStatus = "processing" | "verified" | "misleading" | "false" | "unverified" | "error"
type Verdict = "true" | "half_truth" | "false" | "unverified"
// Failed checks ('error') display as Unverified, so every card has one of the
// four verdicts or is still processing.
type DisplayState = Verdict | "processing"
type FilterType = "all" | Verdict | "processing"

type CitedSource = {
  title: string
  domain: string
  url: string
  point?: string
}

type VideoItem = {
  id: string
  url: string
  title: string
  summary: string
  category: string
  tags: string[]
  thumbnail?: string
  status: VideoStatus
  error_message?: string
  created_at?: TimestampValue
  accuracy_score?: number | null
  score_reason?: string
  verdict?: Verdict
  one_line_summary?: string
  highlight?: string
  main_false_claim?: string
  conclusion?: string
  trust_note?: string
  sources_for?: CitedSource[]
  sources_against?: CitedSource[]
  sources_context?: CitedSource[]
  sources?: CitedSource[]
  fact_check?: {
    status?: string
    reason?: string
    source_link?: string
  }
}

// Saved chats live in users/{uid}/chats/{chatId}, messages in its
// messages subcollection. A chat started from a video card keeps that
// video's analysis as context and is reopened for the same video.
type ChatMessage = {
  id: string
  role: "user" | "assistant"
  content: string
  // Set on answers that used web search.
  sources?: CitedSource[]
}

type ChatSummary = {
  id: string
  title: string
  video_id?: string | null
  video_title?: string | null
  context?: string | null
  updated_at?: TimestampValue
  pinned?: boolean
}

// Resolves what a card should show. New items carry `verdict`; older items
// only have the legacy status + fact_check.status, which map onto the bands.
function getDisplayState(item: VideoItem): DisplayState {
  if (item.status === "processing") return "processing"
  if (item.status === "error") return "unverified"
  if (item.verdict) return item.verdict
  if (item.status === "verified") return "true"
  if (item.status === "false" || item.fact_check?.status === "False") return "false"
  if (item.status === "misleading") return "half_truth"
  return "unverified"
}

// Colors per verdict: green = true, yellow = half-truth, red = false, grey = unverified.
const VERDICT_META: Record<
  Verdict,
  {
    label: string
    filterLabel: string
    icon: string
    pill: string
    dot: string
    cardDark: string
    cardLight: string
    box: string
    boxText: string
    highlight: string
    link: string
    button: string
  }
> = {
  true: {
    label: "✓ MOSTLY TRUE",
    filterLabel: "True",
    icon: "text-emerald-400",
    pill: "bg-emerald-500 text-white",
    dot: "bg-emerald-400",
    cardDark: "border-emerald-500/30 hover:border-emerald-500/60 hover:shadow-[0_20px_50px_-12px_rgba(16,185,129,0.4)]",
    cardLight: "border-emerald-300 hover:border-emerald-400 hover:shadow-[0_20px_50px_-12px_rgba(16,185,129,0.3)]",
    box: "bg-emerald-500/20 border-emerald-400/40",
    boxText: "text-emerald-300",
    highlight: "text-emerald-300",
    link: "text-emerald-300 hover:text-emerald-200",
    button: "bg-emerald-500/30 text-emerald-200 hover:bg-emerald-500/40 border-emerald-400/40",
  },
  half_truth: {
    label: "⚠ HALF-TRUTH",
    filterLabel: "Half-truth",
    icon: "text-yellow-400",
    pill: "bg-yellow-400 text-black",
    dot: "bg-yellow-400",
    cardDark: "border-yellow-500/40 hover:border-yellow-500/70 hover:shadow-[0_20px_50px_-12px_rgba(234,179,8,0.4)]",
    cardLight: "border-yellow-300 hover:border-yellow-400 hover:shadow-[0_20px_50px_-12px_rgba(234,179,8,0.3)]",
    box: "bg-yellow-500/20 border-yellow-400/40",
    boxText: "text-yellow-300",
    highlight: "text-yellow-300",
    link: "text-yellow-300 hover:text-yellow-200",
    button: "bg-yellow-500/30 text-yellow-200 hover:bg-yellow-500/40 border-yellow-400/40",
  },
  false: {
    label: "✕ FALSE",
    filterLabel: "False",
    icon: "text-red-500",
    pill: "bg-red-600 text-white",
    dot: "bg-red-500",
    cardDark: "border-red-500/40 hover:border-red-500/70 hover:shadow-[0_20px_50px_-12px_rgba(239,68,68,0.4)]",
    cardLight: "border-red-300 hover:border-red-400 hover:shadow-[0_20px_50px_-12px_rgba(239,68,68,0.3)]",
    box: "bg-red-500/20 border-red-400/40",
    boxText: "text-red-300",
    highlight: "text-red-400",
    link: "text-red-300 hover:text-red-200",
    button: "bg-red-500/30 text-red-200 hover:bg-red-500/40 border-red-400/40",
  },
  unverified: {
    label: "? UNVERIFIED",
    filterLabel: "Unverified",
    icon: "text-zinc-400",
    pill: "bg-zinc-500 text-white",
    dot: "bg-zinc-400",
    cardDark: "border-zinc-500/30 hover:border-zinc-400/60 hover:shadow-[0_20px_50px_-12px_rgba(161,161,170,0.3)]",
    cardLight: "border-zinc-300 hover:border-zinc-400 hover:shadow-[0_20px_50px_-12px_rgba(161,161,170,0.3)]",
    box: "bg-zinc-500/20 border-zinc-400/40",
    boxText: "text-zinc-300",
    highlight: "text-white",
    link: "text-zinc-300 hover:text-zinc-200",
    button: "bg-zinc-500/30 text-zinc-200 hover:bg-zinc-500/40 border-zinc-400/40",
  },
}

const FILTERS: FilterType[] = ["all", "true", "half_truth", "false", "unverified", "processing"]

function filterLabel(filter: FilterType): string {
  if (filter === "all") return "All"
  if (filter === "processing") return "Processing"
  return VERDICT_META[filter].filterLabel
}

// Renders text with the first case-insensitive match of `highlight` bolded in
// the verdict color, e.g. "...donated $3.5M to **his own charity**".
function HighlightedText({ text, highlight, className }: { text: string; highlight?: string; className: string }) {
  const index = highlight ? text.toLowerCase().indexOf(highlight.toLowerCase()) : -1
  if (!highlight || index === -1) return <>{text}</>
  return (
    <>
      {text.slice(0, index)}
      <span className={cn("font-bold", className)}>{text.slice(index, index + highlight.length)}</span>
      {text.slice(index + highlight.length)}
    </>
  )
}

// Shown on the thumbnail until hover so the verdict reads at a glance: red X,
// yellow warning, green check, or grey question mark, plus the score.
function VerdictOverlay({ state, score }: { state: DisplayState; score?: number | null }) {
  if (state === "processing") return null
  const meta = VERDICT_META[state]
  const iconClass = cn("drop-shadow-[0_4px_12px_rgba(0,0,0,0.8)]", meta.icon)
  return (
    <div className={cn("absolute inset-0 flex items-center justify-center", state === "false" && "bg-red-950/30")}>
      {/* Same size and stroke for every verdict so no mark looks heavier than another. */}
      {state === "false" && <XCircle className={cn("w-2/5 h-2/5", iconClass)} strokeWidth={2.5} />}
      {state === "half_truth" && <AlertTriangle className={cn("w-2/5 h-2/5", iconClass)} strokeWidth={2.5} />}
      {state === "true" && <CheckCircle2 className={cn("w-2/5 h-2/5", iconClass)} strokeWidth={2.5} />}
      {state === "unverified" && <HelpCircle className={cn("w-2/5 h-2/5", iconClass)} strokeWidth={2.5} />}
      <ScorePill state={state} score={score} className="absolute top-4 right-4 px-3 py-1 text-sm shadow-lg" />
    </div>
  )
}

// Score badge in the verdict color; unscored items show a grey "N/A".
function ScorePill({ state, score, className }: { state: Verdict; score?: number | null; className?: string }) {
  const scored = typeof score === "number"
  return (
    <span className={cn("rounded-full font-bold", scored ? VERDICT_META[state].pill : VERDICT_META.unverified.pill, className)}>
      {scored ? `${score}/10` : "N/A"}
    </span>
  )
}

// Up to three citations for the card: direct evidence (contradicting first),
// else related background marked as such, else (older items) raw search results.
function cardSources(item: VideoItem): { list: CitedSource[]; related: boolean } {
  const pick = (sources: CitedSource[]) => {
    const seen = new Set<string>()
    return sources.filter((s) => s.url && !seen.has(s.url) && seen.add(s.url)).slice(0, 3)
  }
  const direct = pick([...(item.sources_against || []), ...(item.sources_for || [])])
  if (direct.length) return { list: direct, related: false }
  const context = pick(item.sources_context || [])
  if (context.length) return { list: context, related: true }
  return { list: pick(item.sources || []), related: false }
}

// Active theme definition, passed to module-level components so their accents follow it.
type Theme = (typeof themes)[keyof typeof themes]

// "#rrggbb" + alpha (0-1) -> "#rrggbbaa", for glows and tints in theme colors.
function withAlpha(hex: string, alpha: number): string {
  return hex + Math.round(alpha * 255).toString(16).padStart(2, "0")
}

type StepState = "done" | "active" | "pending"

// One row of the processing stepper (design from the dashboard prototype).
function ProcessingStep({ state, title, detail, last, theme }: { state: StepState; title: string; detail: string; last?: boolean; theme: Theme }) {
  return (
    <div className={cn("flex gap-3", state === "pending" && "opacity-50")}>
      <div className="flex flex-col items-center">
        {state === "done" ? (
          <div className={cn("flex h-6 w-6 items-center justify-center rounded-full bg-gradient-to-br text-xs", theme.buttonGradient, theme.buttonText)}>
            <CheckCircle2 className="h-4 w-4" />
          </div>
        ) : state === "active" ? (
          <div
            className="flex h-6 w-6 items-center justify-center rounded-full border-2 animate-spin"
            style={{ borderColor: theme.logo[0], borderTopColor: theme.logo[1] }}
          >
            <div className="h-2 w-2 rounded-full" style={{ background: theme.logo[0] }} />
          </div>
        ) : (
          <div className="h-6 w-6 rounded-full bg-white/25" />
        )}
        {!last && (
          <div className={cn("h-7 w-px", state === "done" ? cn("bg-gradient-to-b", theme.buttonGradient) : "bg-white/15")} />
        )}
      </div>
      <div>
        <p className="text-sm font-medium text-white">
          {title}
          {state === "active" && <span className={cn("animate-pulse", theme.icon)}> •</span>}
        </p>
        <p className={cn("text-xs", state === "done" ? "text-green-400" : state === "active" ? theme.icon : "text-white/60")}>
          {detail}
        </p>
      </div>
    </div>
  )
}

// Popup shown after adding a video. Steps advance on the item's real
// Firestore updates: the backend sets the title/thumbnail once yt-dlp has
// the captions, then the verdict when the fact-check finishes.
function ProcessingDialog({
  item,
  theme,
  onClose,
  onViewLibrary,
}: {
  item?: VideoItem
  theme: Theme
  onClose: () => void
  onViewLibrary: () => void
}) {
  const finished = !!item && item.status !== "processing"
  const fetched = finished || (!!item && !!item.title && item.title !== "Processing...")
  const failed = item?.status === "error"
  const state = item ? getDisplayState(item) : "processing"
  const meta = state === "processing" ? null : VERDICT_META[state]
  const oneLine = failed
    ? item?.error_message || "We couldn't finish checking this video."
    : item?.one_line_summary || item?.fact_check?.reason || ""

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
      aria-labelledby="processing-title"
    >
      <Card className="max-h-[92dvh] w-full max-w-4xl overflow-y-auto rounded-3xl border border-white/10 bg-[#0f0f11] p-6 shadow-2xl shadow-black/60 sm:p-10">
        <CardContent className="grid grid-cols-1 gap-8 p-0 md:grid-cols-2 md:gap-10">
          <div className="relative mx-auto flex aspect-[9/16] w-full max-w-[180px] items-center justify-center overflow-hidden rounded-2xl border border-white/10 bg-gradient-to-b from-white/25 via-white/10 to-black/70 shadow-inner shadow-white/10 sm:max-w-[260px] md:max-w-[min(100%,calc((92dvh_-_5rem)*9/16))]">
            {item?.thumbnail ? (
              <>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={item.thumbnail} alt="" className="absolute inset-0 h-full w-full object-cover" />
                {!finished && <div className="absolute inset-0 bg-black/40" />}
                {finished && <VerdictOverlay state={state} score={item.accuracy_score} />}
              </>
            ) : (
              <>
                <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top,rgba(255,255,255,0.35),transparent_42%),linear-gradient(115deg,transparent_28%,rgba(255,255,255,0.18)_48%,transparent_66%)] opacity-80 blur-sm" />
                <div
                  className="absolute -inset-10 animate-pulse blur-2xl"
                  style={{
                    background: `conic-gradient(from 180deg at 50% 45%, transparent, ${withAlpha(theme.logo[0], 0.16)}, transparent, ${withAlpha(theme.logo[1], 0.14)}, transparent)`,
                  }}
                />
              </>
            )}
            {!finished && (
              <div className="relative flex flex-col items-center gap-2">
                <div className="relative">
                  <Sparkles className={cn("h-16 w-16 -rotate-12", theme.icon)} style={{ filter: `drop-shadow(0 0 12px ${withAlpha(theme.logo[0], 0.9)})` }} />
                  <span className="absolute -right-2 -top-2 text-sm" style={{ color: theme.logo[1] }}>✦</span>
                </div>
                <span className={cn("bg-gradient-to-r bg-clip-text text-3xl font-semibold text-transparent", theme.gradientDark)}>AI</span>
              </div>
            )}
          </div>

          <div className="flex min-w-0 flex-col justify-center">
            <h2 id="processing-title" className="mb-2 text-2xl font-semibold tracking-tight text-white">
              {!finished ? "Analyzing Video Content..." : failed ? "Couldn't finish this check" : "Verdict ready"}
            </h2>
            <p className="mb-8 truncate text-sm text-white/50">{fetched && item?.title ? item.title : "Reading your link..."}</p>

            <div className="space-y-6">
              <ProcessingStep
                theme={theme}
                state={fetched ? "done" : "active"}
                title="Fetching video & captions"
                detail={fetched ? "Completed" : "Active"}
              />
              <ProcessingStep
                theme={theme}
                state={finished ? "done" : fetched ? "active" : "pending"}
                title="AI fact-checking with Google Search"
                detail={finished ? "Completed" : fetched ? "Usually 10–40 seconds" : "Pending"}
              />
              <ProcessingStep
                theme={theme}
                state={finished ? "done" : "pending"}
                title="Saving to Chest"
                detail={finished ? "Completed" : "Pending"}
                last
              />
            </div>

            {finished && meta && (
              <div className={cn("mt-6 rounded-lg border p-3 backdrop-blur-sm", meta.box)}>
                <div className="mb-1 flex items-center justify-between gap-2">
                  <p className={cn("text-xs font-semibold", meta.boxText)}>
                    {meta.label}
                    {failed && " · CHECK FAILED"}
                  </p>
                  {!failed && <ScorePill state={state as Verdict} score={item?.accuracy_score} className="px-2.5 py-0.5 text-xs" />}
                </div>
                <p className="text-sm leading-snug text-white/90">
                  <HighlightedText text={oneLine} highlight={failed ? undefined : item?.highlight} className={meta.highlight} />
                </p>
              </div>
            )}

            {finished ? (
              <div className="mt-6 flex gap-2">
                <Button onClick={onViewLibrary} className={cn("flex-1 rounded-full bg-gradient-to-r", theme.buttonGradient, theme.buttonText)}>
                  View in Library
                </Button>
                <Button
                  onClick={onClose}
                  variant="outline"
                  className="flex-1 rounded-full border-white/20 bg-white/5 text-white hover:bg-white/10"
                >
                  {failed ? "Close" : "Add another"}
                </Button>
              </div>
            ) : (
              <Button
                onClick={onClose}
                variant="outline"
                className="mt-6 w-full rounded-full border-white/20 bg-white/5 text-white hover:bg-white/10"
              >
                Run in Background
              </Button>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  )
}

type Suggestion = { topic: string; why: string; explore: string[]; caution: string }

type InsightsState =
  | { status: "idle" | "loading" }
  | { status: "ok"; suggestions: Suggestion[] }
  | { status: "not_enough"; needed: number }
  | { status: "error"; message: string }

const BADGE_ICONS: Record<string, typeof ShieldCheck> = {
  first: CheckCircle2,
  myth: X,
  skeptic: ShieldCheck,
  truth: Trophy,
  explorer: Compass,
  streak: Flame,
}

// Verdict colors for the topic bars, matching the Library cards.
const VERDICT_BAR: Record<Verdict, string> = {
  true: "bg-emerald-400",
  half_truth: "bg-yellow-400",
  false: "bg-red-500",
  unverified: "bg-zinc-500",
}

// Progress tab: layout and styling from the dashboard prototype, filled with
// stats computed from the user's checked videos plus cached AI suggestions.
function ProgressTab({
  stats,
  isDark,
  displayName,
  initials,
  insights,
  onRetryInsights,
  onAddVideo,
  theme,
}: {
  stats: ProgressStats
  theme: Theme
  isDark: boolean
  displayName: string
  initials: string
  insights: InsightsState
  onRetryInsights: () => void
  onAddVideo: () => void
}) {
  const card = cn("border backdrop-blur-xl", isDark ? "border-white/10 bg-[#0f0f11]/80" : "border-neutral-200 bg-white")
  const title = cn("text-lg", isDark ? "text-white" : "text-neutral-900")
  const muted = isDark ? "text-white/45" : "text-neutral-500"

  if (stats.checked === 0) {
    return (
      <Card className={cn(card, "mx-auto max-w-xl text-center")}>
        <CardContent className="space-y-4 p-10">
          <TrendingUp className={cn("mx-auto h-8 w-8", theme.icon)} />
          <h2 className={cn("text-xl font-semibold", isDark ? "text-white" : "text-neutral-900")}>Your progress starts here</h2>
          <p className={muted}>Check your first video to see what you&apos;re learning and how much misinformation you&apos;ve caught.</p>
          <Button onClick={onAddVideo} className={cn("rounded-full bg-gradient-to-r", theme.buttonGradient, theme.buttonText)}>
            <Plus className="mr-2 h-4 w-4" />
            Add a video
          </Button>
        </CardContent>
      </Card>
    )
  }

  const topTopic = stats.topics[0]?.name
  const maxTopic = stats.topics[0]?.total || 1
  const emptyCell = isDark ? "rgba(255,255,255,0.06)" : "#f5f5f5"
  const heatStyle = (count: number) => ({
    background: count === 0 ? emptyCell : withAlpha(theme.logo[0], count === 1 ? 0.4 : count === 2 ? 0.7 : 1),
  })

  return (
    <div className="space-y-8">
      <section className="w-full grid grid-cols-1 gap-6 lg:grid-cols-4" aria-label="Profile and quick stats">
        <Card className={cn("w-full h-full overflow-hidden", card)}>
          <CardContent className="relative flex h-full items-center gap-4 p-6">
            <div className="absolute -right-10 -top-16 h-40 w-40 rounded-full blur-3xl" style={{ background: withAlpha(theme.logo[0], 0.12) }} />
            <div className={cn("relative rounded-full bg-gradient-to-br p-[2px]", theme.buttonGradient)} style={{ boxShadow: `0 0 25px ${withAlpha(theme.logo[0], 0.3)}` }}>
              <div
                className={cn(
                  "flex h-16 w-16 items-center justify-center rounded-full text-xl font-semibold",
                  isDark ? "bg-[#17171b] text-white" : "bg-white text-neutral-900",
                )}
              >
                {initials}
              </div>
            </div>
            <div className="relative min-w-0">
              <p className={cn("text-xs uppercase tracking-[0.2em]", isDark ? "text-white/40" : "text-neutral-500")}>Chest member</p>
              <h3 className={cn("mt-1 truncate text-xl font-semibold", isDark ? "text-white" : "text-neutral-900")}>{displayName}</h3>
              <div className="mt-2 inline-flex items-center gap-1.5 rounded-full border border-orange-400/25 bg-orange-400/10 px-2.5 py-1 text-xs text-orange-300">
                <Flame className="h-3.5 w-3.5" />
                {stats.streak > 0 ? `Learning streak: ${stats.streak} day${stats.streak === 1 ? "" : "s"}` : "Check a video to start a streak"}
              </div>
            </div>
          </CardContent>
        </Card>
        <div className="col-span-1 grid h-full w-full items-stretch gap-6 sm:grid-cols-3 lg:col-span-3">
          {[
            { label: "Videos checked", value: stats.checked, detail: `+${stats.thisMonth} this month`, icon: TrendingUp, color: theme.icon },
            { label: "Misleading claims caught", value: stats.caught, detail: `${stats.falseCount} false, ${stats.caught - stats.falseCount} half-true`, icon: ShieldCheck, color: "text-red-400" },
            { label: "Topics explored", value: stats.topicsExplored, detail: topTopic ? `Most: ${topTopic}` : "", icon: Compass, color: theme.icon },
          ].map((metric) => (
            <Card key={metric.label} className={cn("h-full border backdrop-blur-md", isDark ? "border-white/10 bg-white/5" : "border-neutral-200 bg-white")}>
              <CardContent className="flex h-full flex-col p-5">
                <metric.icon className={cn("mb-5 h-5 w-5", metric.color)} />
                <p className={cn("text-2xl font-semibold", isDark ? "text-white" : "text-neutral-900")}>{metric.value}</p>
                <p className={cn("mt-1 text-sm", isDark ? "text-white/65" : "text-neutral-600")}>{metric.label}</p>
                <p className={cn("mt-2 text-xs", isDark ? "text-white/35" : "text-neutral-400")}>{metric.detail}</p>
              </CardContent>
            </Card>
          ))}
        </div>
      </section>

      <section className="grid gap-4 lg:grid-cols-[1.35fr_1fr]" aria-label="Activity and topics">
        <Card className={card}>
          <CardHeader className="pb-3">
            <CardTitle className={title}>Fact-Checking Activity</CardTitle>
            <CardDescription className={muted}>
              {stats.activityTotal} video{stats.activityTotal === 1 ? "" : "s"} checked in the last 12 weeks
            </CardDescription>
          </CardHeader>
          <CardContent>
            {/* Calendar heatmap: one column per week (Sunday on top), month names
                where a month starts, and Mon/Wed/Fri down the side. */}
            <div className={cn("rounded-lg p-3", isDark ? "bg-black/10" : "bg-neutral-50")}>
              <div
                className="grid gap-[3px] sm:gap-1"
                style={{ gridTemplateColumns: `auto repeat(${HEATMAP_WEEKS}, minmax(0, 1fr))` }}
              >
                {Array.from({ length: HEATMAP_WEEKS }, (_, week) => {
                  const month = stats.activity[week * 7].date.slice(0, 7)
                  const prev = week > 0 ? stats.activity[(week - 1) * 7].date.slice(0, 7) : ""
                  // Skip a partial first month if the next label is too close to fit.
                  const nextStart = stats.activity.findIndex((d, i) => i > week * 7 && i % 7 === 0 && d.date.slice(0, 7) !== month)
                  const show = month !== prev && !(week === 0 && nextStart !== -1 && nextStart / 7 < 3)
                  return show ? (
                    <span
                      key={`m${week}`}
                      className={cn("whitespace-nowrap text-[10px] sm:text-xs", isDark ? "text-white/45" : "text-neutral-500")}
                      style={{ gridColumn: week + 2, gridRow: 1 }}
                    >
                      {new Date(`${month}-01T00:00:00`).toLocaleString("en", { month: "short" })}
                    </span>
                  ) : null
                })}
                {[
                  ["Mon", 1],
                  ["Wed", 3],
                  ["Fri", 5],
                ].map(([label, weekday]) => (
                  <span
                    key={label}
                    className={cn("pr-1 text-[10px] leading-none sm:text-xs self-center", isDark ? "text-white/45" : "text-neutral-500")}
                    style={{ gridColumn: 1, gridRow: (weekday as number) + 2 }}
                  >
                    {label}
                  </span>
                ))}
                {stats.activity.map((day, i) => (
                  <div
                    key={day.date}
                    title={
                      day.future
                        ? undefined
                        : `${new Date(`${day.date}T00:00:00`).toLocaleDateString("en", { weekday: "short", day: "numeric", month: "short" })}: ${day.count} video${day.count === 1 ? "" : "s"}`
                    }
                    className={cn("aspect-square w-full rounded-[3px]", day.future && "invisible")}
                    style={{ gridColumn: Math.floor(i / 7) + 2, gridRow: (i % 7) + 2, ...(day.future ? {} : heatStyle(day.count)) }}
                  />
                ))}
              </div>
            </div>
            <div className={cn("mt-3 flex flex-wrap items-center gap-2 text-xs", isDark ? "text-white/55" : "text-neutral-500")}>
              <span>Less</span>
              {[0, 1, 2, 3].map((n) => (
                <span key={n} className="h-3 w-3 rounded-sm" style={heatStyle(n)} />
              ))}
              <span>More</span>
            </div>
          </CardContent>
        </Card>
        <Card className={card}>
          <CardHeader className="pb-3">
            <CardTitle className={title}>Knowledge Distribution</CardTitle>
            <CardDescription className={muted}>Where your curiosity is taking you, and how true it was</CardDescription>
          </CardHeader>
          <CardContent className="space-y-5">
            {stats.topics.slice(0, 8).map((topic) => {
              const misleading = topic.counts.false + topic.counts.half_truth
              return (
                <div key={topic.name}>
                  <div className="mb-2 flex justify-between gap-2 text-sm">
                    <span className={cn("truncate", isDark ? "text-white/75" : "text-neutral-700")}>{topic.name}</span>
                    <span className={cn("whitespace-nowrap", muted)}>
                      {topic.total} video{topic.total === 1 ? "" : "s"}
                      {misleading > 0 && ` · ${misleading} misleading`}
                    </span>
                  </div>
                  <div className={cn("h-2 rounded-full", isDark ? "bg-white/[0.07]" : "bg-neutral-100")}>
                    <div className="flex h-full overflow-hidden rounded-full" style={{ width: `${(topic.total / maxTopic) * 100}%` }}>
                      {(["true", "half_truth", "false", "unverified"] as Verdict[]).map((v) =>
                        topic.counts[v] ? (
                          <div key={v} className={VERDICT_BAR[v]} style={{ flexGrow: topic.counts[v] }} title={`${VERDICT_META[v].filterLabel}: ${topic.counts[v]}`} />
                        ) : null,
                      )}
                    </div>
                  </div>
                </div>
              )
            })}
            <div className={cn("flex flex-wrap items-center gap-4 text-xs", isDark ? "text-white/55" : "text-neutral-500")}>
              {(["true", "half_truth", "false", "unverified"] as Verdict[]).map((v) => (
                <div key={v} className="flex items-center gap-1.5">
                  <span className={cn("h-3 w-3 rounded-sm", VERDICT_BAR[v])} />
                  {VERDICT_META[v].filterLabel}
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </section>

      <section>
        <Card className={card}>
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between gap-3">
              <div>
                <CardTitle className={title}>Explore Next</CardTitle>
                <CardDescription className={muted}>Suggestions based on what you&apos;ve checked, refreshed daily</CardDescription>
              </div>
              <Sparkles className={cn("h-5 w-5", theme.icon)} />
            </div>
          </CardHeader>
          <CardContent>
            {(insights.status === "idle" || insights.status === "loading") && (
              <div className="grid gap-4 md:grid-cols-3">
                {[0, 1, 2].map((n) => (
                  <div key={n} className={cn("h-32 animate-pulse rounded-xl", isDark ? "bg-white/5" : "bg-neutral-100")} />
                ))}
              </div>
            )}
            {insights.status === "not_enough" && (
              <p className={muted}>
                Check {insights.needed} more video{insights.needed === 1 ? "" : "s"} to get personalized suggestions.
              </p>
            )}
            {insights.status === "error" && (
              <div className="flex flex-wrap items-center gap-3">
                <p className={muted}>{insights.message}</p>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={onRetryInsights}
                  className={cn("rounded-full text-xs", isDark ? "border-white/20 bg-white/5 text-white/80 hover:bg-white/10" : "")}
                >
                  <RotateCw className="mr-1 h-3 w-3" />
                  Try again
                </Button>
              </div>
            )}
            {insights.status === "ok" && (
              <div className="grid gap-4 md:grid-cols-3">
                {insights.suggestions.map((s) => (
                  <div
                    key={s.topic}
                    className={cn("rounded-xl border p-4", isDark ? "border-white/10 bg-white/5" : "border-neutral-200 bg-neutral-50")}
                  >
                    <p className={cn("font-semibold", isDark ? "text-white" : "text-neutral-900")}>{s.topic}</p>
                    <p className={cn("mt-1 text-sm", isDark ? "text-white/65" : "text-neutral-600")}>{s.why}</p>
                    {s.explore.length > 0 && (
                      <div className="mt-3 flex flex-wrap gap-2">
                        {s.explore.map((e) => (
                          <span
                            key={e}
                            className={cn(
                              "rounded-full border px-2.5 py-1 text-xs",
                              isDark ? "border-white/15 bg-white/5 text-white/75" : "border-neutral-200 bg-white text-neutral-700",
                            )}
                          >
                            {e}
                          </span>
                        ))}
                      </div>
                    )}
                    {s.caution && (
                      <p className="mt-3 flex gap-1.5 text-xs text-yellow-400">
                        <AlertTriangle className="mt-0.5 h-3.5 w-3.5 flex-shrink-0" />
                        {s.caution}
                      </p>
                    )}
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </section>

      <section>
        <div className="mb-4 flex items-center justify-between">
          <div>
            <h2 className={cn("text-xl font-semibold", isDark ? "text-white" : "text-neutral-900")}>Achievements</h2>
            <p className={cn("mt-1 text-sm", muted)}>Small wins that add up to better signal.</p>
          </div>
          <Trophy className="h-5 w-5 text-yellow-400" />
        </div>
        <div className="flex flex-wrap gap-8">
          {stats.badges.map((badge) => {
            const Icon = badge.unlocked ? BADGE_ICONS[badge.id] : LockKeyhole
            return (
              <div key={badge.id} className="flex w-20 flex-col items-center text-center">
                <div
                  className={cn(
                    "rounded-full p-[2px]",
                    badge.unlocked
                      ? cn("bg-gradient-to-br", theme.buttonGradient)
                      : isDark
                        ? "bg-white/15"
                        : "bg-neutral-200",
                  )}
                >
                  <div
                    className={cn(
                      "flex h-20 w-20 items-center justify-center rounded-full",
                      isDark ? "bg-[#17171b]" : "bg-white",
                      badge.unlocked ? theme.icon : isDark ? "text-white/25" : "text-neutral-300",
                    )}
                  >
                    <Icon className="h-8 w-8" />
                  </div>
                </div>
                <p className={cn("mt-3 text-sm font-medium", isDark ? "text-white" : "text-neutral-900")}>{badge.title}</p>
                <p className={cn("mt-1 text-[11px]", muted)}>
                  {badge.unlocked ? badge.text : `${badge.current}/${badge.target} · ${badge.text}`}
                </p>
              </div>
            )
          })}
        </div>
      </section>
    </div>
  )
}

const themes = {
  gold: {
    name: "Chestify Gold",
    buttonText: "text-black",
    gradient: "from-yellow-400 to-white",
    // Wordmark colors as hex for the SVG logo gradient.
    logo: ["#facc15", "#fef9c3"] as [string, string],
    gradientDark: "from-yellow-400 via-yellow-200 to-white",
    buttonGradient: "from-yellow-400 to-yellow-200",
    activeTab: "bg-yellow-500/20 text-yellow-400 border-yellow-500/50",
    activeTabLight: "bg-yellow-400 text-black border-yellow-400",
    filterActive: "from-yellow-400 to-yellow-200",
    icon: "text-yellow-400",
    buttonShadow: undefined,
  },
  blue: {
    name: "Cyber Blue",
    buttonText: "text-white",
    gradient: "from-cyan-400 to-blue-600",
    logo: ["#22d3ee", "#2563eb"] as [string, string],
    gradientDark: "from-cyan-400 via-blue-400 to-blue-600",
    buttonGradient: "from-cyan-400 to-blue-500",
    activeTab: "bg-cyan-500/20 text-cyan-400 border-cyan-500/50",
    activeTabLight: "bg-cyan-400 text-black border-cyan-400",
    filterActive: "from-cyan-400 to-blue-500",
    icon: "text-cyan-400",
    buttonShadow: undefined,
  },
  purple: {
    name: "Neon Purple",
    buttonText: "text-white",
    gradient: "from-fuchsia-500 to-pink-600",
    logo: ["#d946ef", "#db2777"] as [string, string],
    gradientDark: "from-fuchsia-500 via-pink-400 to-pink-600",
    buttonGradient: "from-fuchsia-500 to-pink-500",
    activeTab: "bg-fuchsia-500/20 text-fuchsia-400 border-fuchsia-500/50",
    activeTabLight: "bg-fuchsia-400 text-black border-fuchsia-400",
    filterActive: "from-fuchsia-500 to-pink-500",
    icon: "text-fuchsia-400",
    buttonShadow: undefined,
  },
  green: {
    name: "Hacker Green",
    buttonText: "text-white",
    gradient: "from-emerald-400 to-lime-500",
    logo: ["#34d399", "#84cc16"] as [string, string],
    gradientDark: "from-emerald-400 via-lime-400 to-lime-500",
    buttonGradient: "from-emerald-400 to-lime-400",
    activeTab: "bg-emerald-500/20 text-emerald-400 border-emerald-500/50",
    activeTabLight: "bg-emerald-400 text-black border-emerald-400",
    filterActive: "from-emerald-400 to-lime-400",
    icon: "text-emerald-400",
    buttonShadow: undefined,
  },
  inferno: {
    name: "Inferno",
    buttonText: "text-white",
    gradient: "from-red-600 to-orange-500",
    logo: ["#dc2626", "#f97316"] as [string, string],
    gradientDark: "from-red-600 to-orange-500",
    buttonGradient: "from-red-600 to-orange-500",
    activeTab: "bg-gradient-to-br from-red-600/20 to-orange-500/20 border-red-500/50 text-orange-100",
    activeTabLight: "bg-gradient-to-r from-red-600 to-orange-500 text-white border-red-500",
    filterActive: "from-red-600 to-orange-500",
    icon: "text-red-500",
    buttonShadow: "shadow-[0_0_15px_rgba(220,38,38,0.5)]",
  },
  aurora: {
    name: "Aurora",
    buttonText: "text-white",
    gradient: "from-indigo-500 to-cyan-400",
    logo: ["#6366f1", "#22d3ee"] as [string, string],
    gradientDark: "from-indigo-500 via-purple-500 to-cyan-400",
    buttonGradient: "from-indigo-600 to-cyan-500",
    activeTab: "bg-gradient-to-br from-indigo-600/20 to-cyan-500/20 border-indigo-500/50 text-cyan-50",
    activeTabLight: "bg-gradient-to-r from-indigo-600 to-cyan-500 text-white border-indigo-500",
    filterActive: "from-indigo-600 to-cyan-500",
    icon: "text-indigo-400",
    buttonShadow: "shadow-[0_0_15px_rgba(79,70,229,0.5)]",
  },
  "fire-ice": {
    name: "Fire & Ice",
    buttonText: "text-white",
    gradient: "from-blue-600 to-red-500",
    logo: ["#2563eb", "#ef4444"] as [string, string],
    gradientDark: "from-blue-600 to-red-500",
    buttonGradient: "from-blue-600 to-red-500",
    activeTab: "bg-gradient-to-br from-blue-600/20 to-red-500/20 border-blue-500/50 text-blue-100",
    activeTabLight: "bg-gradient-to-r from-blue-600 to-red-500 text-white border-blue-500",
    filterActive: "from-blue-600 to-red-500",
    icon: "text-blue-500",
    buttonShadow: "shadow-[0_0_15px_rgba(37,99,235,0.5)]",
  },
}

// Coordinates auth state, Firestore subscriptions, video actions, chat state,
// theme persistence, and the landing or authenticated workspace UI.
export default function ChestifyApp() {
  const [view, setView] = useState<"landing" | "app">("landing")
  const [activeTab, setActiveTab] = useState<TabType>("library")
  const [filter, setFilter] = useState<FilterType>("all")
  const [urlInput, setUrlInput] = useState("")
  const [isAdding, setIsAdding] = useState(false)
  const [urlError, setUrlError] = useState<string | null>(null)
  const [insights, setInsights] = useState<InsightsState>({ status: "idle" })
  // Item shown in the processing popup on the Add tab; null when closed.
  const [trackingId, setTrackingId] = useState<string | null>(null)
  const [chatInput, setChatInput] = useState("")
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [chats, setChats] = useState<ChatSummary[]>([])
  const [activeChatId, setActiveChatId] = useState<string | null>(null)
  const [isReplying, setIsReplying] = useState(false)
  const [chatError, setChatError] = useState<string | null>(null)
  // Opt-in per message: web search uses a limited daily allowance.
  const [webSearch, setWebSearch] = useState(false)
  // History panel: open by default on desktop, a slide-over on phones.
  const [historyOpen, setHistoryOpen] = useState(false)
  const [renamingId, setRenamingId] = useState<string | null>(null)
  const [renameValue, setRenameValue] = useState("")
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const navRef = useRef<HTMLElement>(null)
  // Touch screens can't hover, so a tap reveals a card's details. On every
  // device only the "Watch on ..." link inside opens the video.
  const [canHover, setCanHover] = useState(true)
  const [revealedId, setRevealedId] = useState<string | null>(null)
  const [isDark, setIsDark] = useState(true)
  const [activeTheme, setActiveTheme] = useState<keyof typeof themes>("fire-ice")
  const [firestoreItems, setFirestoreItems] = useState<VideoItem[]>([])
  const [user, setUser] = useState<User | null>(null)
  const [authLoading, setAuthLoading] = useState(true)
  const [authError, setAuthError] = useState<string | null>(null)
  const [showEmailAuth, setShowEmailAuth] = useState(false)
  const [settingsOpen, setSettingsOpen] = useState(false)
  // Profile picture stored on users/{uid} (a small data URL), if the user set one.
  const [avatar, setAvatar] = useState<string | null>(null)
  // Bumped after a new email account's name is saved; Firebase mutates the
  // same User object, so this re-renders the header with the new name.
  const [, setProfileVersion] = useState(0)

  const currentTheme = themes[activeTheme]

  // Reads the saved theme key from localStorage and applies it when it matches
  // one of the supported theme definitions.
  useEffect(() => {
    if (typeof window !== "undefined") {
      try {
        const savedTheme = localStorage.getItem("chestify-theme")
        if (savedTheme && savedTheme in themes) {
          setActiveTheme(savedTheme as keyof typeof themes)
        }
      } catch (error) {
        console.error("Error loading theme:", error)
      }
    }
  }, [])

  // Publishes the sticky nav's height as --nav-h so the chat panel and its
  // toggle sit right under it at any screen width (the nav wraps on phones).
  useEffect(() => {
    const nav = navRef.current
    if (!nav) return
    const update = () => document.documentElement.style.setProperty("--nav-h", `${nav.offsetHeight}px`)
    update()
    const observer = new ResizeObserver(update)
    observer.observe(nav)
    return () => observer.disconnect()
  }, [user, view])

  // The history panel starts open on desktop-width screens.
  useEffect(() => {
    setHistoryOpen(window.matchMedia("(min-width: 768px)").matches)
  }, [])

  // Tracks whether the primary pointer can hover (mouse) or not (touch).
  useEffect(() => {
    const media = window.matchMedia("(hover: hover) and (pointer: fine)")
    const update = () => setCanHover(media.matches)
    update()
    media.addEventListener("change", update)
    return () => media.removeEventListener("change", update)
  }, [])

  // Keeps the stored profile picture in sync with users/{uid}.
  useEffect(() => {
    if (!user) {
      setAvatar(null)
      return
    }
    return onSnapshot(doc(db, "users", user.uid), (snap) => setAvatar((snap.data()?.avatar as string) || null))
  }, [user])

  // Lists the user's 30 most recently used chats for the history panel.
  useEffect(() => {
    if (!user) {
      setChats([])
      setActiveChatId(null)
      return
    }
    const chatsQuery = query(collection(db, "users", user.uid, "chats"), orderBy("updated_at", "desc"), limit(30))
    return onSnapshot(chatsQuery, (snapshot) => {
      setChats(snapshot.docs.map((d) => ({ id: d.id, ...d.data() }) as ChatSummary))
    })
  }, [user])

  // Streams the open chat's messages in order; an empty chat shows the prompt.
  useEffect(() => {
    if (!user || !activeChatId) {
      setMessages([])
      return
    }
    const messagesQuery = query(
      collection(db, "users", user.uid, "chats", activeChatId, "messages"),
      orderBy("created_at", "asc"),
    )
    return onSnapshot(messagesQuery, (snapshot) => {
      setMessages(snapshot.docs.map((d) => ({ id: d.id, ...d.data() }) as ChatMessage))
    })
  }, [user, activeChatId])

  // Fetches "explore next" suggestions. The backend caches them per user per
  // day, so reopening the tab doesn't spend AI quota.
  const loadInsights = async () => {
    setInsights({ status: "loading" })
    try {
      const apiUrl = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000"
      const idToken = await auth.currentUser?.getIdToken()
      const response = await fetch(`${apiUrl}/insights`, {
        method: "POST",
        headers: idToken ? { Authorization: `Bearer ${idToken}` } : {},
      })
      const data = await response.json().catch(() => ({}))
      if (!response.ok) throw new Error(data.detail || "Suggestions are temporarily unavailable.")
      setInsights(
        data.status === "not_enough"
          ? { status: "not_enough", needed: data.needed ?? 1 }
          : { status: "ok", suggestions: data.suggestions || [] },
      )
    } catch (error) {
      console.error("Insights error:", error)
      setInsights({
        status: "error",
        message:
          error instanceof Error && !error.message.startsWith("Failed to fetch")
            ? error.message
            : "Suggestions are temporarily unavailable.",
      })
    }
  }

  useEffect(() => {
    if (activeTab === "progress" && user) loadInsights()
    // loadInsights only reads auth and the API URL, so it isn't a dependency.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTab, user])

  // The processing popup belongs to the Add tab; leaving the tab runs it in the background.
  useEffect(() => {
    if (activeTab !== "add") setTrackingId(null)
  }, [activeTab])

  // Keeps the newest chat message in view inside the scrolling message list.
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth", block: "nearest" })
  }, [messages, isReplying])

  // Writes the active theme key to localStorage whenever the user changes it.
  useEffect(() => {
    if (typeof window !== "undefined") {
      try {
        localStorage.setItem("chestify-theme", activeTheme)
      } catch (error) {
        console.error("Error saving theme:", error)
      }
    }
  }, [activeTheme])

  // Subscribes to Firebase Auth state changes, stores the current User, and
  // switches from the landing view after a successful Google sign-in.
  useEffect(() => {
    return onAuthStateChanged(auth, (currentUser) => {
      setUser(currentUser)
      setAuthLoading(false)
      if (currentUser) {
        setView("app")
      }
    })
  }, [])

  // Builds a user-scoped Firestore query, listens for item updates in real
  // time, and derives the three most recent entries for Recent Activity.
  useEffect(() => {
    if (!user) {
      setFirestoreItems([])
      return
    }

    const itemsRef = collection(db, "users", user.uid, "items")
    const q = query(itemsRef, orderBy("created_at", "desc"))

    const unsubscribe = onSnapshot(q, (snapshot) => {
      const items: VideoItem[] = []
      snapshot.forEach((doc) => {
        items.push({ id: doc.id, ...doc.data() } as VideoItem)
      })
      setFirestoreItems(items)
    })

    return () => unsubscribe()
  }, [user])

  // Opens Firebase's Google popup provider and stores a readable error for the
  // landing page if the authentication request is rejected.
  const handleSignIn = async () => {
    setAuthError(null)
    try {
      await signInWithPopup(auth, googleProvider)
    } catch (error) {
      console.error("Google sign-in failed:", error)
      setAuthError("Google sign-in failed. Please try again.")
    }
  }

  // Calls Firebase signOut, resets the view to the landing state, and reports
  // failures through the shared authentication error message.
  const handleSignOut = async () => {
    try {
      await signOut(auth)
      setView("landing")
      setActiveTab("library")
    } catch (error) {
      console.error("Sign-out failed:", error)
      setAuthError("Sign-out failed. Please try again.")
    }
  }

  const userData = user
    ? {
        displayName: user.displayName || user.email?.split("@")[0] || "Chestify user",
        email: user.email || "",
        photoURL: avatar || user.photoURL || "",
        initials: (user.displayName || user.email || "C")
          .split(/\s+/)
          .map((part) => part[0])
          .join("")
          .slice(0, 2)
          .toUpperCase(),
      }
    : null

  // Validates the URL input, delegates the authenticated Firestore write to
  // addVideoToFirestore, and opens the processing popup for the new item.
  const handleAddVideo = async () => {
    const link = urlInput.trim()
    if (!link) return
    // Catch typos and pasted text before they become a failed card.
    try {
      const parsed = new URL(link)
      if (!/^https?:$/.test(parsed.protocol)) throw new Error("not http")
    } catch {
      setUrlError("That doesn't look like a video link. Paste the full URL, starting with https://")
      return
    }
    setIsAdding(true)

    try {
      const itemId = await addVideoToFirestore(link)
      setUrlInput("")
      setTrackingId(itemId)
    } catch (error) {
      console.error("Error adding video:", error)
      alert("Failed to add video. Please try again.")
    } finally {
      setIsAdding(false)
    }
  }

  // Fills the link box from the clipboard (the browser may ask for permission).
  const handlePasteLink = async () => {
    try {
      const text = await navigator.clipboard.readText()
      if (text) {
        setUrlInput(text.trim())
        setUrlError(null)
      }
    } catch (error) {
      console.error("Clipboard read failed:", error)
    }
  }

  // Creates a saved chat and makes it the open one.
  const createChat = async (fields: Partial<Omit<ChatSummary, "id">>) => {
    if (!user) throw new Error("You must be signed in to chat.")
    const now = Timestamp.now()
    const chatRef = await addDoc(collection(db, "users", user.uid, "chats"), {
      title: "New chat",
      video_id: null,
      video_title: null,
      context: null,
      created_at: now,
      updated_at: now,
      ...fields,
    })
    setActiveChatId(chatRef.id)
    return chatRef.id
  }

  const addChatMessage = async (
    chatId: string,
    role: ChatMessage["role"],
    content: string,
    sources?: CitedSource[],
  ) => {
    if (!user) return
    const chatRef = doc(db, "users", user.uid, "chats", chatId)
    await addDoc(collection(chatRef, "messages"), {
      role,
      content,
      ...(sources?.length ? { sources } : {}),
      created_at: Timestamp.now(),
    })
    await updateDoc(chatRef, { updated_at: Timestamp.now() })
  }

  // Saves the question, sends it with the chat's video context and recent
  // turns to the backend /chat endpoint, and saves the reply. Errors are
  // shown under the chat but not saved.
  const handleSendMessage = async () => {
    const userMessage = chatInput.trim()
    if (!userMessage || !user || isReplying) return

    const history = messages.slice(-10).map(({ role, content }) => ({ role, content }))
    const context = chats.find((c) => c.id === activeChatId)?.context ?? null
    setChatInput("")
    setChatError(null)
    setIsReplying(true)

    try {
      const chatId = activeChatId ?? (await createChat({ title: userMessage.slice(0, 60) }))
      await addChatMessage(chatId, "user", userMessage)

      const apiUrl = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000"
      // The backend only answers signed-in users, so send the Firebase ID token.
      const idToken = await auth.currentUser?.getIdToken()
      const response = await fetch(`${apiUrl}/chat`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(idToken ? { Authorization: `Bearer ${idToken}` } : {}),
        },
        body: JSON.stringify({ message: userMessage, context, history, web_search: webSearch }),
      })

      const data = await response.json().catch(() => ({}))
      if (!response.ok) throw new Error(data.detail || "Chat API failed")

      await addChatMessage(chatId, "assistant", data.response, data.sources)
    } catch (error) {
      console.error("Chat error:", error)
      setChatError(
        error instanceof Error && error.message !== "Chat API failed" && !error.message.startsWith("Failed to fetch")
          ? error.message
          : "Sorry, I encountered an error. Please try again.",
      )
    } finally {
      setIsReplying(false)
    }
  }

  // On phones the history panel covers the chat, so close it after a choice.
  const closeHistoryOnPhone = () => {
    if (window.matchMedia("(max-width: 767px)").matches) setHistoryOpen(false)
  }

  // Opens an empty chat; it is saved once the first message is sent.
  const handleNewChat = () => {
    setActiveChatId(null)
    setChatError(null)
    closeHistoryOnPhone()
  }

  const handleSelectChat = (chatId: string) => {
    setActiveChatId(chatId)
    setChatError(null)
    closeHistoryOnPhone()
  }

  const handleTogglePin = async (chat: ChatSummary) => {
    if (!user) return
    try {
      await updateDoc(doc(db, "users", user.uid, "chats", chat.id), { pinned: !chat.pinned })
    } catch (error) {
      console.error("Pin failed:", error)
    }
  }

  const startRename = (chat: ChatSummary) => {
    setRenamingId(chat.id)
    setRenameValue(chat.title)
  }

  const saveRename = async () => {
    const chatId = renamingId
    const title = renameValue.trim()
    setRenamingId(null)
    if (!user || !chatId || !title) return
    try {
      await updateDoc(doc(db, "users", user.uid, "chats", chatId), { title: title.slice(0, 80) })
    } catch (error) {
      console.error("Rename failed:", error)
    }
  }

  // Deletes a chat and all of its messages (Firestore doesn't remove
  // subcollections automatically).
  const handleDeleteChat = async (chat: ChatSummary) => {
    if (!user) return
    if (!window.confirm(`Delete "${chat.title}"? This can't be undone.`)) return
    try {
      const chatRef = doc(db, "users", user.uid, "chats", chat.id)
      const messageDocs = await getDocs(collection(chatRef, "messages"))
      const batch = writeBatch(db)
      messageDocs.forEach((m) => batch.delete(m.ref))
      batch.delete(chatRef)
      await batch.commit()
      if (activeChatId === chat.id) setActiveChatId(null)
    } catch (error) {
      console.error("Delete chat failed:", error)
      alert("Couldn't delete this chat. Please try again.")
    }
  }

  // Sends the item back to 'processing' so the backend checks it again. The
  // backend reuses a cached analysis newer than the card's own, otherwise it
  // runs a fresh fact-check, which spends limited daily AI quota.
  const handleRecheck = async (e: React.MouseEvent, item: VideoItem) => {
    e.preventDefault()
    e.stopPropagation()
    if (!user) return
    if (!window.confirm("Checking again may use one of today's AI fact-checks. Continue?")) return

    try {
      await updateDoc(doc(db, "users", user.uid, "items", item.id), {
        status: "processing",
        error_message: "",
        check_again: true,
      })
    } catch (error) {
      console.error("Recheck failed:", error)
      alert("Couldn't start the recheck. Please try again.")
    }
  }

  // Removes a finished video from the user's chest after confirming. Shared
  // cached analyses and saved chats are kept. Processing items can't be
  // deleted, since the backend still writes the verdict to them.
  const handleDelete = async (e: React.MouseEvent, item: VideoItem) => {
    e.preventDefault()
    e.stopPropagation()
    if (!user || item.status === "processing") return
    if (!window.confirm(`Delete "${item.title}" from your chest? This can't be undone.`)) return

    try {
      await deleteDoc(doc(db, "users", user.uid, "items", item.id))
      setRevealedId((current) => (current === item.id ? null : current))
    } catch (error) {
      console.error("Delete failed:", error)
      alert("Couldn't delete this video. Please try again.")
    }
  }

  // Prevents the card click from opening the video, formats its stored
  // analysis as chat context, and reopens this video's saved chat (or starts
  // one with a greeting) in the chat tab.
  const handleOpenAIAnalysis = async (e: React.MouseEvent, item: VideoItem) => {
    e.preventDefault()
    e.stopPropagation()
    if (!user) return

    const state = getDisplayState(item)
    const sourceLines = [
      ...(item.sources_against || []).map((s) => ({ ...s, kind: "contradicts" })),
      ...(item.sources_for || []).map((s) => ({ ...s, kind: "supports" })),
      ...(item.sources_context || []).map((s) => ({ ...s, kind: "related background" })),
    ]
      .map((s) => `- ${s.domain} (${s.kind}): ${s.point || s.title} (${s.url})`)
      .join("\n")
    const context = [
      `Title: ${item.title}`,
      `URL: ${item.url}`,
      `Summary: ${item.summary}`,
      `Verdict: ${state === "processing" ? state : VERDICT_META[state].label}`,
      `Accuracy score: ${typeof item.accuracy_score === "number" ? `${item.accuracy_score}/10` : "not scored"}`,
      item.score_reason && `Score reason: ${item.score_reason}`,
      item.one_line_summary && `What's actually true: ${item.one_line_summary}`,
      item.main_false_claim && `Most incorrect claim: ${item.main_false_claim}`,
      `Conclusion: ${item.conclusion || item.fact_check?.reason || "N/A"}`,
      item.trust_note && `Which side to trust: ${item.trust_note}`,
      sourceLines && `Sources:\n${sourceLines}`,
    ]
      .filter(Boolean)
      .join("\n")

    setChatError(null)
    closeHistoryOnPhone()
    setActiveTab("chat")

    try {
      const chatsRef = collection(db, "users", user.uid, "chats")
      const existing = await getDocs(query(chatsRef, where("video_id", "==", item.id), limit(1)))
      if (!existing.empty) {
        // Refresh the context in case the video was checked again since.
        const chatDoc = existing.docs[0]
        await updateDoc(chatDoc.ref, { context, video_title: item.title, updated_at: Timestamp.now() })
        setActiveChatId(chatDoc.id)
        return
      }
      const chatId = await createChat({
        title: item.title.slice(0, 60),
        video_id: item.id,
        video_title: item.title,
        context,
      })
      await addChatMessage(
        chatId,
        "assistant",
        `I've loaded the analysis for "${item.title}". What would you like to know about this video?`,
      )
    } catch (error) {
      console.error("Couldn't open video chat:", error)
      setChatError("Couldn't open the chat for this video. Please try again.")
    }
  }


  const activeChat = chats.find((c) => c.id === activeChatId)
  // Pinned chats first; each group keeps the most-recent-first order.
  const sortedChats = [...chats.filter((c) => c.pinned), ...chats.filter((c) => !c.pinned)]

  const progressStats = useMemo(
    () =>
      computeProgress(
        firestoreItems.flatMap((item) => {
          const state = getDisplayState(item)
          return state === "processing"
            ? []
            : [{ created: toDate(item.created_at), category: item.category || "Other", verdict: state }]
        }),
      ),
    [firestoreItems],
  )

  const allItems = firestoreItems
  
  const filteredItems = allItems.filter((item) => filter === "all" || getDisplayState(item) === filter)

  if (authLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-black text-white">
        <Loader2 className="w-8 h-8 animate-spin" aria-label="Loading authentication" />
      </div>
    )
  }

  if (view === "landing" || !user) {
    return (
      <div
        className={cn(
          "min-h-screen relative overflow-hidden",
          isDark ? "bg-gradient-to-br from-zinc-900 to-black" : "bg-white",
        )}
      >
        <div
          className={cn(
            "absolute inset-0 bg-[size:64px_64px]",
            isDark
              ? "bg-[linear-gradient(to_right,#ffffff15_1px,transparent_1px),linear-gradient(to_bottom,#ffffff15_1px,transparent_1px)]"
              : "bg-[linear-gradient(to_right,#e5e7eb_1px,transparent_1px),linear-gradient(to_bottom,#e5e7eb_1px,transparent_1px)]",
          )}
        />
        <div
          className="absolute top-0 left-0 w-[800px] h-[800px] blur-3xl"
          style={{ background: `radial-gradient(circle, ${withAlpha(currentTheme.logo[0], isDark ? 0.3 : 0.2)}, transparent 70%)` }}
        />

        <header className="absolute top-0 right-0 p-6 z-20">
          <ThemeControls
            isDark={isDark}
            activeTheme={activeTheme}
            currentTheme={currentTheme}
            themes={themes}
            onThemeChange={(theme) => setActiveTheme(theme as keyof typeof themes)}
            onToggleDark={() => setIsDark(!isDark)}
          />
        </header>

        <div className="relative z-10 flex flex-col items-center justify-center min-h-screen px-6">
          <div className="max-w-4xl mx-auto text-center space-y-8">
            <div className="flex items-center justify-center gap-3">
              <ChestifyLogo className="h-12 md:h-14" gradient={currentTheme.logo} />
              <span
                className={cn(
                  "text-3xl md:text-4xl font-bold bg-gradient-to-r bg-clip-text text-transparent",
                  currentTheme.gradient,
                )}
              >
                Chestify
              </span>
            </div>
            <h1
              className={cn(
                "text-5xl md:text-7xl font-semibold leading-tight bg-gradient-to-r bg-clip-text text-transparent",
                isDark ? currentTheme.gradientDark : currentTheme.gradient,
              )}
            >
              Turn short-form noise into a treasure chest of knowledge
            </h1>
            <p className={cn("text-xl md:text-2xl font-light", isDark ? "text-white/70" : "text-neutral-600")}>
              Discover, build, and grow with AI-verified education
            </p>
            {authError && (
              <p className="text-sm text-red-400" role="alert">
                {authError}
              </p>
            )}
            <Button
              onClick={handleSignIn}
              className={cn(
                "mt-8 px-12 py-6 text-lg rounded-full bg-gradient-to-r font-medium transition-all",
                `${currentTheme.buttonGradient}`,
                isDark ? "text-white" : "text-black",
                currentTheme.buttonShadow || "",
              )}
            >
              Sign in with Google
            </Button>
            <div className="space-y-4">
              {showEmailAuth ? (
                <EmailAuthForm
                  isDark={isDark}
                  submitClassName={cn(
                    "bg-gradient-to-r font-medium",
                    currentTheme.buttonGradient,
                    isDark ? "text-white" : "text-black",
                  )}
                  onProfileUpdated={() => setProfileVersion((v) => v + 1)}
                />
              ) : (
                <button
                  type="button"
                  onClick={() => setShowEmailAuth(true)}
                  className={cn(
                    "text-sm underline underline-offset-4",
                    isDark ? "text-white/60 hover:text-white" : "text-neutral-600 hover:text-neutral-900",
                  )}
                >
                  Use email instead
                </button>
              )}
            </div>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className={cn("min-h-screen relative", isDark ? "bg-gradient-to-br from-zinc-900 to-black" : "bg-white")}>
      <div
        className={cn(
          "absolute inset-0 bg-[size:64px_64px]",
          isDark
            ? "bg-[linear-gradient(to_right,#ffffff15_1px,transparent_1px),linear-gradient(to_bottom,#ffffff15_1px,transparent_1px)]"
            : "bg-[linear-gradient(to_right,#e5e7eb_1px,transparent_1px),linear-gradient(to_bottom,#e5e7eb_1px,transparent_1px)]",
        )}
      />
      <div
        className="absolute top-0 left-0 w-[600px] h-[600px] blur-3xl"
        style={{ background: `radial-gradient(circle, ${withAlpha(currentTheme.logo[0], isDark ? 0.1 : 0.05)}, transparent 70%)` }}
      />
      <div className="relative z-10 flex flex-col min-h-screen">
        {/* One sticky bar: brand, section tabs, account. On phones the tabs wrap
            onto their own row. Its height is measured into --nav-h (see navRef). */}
        <header
          ref={navRef}
          className={cn(
            "sticky top-0 z-20 border-b backdrop-blur-md",
            isDark ? "border-white/10 bg-black/40" : "border-neutral-200 bg-white/70",
          )}
        >
          <div className="container mx-auto flex flex-wrap items-center gap-x-4 gap-y-3 px-6 py-3">
            {/* Brand doubles as "home": back to the Library, scrolled to the top. */}
            <button
              type="button"
              onClick={() => {
                setActiveTab("library")
                window.scrollTo({ top: 0, behavior: "smooth" })
              }}
              aria-label="Chestify home"
              className="flex items-center gap-2 rounded-lg transition-opacity hover:opacity-80"
            >
              <ChestifyLogo className="h-7" gradient={currentTheme.logo} title="" />
              <h1 className={cn("text-2xl font-bold bg-gradient-to-r bg-clip-text text-transparent", currentTheme.gradient)}>
                Chestify
              </h1>
            </button>
            <nav aria-label="Sections" className="order-last flex w-full justify-center gap-1 overflow-x-auto md:order-none md:w-auto md:flex-1">
              {(
                [
                  { id: "add", label: "Add Video", icon: <Plus className="w-4 h-4" /> },
                  { id: "library", label: "Library", icon: <ChestifyLogo className="h-4" title="" /> },
                  { id: "chat", label: "Chat", icon: <MessageSquare className="w-4 h-4" /> },
                  { id: "progress", label: "Progress", icon: <TrendingUp className="w-4 h-4" /> },
                ] as { id: TabType; label: string; icon: React.ReactNode }[]
              ).map((tab) => (
                <Button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id)}
                  variant={activeTab === tab.id ? "default" : "ghost"}
                  aria-current={activeTab === tab.id ? "page" : undefined}
                  className={cn(
                    "flex-shrink-0 gap-2 rounded-full px-3 sm:px-5",
                    activeTab === tab.id
                      ? isDark
                        ? currentTheme.activeTab
                        : currentTheme.activeTabLight
                      : isDark
                        ? "text-white/60 hover:text-white hover:bg-white/5"
                        : "text-neutral-600 hover:text-neutral-900 hover:bg-neutral-100",
                  )}
                >
                  {tab.icon}
                  {tab.label}
                </Button>
              ))}
            </nav>
            <div className="ml-auto flex items-center gap-3 md:ml-0">
              {userData && (
                <UserProfileDropdown
                  isDark={isDark}
                  onSignOut={handleSignOut}
                  onOpenSettings={() => setSettingsOpen(true)}
                  user={userData}
                  currentTheme={currentTheme}
                />
              )}
              <ThemeControls
                isDark={isDark}
                activeTheme={activeTheme}
                currentTheme={currentTheme}
                themes={themes}
                onThemeChange={(theme) => setActiveTheme(theme as keyof typeof themes)}
                onToggleDark={() => setIsDark(!isDark)}
              />
            </div>
          </div>
        </header>
        {user && (
          <SettingsDialog
            open={settingsOpen}
            onOpenChange={setSettingsOpen}
            user={user}
            avatar={avatar}
            isDark={isDark}
            buttonClassName={cn(currentTheme.buttonGradient, currentTheme.buttonText)}
            onProfileUpdated={() => setProfileVersion((v) => v + 1)}
          />
        )}
        <main
          className={cn(
            "flex-1",
            activeTab === "chat"
              ? cn("w-full backdrop-blur-xl", isDark ? "bg-black/30" : "bg-white/60")
              : "container mx-auto px-6 py-12",
          )}
        >
          {activeTab === "library" && (
            <div className="space-y-8">
              <div>
                <h2
                  className={cn(
                    "text-3xl font-bold mb-2 bg-gradient-to-r bg-clip-text text-transparent",
                    isDark ? currentTheme.gradient : currentTheme.gradient,
                  )}
                >
                  Your Video Chest
                </h2>
                <p className={cn("mb-6", isDark ? "text-white/60" : "text-neutral-600")}>
                  Browse your fact-checked video collection
                </p>

                <div className="flex flex-wrap gap-2 mb-6">
                  {FILTERS.map((filterOption) => (
                    <button
                      key={filterOption}
                      onClick={() => setFilter(filterOption)}
                      className={cn(
                        "px-4 py-2 rounded-full text-sm font-medium transition-all duration-300",
                        filter === filterOption
                          ? `bg-gradient-to-r ${currentTheme.filterActive} text-black`
                          : isDark
                            ? "bg-white/5 text-white/60 hover:bg-white/10 border border-white/10"
                            : "bg-neutral-100 text-neutral-600 hover:bg-neutral-200 border border-neutral-200",
                      )}
                    >
                      {filterOption !== "all" && filterOption !== "processing" && (
                        <span
                          className={cn("inline-block w-2 h-2 rounded-full mr-2", VERDICT_META[filterOption].dot)}
                        />
                      )}
                      {filterLabel(filterOption)}
                    </button>
                  ))}
                </div>
              </div>

              <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
                {filteredItems.map((item) => {
                  const state = getDisplayState(item)
                  const meta = state === "processing" ? null : VERDICT_META[state]
                  // A check that couldn't run shows as grey Unverified with the reason.
                  const failed = item.status === "error"
                  const oneLine = failed
                    ? item.error_message || "We couldn't finish checking this video."
                    : item.one_line_summary || item.fact_check?.reason || ""
                  const sources = cardSources(item)

                  return (
                  <div
                    key={item.id}
                    // Only the "Watch on ..." link opens the video, so selecting text on
                    // a card never opens it. On touch screens a tap reveals the details.
                    onClick={() => {
                      if (!canHover) setRevealedId((current) => (current === item.id ? null : item.id))
                    }}
                    className={cn("block", !canHover && "cursor-pointer")}
                  >
                    <DirectionAwareHover
                      imageUrl={item.thumbnail || ""}
                      fallback={<ThumbnailPlaceholder url={item.url} gradient={currentTheme.logo} />}
                      overlay={<VerdictOverlay state={state} score={item.accuracy_score} />}
                      revealed={!canHover && revealedId === item.id}
                      className={cn(
                        "w-full aspect-[9/16] border transition-all duration-300",
                        meta && (isDark ? meta.cardDark : meta.cardLight),
                        state === "processing" &&
                          (isDark
                            ? "border-purple-400/30 hover:border-purple-400/60 hover:shadow-[0_20px_50px_-12px_rgba(168,85,247,0.4)]"
                            : "border-purple-300 hover:border-purple-400 hover:shadow-[0_20px_50px_-12px_rgba(168,85,247,0.3)]"),
                    )}
                    childrenClassName="inset-0 flex flex-col justify-between p-6"
                  >
                    <div className="flex items-start justify-between">
                      <a
                        href={item.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        onClick={(e) => e.stopPropagation()}
                        className="inline-flex items-center gap-1 rounded-full border border-white/20 bg-black/70 px-2.5 py-1 text-xs font-medium text-white/90 backdrop-blur-sm hover:bg-black/90"
                      >
                        Watch on {platformName(item.url)}
                        <ExternalLink className="w-3 h-3" />
                      </a>
                      <div>
                        {state !== "processing" && (
                          <ScorePill state={state} score={item.accuracy_score} className="px-2.5 py-0.5 text-xs" />
                        )}
                        {state === "processing" && <Loader2 className="w-5 h-5 animate-spin text-purple-400" />}
                      </div>
                    </div>

                    <div className="space-y-3">
                      <div>
                        {item.category && (
                          <Badge variant="outline" className="text-xs border-white/30 text-white/70 mb-2">
                            {item.category}
                          </Badge>
                        )}
                        <h3 className="text-lg font-semibold text-white mb-2 line-clamp-2">{item.title}</h3>
                      </div>

                      <div className="flex flex-wrap gap-2">
                        {item.tags.map((tag: string) => (
                          <Badge key={tag} variant="secondary" className="text-xs bg-white/10 text-white/80 border-white/20">
                            {tag}
                          </Badge>
                        ))}
                      </div>

                      {state === "processing" ? (
                        <div className="space-y-2">
                          <div className="h-3 rounded animate-pulse bg-white/20" />
                          <div className="h-3 rounded animate-pulse w-3/4 bg-white/20" />
                        </div>
                      ) : meta ? (
                        <div className="space-y-3">
                          <div className={cn("p-3 rounded-lg border backdrop-blur-sm", meta.box)}>
                            <p className={cn("text-xs font-semibold mb-1", meta.boxText)}>
                              {meta.label}
                              {failed && " · CHECK FAILED"}
                            </p>
                            <p
                              className={cn(
                                "text-sm text-white/90 mb-2 leading-snug",
                                !failed && !item.one_line_summary && "text-xs line-clamp-3",
                              )}
                            >
                              <HighlightedText text={oneLine} highlight={failed ? undefined : item.highlight} className={meta.highlight} />
                            </p>
                            {failed ? null : sources.list.length ? (
                              <div className="flex flex-wrap gap-x-3 gap-y-1">
                                {sources.related && <span className="text-xs text-white/50">Related:</span>}
                                {sources.list.map((source) => (
                                  <a
                                    key={source.url}
                                    href={source.url}
                                    title={source.point || source.title}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    onClick={(e) => e.stopPropagation()}
                                    className={cn("text-xs underline", meta.link)}
                                  >
                                    {source.domain || source.title}
                                  </a>
                                ))}
                              </div>
                            ) : (
                              <p className="text-xs text-white/60 italic">Couldn't find sources</p>
                            )}
                          </div>

                          <div className="flex gap-2">
                            {!failed && (
                              <Button
                                size="sm"
                                onClick={(e) => handleOpenAIAnalysis(e, item)}
                                className={cn("flex-1 rounded-full text-xs border", meta.button)}
                              >
                                AI Analysis
                              </Button>
                            )}
                            <Button
                              size="sm"
                              title="Check this video again"
                              onClick={(e) => handleRecheck(e, item)}
                              className={cn("rounded-full text-xs border", failed && "flex-1", meta.button)}
                            >
                              <RotateCw className="w-3 h-3 mr-1" />
                              Check again
                            </Button>
                            <Button
                              size="sm"
                              title="Delete this video"
                              aria-label="Delete this video"
                              onClick={(e) => handleDelete(e, item)}
                              className="rounded-full border border-white/20 bg-white/10 px-2.5 text-white/80 hover:border-red-400/60 hover:bg-red-500/30 hover:text-red-200"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </Button>
                          </div>
                        </div>
                      ) : null}
                    </div>
                  </DirectionAwareHover>
                  </div>
                  )
                })}
              </div>
            </div>
          )}
          {activeTab === "add" && (
            <div className="mx-auto max-w-3xl space-y-10 pb-4 pt-0 [@media(min-height:900px)]:space-y-16 [@media(min-height:900px)]:pt-10">
              {/* Hero: the one action on this page, front and center. */}
              <section className="space-y-5 text-center [@media(min-height:900px)]:space-y-6">
                <ChestifyLogo className="mx-auto h-11 [@media(min-height:900px)]:h-14" gradient={currentTheme.logo} title="" />
                <h2
                  className={cn(
                    "bg-gradient-to-r bg-clip-text text-4xl font-semibold leading-tight text-transparent text-balance md:text-5xl",
                    isDark ? currentTheme.gradientDark : currentTheme.gradient,
                  )}
                >
                  Check a video before you believe it
                </h2>
                <p className={cn("mx-auto max-w-xl text-base md:text-lg", isDark ? "text-white/60" : "text-neutral-600")}>
                  Paste a short-form video link. Chestify reads what it says, checks it against trusted sources, and
                  scores how true it is.
                </p>

                <form
                  onSubmit={(e) => {
                    e.preventDefault()
                    handleAddVideo()
                  }}
                  className="mx-auto max-w-2xl"
                >
                  <div
                    className={cn(
                      "flex items-center gap-2 rounded-full border p-2 pl-5 backdrop-blur-xl transition-colors",
                      urlError
                        ? "border-red-500/60"
                        : isDark
                          ? "border-white/15 bg-white/[0.06] focus-within:border-white/30"
                          : "border-neutral-300 bg-white shadow-sm focus-within:border-neutral-400",
                    )}
                  >
                    <input
                      type="url"
                      inputMode="url"
                      placeholder="https://www.tiktok.com/@creator/video/..."
                      value={urlInput}
                      onChange={(e) => {
                        setUrlInput(e.target.value)
                        setUrlError(null)
                      }}
                      aria-label="Video link"
                      className={cn(
                        "h-11 min-w-0 flex-1 bg-transparent text-base outline-none",
                        isDark ? "text-white placeholder:text-white/35" : "text-neutral-900 placeholder:text-neutral-400",
                      )}
                    />
                    <button
                      type="button"
                      onClick={handlePasteLink}
                      title="Paste from clipboard"
                      aria-label="Paste from clipboard"
                      className={cn(
                        "hidden rounded-full p-2.5 transition-colors sm:block",
                        isDark ? "text-white/60 hover:bg-white/10 hover:text-white" : "text-neutral-500 hover:bg-neutral-100",
                      )}
                    >
                      <ClipboardPaste className="h-5 w-5" />
                    </button>
                    <Button
                      type="submit"
                      disabled={isAdding || !urlInput.trim()}
                      className={cn(
                        "h-11 rounded-full bg-gradient-to-r px-5 font-medium sm:px-6",
                        currentTheme.buttonGradient,
                        isDark ? "text-white" : "text-black",
                        currentTheme.buttonShadow || "",
                      )}
                    >
                      {isAdding ? <Loader2 className="h-4 w-4 animate-spin" /> : "Add to Chest"}
                    </Button>
                  </div>
                  {urlError && <p className="mt-2 text-sm text-red-400">{urlError}</p>}
                </form>

                <div className="flex flex-wrap items-center justify-center gap-2 text-xs">
                  <span className={isDark ? "text-white/40" : "text-neutral-500"}>Works with</span>
                  {["TikTok", "YouTube Shorts", "Instagram Reels", "Facebook", "X"].map((platform) => (
                    <span
                      key={platform}
                      className={cn(
                        "rounded-full border px-2.5 py-1",
                        isDark ? "border-white/10 bg-white/5 text-white/70" : "border-neutral-200 bg-neutral-50 text-neutral-700",
                      )}
                    >
                      {platform}
                    </span>
                  ))}
                </div>
              </section>

              {/* How it works: static explanation, styled like the processing stepper. */}
              <section aria-label="How it works">
                <p className={cn("mb-4 text-center text-xs font-semibold uppercase tracking-[0.2em]", isDark ? "text-white/40" : "text-neutral-500")}>
                  How it works
                </p>
                <div className="grid gap-4 md:grid-cols-3">
                  {[
                    { icon: ClipboardPaste, title: "Paste a link", text: "Any public TikTok, YouTube Short, Instagram Reel or X video." },
                    { icon: Search, title: "We fact-check it", text: "Chestify reads the captions and checks the claims with Google Search." },
                    { icon: ShieldCheck, title: "Get the verdict", text: "A 1–10 accuracy score, the key correction, and the sources behind it." },
                  ].map((step, i) => (
                    <div
                      key={step.title}
                      className={cn(
                        "rounded-2xl border p-4 backdrop-blur-md",
                        isDark ? "border-white/10 bg-white/[0.04]" : "border-neutral-200 bg-white",
                      )}
                    >
                      <div className="flex items-center gap-3">
                        <span className={cn("flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-full bg-gradient-to-br text-xs font-semibold", currentTheme.buttonGradient, currentTheme.buttonText)}>
                          {i + 1}
                        </span>
                        <p className={cn("flex-1 font-medium", isDark ? "text-white" : "text-neutral-900")}>{step.title}</p>
                        <step.icon className={cn("h-5 w-5 flex-shrink-0", currentTheme.icon)} />
                      </div>
                      <p className={cn("mt-2 text-sm", isDark ? "text-white/55" : "text-neutral-600")}>{step.text}</p>
                    </div>
                  ))}
                </div>
              </section>

              {/* Recent checks: what came back, not raw URLs. */}
              {firestoreItems.length > 0 && (
                <section aria-label="Recent checks">
                  <div className="mb-4 flex items-center justify-between">
                    <p className={cn("text-xs font-semibold uppercase tracking-[0.2em]", isDark ? "text-white/40" : "text-neutral-500")}>
                      Recent checks
                    </p>
                    <button
                      onClick={() => setActiveTab("library")}
                      className={cn("text-sm underline-offset-4 hover:underline", isDark ? "text-white/60 hover:text-white" : "text-neutral-600")}
                    >
                      View all
                    </button>
                  </div>
                  <div className="grid gap-3 sm:grid-cols-3">
                    {firestoreItems.slice(0, 3).map((item) => {
                      const state = getDisplayState(item)
                      return (
                        <button
                          key={item.id}
                          onClick={() => setActiveTab("library")}
                          className={cn(
                            "flex items-center gap-3 rounded-2xl border p-3 text-left transition-colors",
                            isDark ? "border-white/10 bg-white/[0.04] hover:bg-white/[0.08]" : "border-neutral-200 bg-white hover:bg-neutral-50",
                          )}
                        >
                          <SmallThumb url={item.url} thumbnail={item.thumbnail} gradient={currentTheme.logo} />
                          <div className="min-w-0 flex-1">
                            <p className={cn("line-clamp-2 text-sm font-medium", isDark ? "text-white/90" : "text-neutral-900")}>
                              {item.title && item.title !== "Processing..." ? item.title : platformName(item.url) + " video"}
                            </p>
                            <div className="mt-2 flex items-center gap-2">
                              {state === "processing" ? (
                                <span className="flex items-center gap-1 text-xs text-purple-400">
                                  <Loader2 className="h-3 w-3 animate-spin" />
                                  Checking...
                                </span>
                              ) : (
                                <ScorePill state={state} score={item.accuracy_score} className="px-2 py-0.5 text-[11px]" />
                              )}
                              {item.created_at && (
                                <span className={cn("text-[11px]", isDark ? "text-white/40" : "text-neutral-500")}>
                                  {formatShortDate(item.created_at)}
                                </span>
                              )}
                            </div>
                          </div>
                        </button>
                      )
                    })}
                  </div>
                </section>
              )}

              {trackingId && (
                <ProcessingDialog
                  item={firestoreItems.find((i) => i.id === trackingId)}
                  theme={currentTheme}
                  onClose={() => setTrackingId(null)}
                  onViewLibrary={() => {
                    setTrackingId(null)
                    setActiveTab("library")
                  }}
                />
              )}
            </div>
          )}
          {activeTab === "chat" && (
            <div className="relative flex w-full">
              {/* Phones: the history panel slides over the chat with a dimmed backdrop. */}
              {historyOpen && (
                <div className="fixed inset-0 z-30 bg-black/50 md:hidden" onClick={() => setHistoryOpen(false)} />
              )}
              {historyOpen && (
                <aside
                  className={cn(
                    "fixed inset-y-0 left-0 z-40 flex w-72 flex-shrink-0 flex-col border-r",
                    "md:sticky md:top-[var(--nav-h,61px)] md:z-auto md:h-[calc(100dvh-var(--nav-h,61px))]",
                    isDark ? "border-white/10 bg-[#131316]" : "border-neutral-200 bg-neutral-50",
                  )}
                >
                  <div className="flex items-center justify-between px-3 pb-2 pt-4">
                    <span className={cn("px-2 text-sm font-semibold", isDark ? "text-white/80" : "text-neutral-800")}>Chats</span>
                    <button
                      onClick={() => setHistoryOpen(false)}
                      aria-label="Close chat history"
                      title="Close chat history"
                      className={cn("rounded-full p-2 transition-colors", isDark ? "text-white/60 hover:bg-white/10 hover:text-white" : "text-neutral-500 hover:bg-neutral-200")}
                    >
                      <PanelLeftClose className="h-4 w-4" />
                    </button>
                  </div>
                  <div className="px-3">
                    <button
                      onClick={handleNewChat}
                      className={cn(
                        "flex w-full items-center gap-3 rounded-full px-4 py-2.5 text-sm font-medium transition-colors",
                        isDark ? "text-white/85 hover:bg-white/10" : "text-neutral-800 hover:bg-neutral-200/70",
                      )}
                    >
                      <SquarePen className="h-4 w-4" />
                      New chat
                    </button>
                  </div>
                  <p className={cn("px-7 pb-1 pt-5 text-xs font-semibold uppercase tracking-wide", isDark ? "text-white/40" : "text-neutral-500")}>
                    Recent
                  </p>
                  <div className="flex-1 space-y-0.5 overflow-y-auto px-3 pb-4">
                    {sortedChats.length === 0 && (
                      <p className={cn("px-4 text-sm", isDark ? "text-white/40" : "text-neutral-400")}>No saved chats yet.</p>
                    )}
                    {sortedChats.map((chat) => (
                      <div key={chat.id} className="group relative flex items-center">
                        {renamingId === chat.id ? (
                          <input
                            autoFocus
                            value={renameValue}
                            onChange={(e) => setRenameValue(e.target.value)}
                            onKeyDown={(e) => {
                              if (e.key === "Enter") saveRename()
                              if (e.key === "Escape") setRenamingId(null)
                            }}
                            onBlur={saveRename}
                            aria-label="Chat name"
                            className={cn(
                              "w-full rounded-full border px-4 py-2 text-sm outline-none",
                              isDark ? "border-white/20 bg-white/5 text-white" : "border-neutral-300 bg-white text-neutral-900",
                            )}
                          />
                        ) : (
                          <button
                            onClick={() => handleSelectChat(chat.id)}
                            title={chat.updated_at ? `${chat.title} · ${formatShortDate(chat.updated_at)}` : chat.title}
                            className={cn(
                              "flex w-full min-w-0 items-center gap-2 rounded-full py-2 pl-4 pr-10 text-left text-sm transition-colors",
                              chat.id === activeChatId
                                ? isDark
                                  ? currentTheme.activeTab
                                  : currentTheme.activeTabLight
                                : isDark
                                  ? "text-white/70 hover:bg-white/5"
                                  : "text-neutral-700 hover:bg-neutral-200/70",
                            )}
                          >
                            {chat.video_id ? (
                              <ChestifyLogo className="h-3 flex-shrink-0 opacity-70" title="" />
                            ) : (
                              <MessageSquare className="h-3 w-3 flex-shrink-0 opacity-70" />
                            )}
                            <span className="truncate">{chat.title}</span>
                            {chat.pinned && <Pin className="h-3 w-3 flex-shrink-0 opacity-60" />}
                          </button>
                        )}
                        {renamingId !== chat.id && (
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <button
                                aria-label="Chat options"
                                className={cn(
                                  "absolute right-1.5 rounded-full p-1.5 transition-opacity",
                                  "opacity-0 group-hover:opacity-100 focus-visible:opacity-100 data-[state=open]:opacity-100 [@media(hover:none)]:opacity-100",
                                  isDark ? "text-white/70 hover:bg-white/10" : "text-neutral-600 hover:bg-neutral-200",
                                )}
                              >
                                <MoreVertical className="h-4 w-4" />
                              </button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent
                              side="right"
                              align="start"
                              className={cn(
                                "w-40 rounded-xl border p-1",
                                isDark ? "border-white/10 bg-[#1c1c20] text-white" : "border-neutral-200 bg-white text-neutral-900",
                              )}
                            >
                              <DropdownMenuItem onSelect={() => handleTogglePin(chat)} className="cursor-pointer gap-2 rounded-lg">
                                {chat.pinned ? <PinOff className="h-4 w-4" /> : <Pin className="h-4 w-4" />}
                                {chat.pinned ? "Unpin" : "Pin"}
                              </DropdownMenuItem>
                              <DropdownMenuItem onSelect={() => startRename(chat)} className="cursor-pointer gap-2 rounded-lg">
                                <Pencil className="h-4 w-4" />
                                Rename
                              </DropdownMenuItem>
                              <DropdownMenuItem
                                onSelect={() => handleDeleteChat(chat)}
                                className="cursor-pointer gap-2 rounded-lg text-red-400 focus:text-red-300"
                              >
                                <Trash2 className="h-4 w-4" />
                                Delete
                              </DropdownMenuItem>
                            </DropdownMenuContent>
                          </DropdownMenu>
                        )}
                      </div>
                    ))}
                  </div>
                </aside>
              )}

              <section className="flex min-h-[calc(100dvh-10rem)] min-w-0 flex-1 flex-col px-6">
                {/* Panel toggle while the history is closed, like Gemini's. */}
                {!historyOpen && (
                  <div className="z-10 flex gap-1 pt-4 md:sticky md:top-[var(--nav-h,61px)]">
                    <button
                      onClick={() => setHistoryOpen(true)}
                      aria-label="Open chat history"
                      title="Open chat history"
                      className={cn("rounded-full p-2 transition-colors", isDark ? "text-white/60 hover:bg-white/10 hover:text-white" : "text-neutral-500 hover:bg-neutral-200")}
                    >
                      <PanelLeftOpen className="h-5 w-5" />
                    </button>
                    <button
                      onClick={handleNewChat}
                      aria-label="New chat"
                      title="New chat"
                      className={cn("rounded-full p-2 transition-colors", isDark ? "text-white/60 hover:bg-white/10 hover:text-white" : "text-neutral-500 hover:bg-neutral-200")}
                    >
                      <SquarePen className="h-5 w-5" />
                    </button>
                  </div>
                )}

                <div className="mx-auto w-full max-w-3xl flex-1 space-y-10 py-12">
                  {activeChat?.video_title && (
                    <p
                      className={cn(
                        "mx-auto flex w-fit max-w-full items-center gap-2 rounded-full border px-3 py-1 text-xs",
                        isDark ? "border-white/10 bg-white/5 text-white/60" : "border-neutral-200 bg-white text-neutral-600",
                      )}
                    >
                      <ChestifyLogo className="h-3 flex-shrink-0" title="" />
                      <span className="truncate">About: {activeChat.video_title}</span>
                    </p>
                  )}

                  {messages.length === 0 && !isReplying ? (
                    <div className="flex flex-col items-center gap-4 pt-[12vh] text-center">
                      <ChestifyLogo className="h-14" gradient={currentTheme.logo} title="" />
                      <h2
                        className={cn(
                          "bg-gradient-to-r bg-clip-text text-3xl font-semibold text-transparent",
                          currentTheme.gradient,
                        )}
                      >
                        Ask anything
                      </h2>
                      <p className={cn("max-w-md text-sm", isDark ? "text-white/50" : "text-neutral-500")}>
                        Ask about a topic, or open <span className="font-medium">AI Analysis</span> on a video in your Library to
                        dig into its fact-check.
                      </p>
                    </div>
                  ) : (
                    messages.map((msg) =>
                      msg.role === "user" ? (
                        <div
                          key={msg.id}
                          className={cn(
                            "ml-auto w-fit max-w-[80%] rounded-3xl px-5 py-3 leading-7",
                            isDark ? "bg-white/10 text-white" : "bg-neutral-100 text-neutral-900",
                          )}
                        >
                          <p className="whitespace-pre-wrap">{msg.content}</p>
                        </div>
                      ) : (
                        <div key={msg.id} className={cn("leading-7", isDark ? "text-white/90" : "text-neutral-900")}>
                          <ReactMarkdown
                            components={{
                              h1: ({ children }) => <h1 className="text-xl font-semibold mb-3">{children}</h1>,
                              h2: ({ children }) => <h2 className="text-lg font-semibold mb-3">{children}</h2>,
                              h3: ({ children }) => <h3 className="text-base font-semibold mb-2">{children}</h3>,
                              p: ({ children }) => <p className="mb-4 last:mb-0">{children}</p>,
                              ul: ({ children }) => <ul className="list-disc pl-5 mb-4 space-y-1.5">{children}</ul>,
                              ol: ({ children }) => <ol className="list-decimal pl-5 mb-4 space-y-1.5">{children}</ol>,
                              a: ({ children, href }) => (
                                <a
                                  href={href}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className={cn("underline underline-offset-2 hover:opacity-80", currentTheme.icon)}
                                >
                                  {children}
                                </a>
                              ),
                              code: ({ children }) => (
                                <code className={cn("rounded px-1 py-0.5 text-sm", isDark ? "bg-white/10" : "bg-neutral-200")}>{children}</code>
                              ),
                            }}
                          >
                            {msg.content}
                          </ReactMarkdown>
                          {msg.sources && msg.sources.length > 0 && (
                            <div className="mt-3 flex flex-wrap items-center gap-2 text-xs">
                              <span className={cn("flex items-center gap-1", isDark ? "text-white/40" : "text-neutral-500")}>
                                <Globe className="h-3 w-3" />
                                Sources
                              </span>
                              {msg.sources.map((source) => (
                                <a
                                  key={source.url}
                                  href={source.url}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  title={source.title}
                                  className={cn(
                                    "rounded-full border px-2.5 py-1 transition-colors",
                                    isDark ? "border-white/10 bg-white/5 text-white/70 hover:bg-white/10" : "border-neutral-200 bg-neutral-50 text-neutral-700 hover:bg-neutral-100",
                                  )}
                                >
                                  {source.domain || source.title}
                                </a>
                              ))}
                            </div>
                          )}
                        </div>
                      ),
                    )
                  )}
                  {isReplying && (
                    <p className={cn("flex items-center gap-2 text-sm", isDark ? "text-white/50" : "text-neutral-500")}>
                      <Loader2 className="h-4 w-4 animate-spin" />
                      {webSearch ? "Searching the web..." : "Thinking..."}
                    </p>
                  )}
                  {chatError && <p className="text-sm text-red-400">{chatError}</p>}
                  {/* scroll-mb keeps the newest message above the pinned input. */}
                  <div ref={messagesEndRef} className="scroll-mb-40" />
                </div>

                {/* Pinned to the bottom while the page scrolls. A plain blur (no tint)
                    that fades in at the top hides text passing behind it. */}
                <div className="sticky bottom-0 mx-auto w-full max-w-3xl pb-4 pt-8 backdrop-blur-xl [mask-image:linear-gradient(to_bottom,transparent,black_2rem)]">
                  <div
                    className={cn(
                      "flex items-center gap-2 rounded-full border py-2 pl-5 pr-2",
                      isDark ? "border-white/10 bg-[#18181b]/90" : "border-neutral-200 bg-white shadow-sm",
                    )}
                  >
                    <input
                      placeholder={activeChat?.video_title ? "Ask about this video..." : "Ask Chestify..."}
                      value={chatInput}
                      onChange={(e) => setChatInput(e.target.value)}
                      onKeyDown={(e) => e.key === "Enter" && handleSendMessage()}
                      className={cn(
                        "h-10 min-w-0 flex-1 bg-transparent text-base outline-none",
                        isDark ? "text-white placeholder:text-white/40" : "text-neutral-900 placeholder:text-neutral-400",
                      )}
                    />
                    <button
                      type="button"
                      onClick={() => setWebSearch((on) => !on)}
                      aria-pressed={webSearch}
                      title={webSearch ? "Web search on: answers check Google (limited per day)" : "Turn on web search"}
                      className={cn(
                        "flex h-10 items-center gap-1.5 rounded-full border px-3 text-sm transition-colors",
                        webSearch
                          ? isDark
                            ? currentTheme.activeTab
                            : currentTheme.activeTabLight
                          : isDark
                            ? "border-transparent text-white/50 hover:bg-white/10 hover:text-white"
                            : "border-transparent text-neutral-500 hover:bg-neutral-100",
                      )}
                    >
                      <Globe className="h-4 w-4" />
                      <span className="hidden sm:inline">Web</span>
                    </button>
                    <Button
                      onClick={handleSendMessage}
                      disabled={!chatInput.trim() || isReplying}
                      aria-label="Send"
                      className={cn("h-10 w-10 rounded-full border p-0", isDark ? currentTheme.activeTab : currentTheme.activeTabLight)}
                    >
                      <Send className="h-4 w-4" />
                    </Button>
                  </div>
                  <p className={cn("mt-2 text-center text-xs", isDark ? "text-white/35" : "text-neutral-400")}>
                    {webSearch
                      ? "Web search is on: answers check Google, up to 5 searches a day."
                      : "Chestify AI can make mistakes. Check the sources on each video."}
                  </p>
                </div>
              </section>
            </div>
          )}
          {activeTab === "progress" && (
            <ProgressTab
              stats={progressStats}
              theme={currentTheme}
              isDark={isDark}
              displayName={userData?.displayName || "Chestify user"}
              initials={userData?.initials || "C"}
              insights={insights}
              onRetryInsights={loadInsights}
              onAddVideo={() => setActiveTab("add")}
            />
          )}
        </main>
        <footer
          className={cn("border-t backdrop-blur-sm py-6 mt-auto", isDark ? "border-white/10" : "border-neutral-200")}
        >
          <div className="container mx-auto px-6">
            <p className={cn("text-center text-sm font-light", isDark ? "text-white/40" : "text-neutral-500")}>
              Copyright © Chestify 2026
            </p>
          </div>
        </footer>
      </div>
    </div>
  )
}
