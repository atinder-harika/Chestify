"use client"

/*
 * Owner: Chahatbir Singh
 * Review focus: Main application flow, authentication, Firestore items, themes, and chat.
 */

import { useState, useEffect, useRef } from "react"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Badge } from "@/components/ui/badge"
import { DirectionAwareHover } from "@/components/direction-aware-hover"
import { CheckCircle2, AlertTriangle, Loader2, Send, Plus, Package, Clock, XCircle, HelpCircle, X, RotateCw, ExternalLink } from "lucide-react"
import { cn } from "@/lib/utils"
import { auth, db, googleProvider } from "@/lib/firebase/config"
import { collection, doc, query, onSnapshot, orderBy, Timestamp, updateDoc } from "firebase/firestore"
import { onAuthStateChanged, signInWithPopup, signOut, type User } from "firebase/auth"
import { addVideoToFirestore } from "@/lib/firestore-helpers"
import { ThemeControls } from "@/components/theme-controls"
import { UserProfileDropdown } from "@/components/user-profile-dropdown"
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

type TabType = "library" | "add" | "chat"

type VideoStatus = "processing" | "verified" | "misleading" | "false" | "unverified" | "error"
type Verdict = "true" | "half_truth" | "false" | "unverified"
type DisplayState = Verdict | "processing" | "error"
type FilterType = "all" | Verdict | "processing"

type RecentActivity = {
  url: string
  state: DisplayState
  timestamp: string
}

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
  sources?: CitedSource[]
  fact_check?: {
    status?: string
    reason?: string
    source_link?: string
  }
}

// Resolves what a card should show. New items carry `verdict`; older items
// only have the legacy status + fact_check.status, which map onto the bands.
function getDisplayState(item: VideoItem): DisplayState {
  if (item.status === "processing" || item.status === "error") return item.status
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
  if (state === "processing" || state === "error") return null
  const meta = VERDICT_META[state]
  const iconClass = cn("drop-shadow-[0_4px_12px_rgba(0,0,0,0.8)]", meta.icon)
  return (
    <div className={cn("absolute inset-0 flex items-center justify-center", state === "false" && "bg-red-950/30")}>
      {state === "false" && <X className={cn("w-2/3 h-2/3", iconClass)} strokeWidth={3} />}
      {state === "half_truth" && <AlertTriangle className={cn("w-2/5 h-2/5", iconClass)} strokeWidth={2.5} />}
      {state === "true" && <CheckCircle2 className={cn("w-2/5 h-2/5", iconClass)} strokeWidth={2.5} />}
      {state === "unverified" && <HelpCircle className={cn("w-1/3 h-1/3 opacity-80", iconClass)} strokeWidth={2} />}
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

// Up to three citations for the card: contradicting first, then supporting,
// then (for older items) the raw grounding results.
function cardSources(item: VideoItem): CitedSource[] {
  const seen = new Set<string>()
  return [...(item.sources_against || []), ...(item.sources_for || []), ...(item.sources || [])]
    .filter((s) => s.url && !seen.has(s.url) && seen.add(s.url))
    .slice(0, 3)
}

const themes = {
  gold: {
    name: "Chestify Gold",
    gradient: "from-yellow-400 to-white",
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
    gradient: "from-cyan-400 to-blue-600",
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
    gradient: "from-fuchsia-500 to-pink-600",
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
    gradient: "from-emerald-400 to-lime-500",
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
    gradient: "from-red-600 to-orange-500",
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
    gradient: "from-indigo-500 to-cyan-400",
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
    gradient: "from-blue-600 to-red-500",
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
  const [chatInput, setChatInput] = useState("")
  const [messages, setMessages] = useState<Array<{ role: "user" | "assistant"; content: string }>>([])
  const messagesEndRef = useRef<HTMLDivElement>(null)
  // Touch screens can't hover, so a tap reveals a card's details instead of
  // opening the video; the "Watch on ..." link inside opens it.
  const [canHover, setCanHover] = useState(true)
  const [revealedId, setRevealedId] = useState<string | null>(null)
  const [currentVideoContext, setCurrentVideoContext] = useState<string | null>(null)
  const [isDark, setIsDark] = useState(true)
  const [activeTheme, setActiveTheme] = useState<keyof typeof themes>("fire-ice")
  const [recentActivity, setRecentActivity] = useState<RecentActivity[]>([])
  const [firestoreItems, setFirestoreItems] = useState<VideoItem[]>([])
  const [user, setUser] = useState<User | null>(null)
  const [authLoading, setAuthLoading] = useState(true)
  const [authError, setAuthError] = useState<string | null>(null)

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

  // Tracks whether the primary pointer can hover (mouse) or not (touch).
  useEffect(() => {
    const media = window.matchMedia("(hover: hover) and (pointer: fine)")
    const update = () => setCanHover(media.matches)
    update()
    media.addEventListener("change", update)
    return () => media.removeEventListener("change", update)
  }, [])

  // Keeps the newest chat message in view inside the scrolling message list.
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth", block: "nearest" })
  }, [messages])

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
      
      const recent: RecentActivity[] = items.slice(0, 3).map((item) => ({
        url: item.url,
        state: getDisplayState(item),
        timestamp: item.created_at ? formatShortDate(item.created_at) : 'Just now'
      }))
      setRecentActivity(recent)
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
        displayName: user.displayName || "Chestify user",
        email: user.email || "",
        photoURL: user.photoURL || "",
        initials: (user.displayName || user.email || "C")
          .split(/\s+/)
          .map((part) => part[0])
          .join("")
          .slice(0, 2)
          .toUpperCase(),
      }
    : null

  // Validates the URL input, delegates the authenticated Firestore write to
  // addVideoToFirestore, and returns the user to the library tab.
  const handleAddVideo = async () => {
    if (!urlInput.trim()) return
    setIsAdding(true)

    try {
      await addVideoToFirestore(urlInput)
      setUrlInput("")
      setActiveTab("library")
    } catch (error) {
      console.error("Error adding video:", error)
      alert("Failed to add video. Please try again.")
    } finally {
      setIsAdding(false)
    }
  }

  // Appends the user's question, posts its saved-video context to the backend
  // /chat endpoint, and appends either the AI response or an error message.
  const handleSendMessage = async () => {
    if (!chatInput.trim()) return
    
    const userMessage = chatInput
    setMessages([...messages, { role: "user", content: userMessage }])
    setChatInput("")

    try {
      const apiUrl = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000"
      // The backend only answers signed-in users, so send the Firebase ID token.
      const idToken = await auth.currentUser?.getIdToken()
      const response = await fetch(`${apiUrl}/chat`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(idToken ? { Authorization: `Bearer ${idToken}` } : {}),
        },
        body: JSON.stringify({
          message: userMessage,
          context: currentVideoContext,
        }),
      })

      const data = await response.json().catch(() => ({}))
      if (!response.ok) throw new Error(data.detail || "Chat API failed")

      setMessages((prev) => [
        ...prev,
        {
          role: "assistant",
          content: data.response,
        },
      ])
    } catch (error) {
      console.error("Chat error:", error)
      setMessages((prev) => [
        ...prev,
        {
          role: "assistant",
          content:
            error instanceof Error && error.message !== "Chat API failed" && !error.message.startsWith("Failed to fetch")
              ? error.message
              : "Sorry, I encountered an error. Please try again.",
        },
      ])
    }
  }

  // Sends the item back to 'processing' so the backend listener re-runs the
  // fact-check. Asks first because each run spends limited daily AI quota.
  const handleRecheck = async (e: React.MouseEvent, item: VideoItem) => {
    e.preventDefault()
    e.stopPropagation()
    if (!user) return
    if (!window.confirm("Recheck uses one AI fact-check (limited per day). Continue?")) return

    try {
      await updateDoc(doc(db, "users", user.uid, "items", item.id), {
        status: "processing",
        error_message: "",
        // Skip the shared analysis cache so the recheck is a fresh fact-check.
        force_refresh: true,
      })
    } catch (error) {
      console.error("Recheck failed:", error)
      alert("Couldn't start the recheck. Please try again.")
    }
  }

  // Prevents the card click from opening the video, formats its stored
  // analysis as chat context, and opens the chat tab with an initial prompt.
  const handleOpenAIAnalysis = (e: React.MouseEvent, item: VideoItem) => {
    e.preventDefault()
    e.stopPropagation()
    
    const state = getDisplayState(item)
    const sourceLines = [...(item.sources_against || []), ...(item.sources_for || [])]
      .map((s) => `- ${s.domain}: ${s.point || s.title} (${s.url})`)
      .join("\n")
    const context = [
      `Title: ${item.title}`,
      `URL: ${item.url}`,
      `Summary: ${item.summary}`,
      `Verdict: ${state === "processing" || state === "error" ? state : VERDICT_META[state].label}`,
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
    setCurrentVideoContext(context)
    
    setMessages([{
      role: "assistant",
      content: `I've loaded the analysis for "${item.title}". What would you like to know about this video?`
    }])
    
    setActiveTab("chat")
  }

  // Copies a predefined starter question into the controlled chat input.
  const handleStarterQuestion = (question: string) => {
    setChatInput(question)
  }

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
          className={cn(
            "absolute top-0 left-0 w-[800px] h-[800px] bg-gradient-radial blur-3xl",
            isDark ? "from-yellow-500/30" : "from-yellow-400/20",
            "to-transparent",
          )}
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
        className={cn(
          "absolute top-0 left-0 w-[600px] h-[600px] bg-gradient-radial blur-3xl",
          isDark ? "from-yellow-500/10" : "from-yellow-400/5",
          "to-transparent",
        )}
      />
      <div className="relative z-10 flex flex-col min-h-screen">
        <header className={cn("border-b backdrop-blur-sm", isDark ? "border-white/10" : "border-neutral-200")}>
          <div className="container mx-auto px-6 py-6">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Package className={`w-7 h-7 ${currentTheme.icon}`} />
                <h1
                  className={cn(
                    "text-3xl font-bold bg-gradient-to-r bg-clip-text text-transparent",
                    isDark ? currentTheme.gradient : currentTheme.gradient,
                  )}
                >
                  Chestify
                </h1>
              </div>
              <div className="flex items-center gap-4">
                {userData && (
                  <UserProfileDropdown
                    isDark={isDark}
                    onSignOut={handleSignOut}
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
          </div>
        </header>
        <nav
          className={cn(
            "border-b backdrop-blur-sm sticky top-0 z-20",
            isDark ? "border-white/10" : "border-neutral-200",
          )}
        >
          <div className="container mx-auto px-6 py-4">
            <div className="flex justify-center gap-2">
              <Button
                onClick={() => setActiveTab("add")}
                variant={activeTab === "add" ? "default" : "ghost"}
                className={cn(
                  "rounded-full px-6",
                  activeTab === "add"
                    ? isDark
                      ? currentTheme.activeTab
                      : currentTheme.activeTabLight
                    : isDark
                      ? "text-white/60 hover:text-white hover:bg-white/5"
                      : "text-neutral-600 hover:text-neutral-900 hover:bg-neutral-100",
                )}
              >
                <Plus className="w-4 h-4 mr-2" />
                Add Video
              </Button>
              <Button
                onClick={() => setActiveTab("library")}
                variant={activeTab === "library" ? "default" : "ghost"}
                className={cn(
                  "rounded-full px-6",
                  activeTab === "library"
                    ? isDark
                      ? currentTheme.activeTab
                      : currentTheme.activeTabLight
                    : isDark
                      ? "text-white/60 hover:text-white hover:bg-white/5"
                      : "text-neutral-600 hover:text-neutral-900 hover:bg-neutral-100",
                )}
              >
                Library
              </Button>
              <Button
                onClick={() => setActiveTab("chat")}
                variant={activeTab === "chat" ? "default" : "ghost"}
                className={cn(
                  "rounded-full px-6",
                  activeTab === "chat"
                    ? isDark
                      ? currentTheme.activeTab
                      : currentTheme.activeTabLight
                    : isDark
                      ? "text-white/60 hover:text-white hover:bg-white/5"
                      : "text-neutral-600 hover:text-neutral-900 hover:bg-neutral-100",
                )}
              >
                Chat
              </Button>
            </div>
          </div>
        </nav>
        <main className="flex-1 container mx-auto px-6 py-12">
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
                  const meta = state === "processing" || state === "error" ? null : VERDICT_META[state]
                  const oneLine = item.one_line_summary || item.fact_check?.reason || ""
                  const sources = cardSources(item)

                  return (
                  <div
                    key={item.id}
                    onClick={() =>
                      canHover
                        ? window.open(item.url, "_blank")
                        : setRevealedId((current) => (current === item.id ? null : item.id))
                    }
                    className="block cursor-pointer"
                  >
                    <DirectionAwareHover
                      imageUrl={item.thumbnail || "/placeholder.svg"}
                      overlay={<VerdictOverlay state={state} score={item.accuracy_score} />}
                      revealed={!canHover && revealedId === item.id}
                      className={cn(
                        "w-full aspect-[9/16] border transition-all duration-300",
                        meta && (isDark ? meta.cardDark : meta.cardLight),
                        state === "processing" &&
                          (isDark
                            ? "border-purple-400/30 hover:border-purple-400/60 hover:shadow-[0_20px_50px_-12px_rgba(168,85,247,0.4)]"
                            : "border-purple-300 hover:border-purple-400 hover:shadow-[0_20px_50px_-12px_rgba(168,85,247,0.3)]"),
                        state === "error" && (isDark ? "border-zinc-500/30" : "border-zinc-300"),
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
                        Watch on {item.url.includes("youtu") ? "YouTube" : item.url.includes("instagram") ? "Instagram" : item.url.includes("x.com") || item.url.includes("twitter") ? "X" : item.url.includes("facebook") ? "Facebook" : "TikTok"}
                        <ExternalLink className="w-3 h-3" />
                      </a>
                      <div>
                        {state !== "processing" && state !== "error" && (
                          <ScorePill state={state} score={item.accuracy_score} className="px-2.5 py-0.5 text-xs" />
                        )}
                        {state === "processing" && <Loader2 className="w-5 h-5 animate-spin text-purple-400" />}
                        {state === "error" && <XCircle className="w-5 h-5 text-zinc-400" />}
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
                      ) : state === "error" || !meta ? (
                        <div className="space-y-2">
                          <p className="text-sm font-semibold text-zinc-300">Analysis unavailable</p>
                          <p className="text-xs text-white/80">
                            {item.error_message || "Please try again later."}
                          </p>
                          <Button
                            size="sm"
                            onClick={(e) => handleRecheck(e, item)}
                            className="w-full rounded-full text-xs border bg-zinc-500/30 text-zinc-200 hover:bg-zinc-500/40 border-zinc-400/40"
                          >
                            <RotateCw className="w-3 h-3 mr-1" />
                            Retry
                          </Button>
                        </div>
                      ) : (
                        <div className="space-y-3">
                          <div className={cn("p-3 rounded-lg border backdrop-blur-sm", meta.box)}>
                            <p className={cn("text-xs font-semibold mb-1", meta.boxText)}>
                              {meta.label}
                            </p>
                            <p className={cn("text-sm text-white/90 mb-2 leading-snug", !item.one_line_summary && "text-xs line-clamp-3")}>
                              <HighlightedText text={oneLine} highlight={item.highlight} className={meta.highlight} />
                            </p>
                            {sources.length ? (
                              <div className="flex flex-wrap gap-x-3 gap-y-1">
                                {sources.map((source) => (
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
                            <Button
                              size="sm"
                              onClick={(e) => handleOpenAIAnalysis(e, item)}
                              className={cn("flex-1 rounded-full text-xs border", meta.button)}
                            >
                              AI Analysis
                            </Button>
                            <Button
                              size="sm"
                              title="Re-run the fact-check"
                              onClick={(e) => handleRecheck(e, item)}
                              className={cn("rounded-full text-xs border", meta.button)}
                            >
                              <RotateCw className="w-3 h-3 mr-1" />
                              Recheck
                            </Button>
                          </div>
                        </div>
                      )}
                    </div>
                  </DirectionAwareHover>
                  </div>
                  )
                })}
              </div>
            </div>
          )}
          {activeTab === "add" && (
            <div className="max-w-2xl mx-auto space-y-6">
              <Card
                className={cn(
                  "backdrop-blur border",
                  isDark ? "bg-black/40 border-white/10" : "bg-white border-neutral-200 shadow-sm",
                )}
              >
                <CardHeader>
                  <CardTitle
                    className={cn(
                      "text-2xl font-semibold bg-gradient-to-r bg-clip-text text-transparent",
                      isDark ? currentTheme.gradient : currentTheme.gradient,
                    )}
                  >
                    Add Video to Your Chest
                  </CardTitle>
                  <CardDescription className={cn(isDark ? "text-white/60" : "text-neutral-600")}>
                    Paste a video URL to extract and verify its content
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <Input
                    placeholder="Paste video URL here..."
                    value={urlInput}
                    onChange={(e) => setUrlInput(e.target.value)}
                    className={cn(
                      isDark
                        ? "bg-white/5 border-white/20 text-white placeholder:text-white/40"
                        : "bg-white border-neutral-300 text-neutral-900 placeholder:text-neutral-400",
                    )}
                  />
                  <Button
                    onClick={handleAddVideo}
                    disabled={isAdding || !urlInput.trim()}
                    className={cn(
                      "w-full rounded-full bg-gradient-to-r font-medium transition-all",
                      `${currentTheme.buttonGradient}`,
                      isDark ? "text-white" : "text-black",
                      currentTheme.buttonShadow || "",
                    )}
                  >
                    {isAdding ? (
                      <>
                        <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                        Adding to Chest...
                      </>
                    ) : (
                      "Add to Chest"
                    )}
                  </Button>
                </CardContent>
              </Card>
              <Card
                className={cn(
                  "backdrop-blur border",
                  isDark ? "bg-black/40 border-white/10" : "bg-white border-neutral-200 shadow-sm",
                )}
              >
                <CardHeader>
                  <CardTitle className={cn("text-xl font-semibold", isDark ? "text-white" : "text-neutral-900")}>
                    Recent Activity
                  </CardTitle>
                  <CardDescription className={cn(isDark ? "text-white/60" : "text-neutral-600")}>
                    Your last 3 submitted URLs
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-3">
                  {recentActivity.map((activity, idx) => (
                    <div
                      key={idx}
                      className={cn(
                        "flex items-center justify-between p-3 rounded-lg border",
                        isDark ? "bg-white/5 border-white/10" : "bg-neutral-50 border-neutral-200",
                      )}
                    >
                      <div className="flex items-center gap-3 flex-1 min-w-0">
                        {activity.state === "true" && (
                          <CheckCircle2 className={cn("w-4 h-4 flex-shrink-0", isDark ? "text-emerald-400" : "text-emerald-600")} />
                        )}
                        {activity.state === "half_truth" && (
                          <AlertTriangle className={cn("w-4 h-4 flex-shrink-0", isDark ? "text-yellow-400" : "text-yellow-600")} />
                        )}
                        {activity.state === "false" && (
                          <XCircle className={cn("w-4 h-4 flex-shrink-0", isDark ? "text-red-500" : "text-red-600")} />
                        )}
                        {activity.state === "unverified" && (
                          <HelpCircle className="w-4 h-4 flex-shrink-0 text-zinc-400" />
                        )}
                        {activity.state === "processing" && (
                          <Loader2
                            className={cn(
                              "w-4 h-4 flex-shrink-0 animate-spin",
                              isDark ? "text-purple-400" : "text-purple-600",
                            )}
                          />
                        )}
                        {activity.state === "error" && (
                          <AlertTriangle className="w-4 h-4 flex-shrink-0 text-zinc-500" />
                        )}
                        <span className={cn("text-sm truncate", isDark ? "text-white/80" : "text-neutral-700")}>
                          {activity.url}
                        </span>
                      </div>
                      <div className="flex items-center gap-2 ml-2">
                        <Clock className={cn("w-3 h-3", isDark ? "text-white/40" : "text-neutral-400")} />
                        <span
                          className={cn("text-xs whitespace-nowrap", isDark ? "text-white/40" : "text-neutral-500")}
                        >
                          {activity.timestamp}
                        </span>
                      </div>
                    </div>
                  ))}
                </CardContent>
              </Card>
            </div>
          )}
          {activeTab === "chat" && (
            <div className="max-w-4xl mx-auto">
              <h2
                className={cn(
                  "text-4xl font-semibold bg-gradient-to-r bg-clip-text text-transparent mb-6",
                  isDark ? currentTheme.gradient : currentTheme.gradient,
                )}
              >
                Chat
              </h2>
              {/* Fixed-height panel: min-h-0 on each flex level lets the message
                  list scroll inside it instead of pushing past the footer. */}
              <div className="h-[70dvh] min-h-[420px] max-h-[760px] flex flex-col">
                <Card
                  className={cn(
                    "flex-1 min-h-0 backdrop-blur border flex flex-col",
                    isDark ? "bg-black/40 border-white/10" : "bg-white border-neutral-200 shadow-sm",
                  )}
                >
                  <CardHeader className={cn("border-b", isDark ? "border-white/10" : "border-neutral-200")}>
                    <CardTitle className={cn("text-xl font-light", isDark ? "text-white" : "text-neutral-900")}>
                      Q&A Compass
                    </CardTitle>
                    <CardDescription className={cn(isDark ? "text-white/60" : "text-neutral-600")}>
                      Ask questions about your saved videos
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="flex-1 min-h-0 flex flex-col p-6">
                    <div className="flex-1 min-h-0 overflow-y-auto space-y-4 mb-4 pr-1">
                      {messages.length === 0 ? (
                        <div className="h-full flex items-center justify-center">
                          <p className={cn("text-center", isDark ? "text-white/40" : "text-neutral-400")}>
                            Ask me anything about your saved videos...
                          </p>
                        </div>
                      ) : (
                        messages.map((msg, idx) => (
                          <div
                            key={idx}
                            className={cn(
                              "p-4 rounded-lg max-w-[80%]",
                              msg.role === "user"
                                ? isDark
                                  ? `ml-auto border text-white ${currentTheme.activeTab}`
                                  : `ml-auto border text-neutral-900 ${currentTheme.activeTabLight}`
                                : isDark
                                  ? "mr-auto bg-white/5 border border-white/10 text-white/90"
                                  : "mr-auto bg-neutral-100 border border-neutral-200 text-neutral-900",
                            )}
                          >
                            <ReactMarkdown
                              components={{
                                h1: ({ children }) => <h1 className="text-xl font-semibold mb-2">{children}</h1>,
                                h2: ({ children }) => <h2 className="text-lg font-semibold mb-2">{children}</h2>,
                                h3: ({ children }) => <h3 className="text-base font-semibold mb-1">{children}</h3>,
                                p: ({ children }) => <p className="mb-2 last:mb-0">{children}</p>,
                                ul: ({ children }) => <ul className="list-disc pl-5 mb-2 space-y-1">{children}</ul>,
                                ol: ({ children }) => <ol className="list-decimal pl-5 mb-2 space-y-1">{children}</ol>,
                                a: ({ children, href }) => (
                                  <a
                                    href={href}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className={cn(
                                      "underline",
                                      isDark ? "text-cyan-300 hover:text-cyan-200" : "text-blue-600 hover:text-blue-500",
                                    )}
                                  >
                                    {children}
                                  </a>
                                ),
                                code: ({ children }) => (
                                  <code
                                    className={cn(
                                      "rounded px-1 py-0.5 text-sm",
                                      isDark ? "bg-white/10" : "bg-neutral-200",
                                    )}
                                  >
                                    {children}
                                  </code>
                                ),
                              }}
                            >
                              {msg.content}
                            </ReactMarkdown>
                          </div>
                        ))
                      )}
                      <div ref={messagesEndRef} />
                    </div>
                    <div className="flex gap-2 mb-4 flex-wrap">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => handleStarterQuestion("Summarize my Coding videos")}
                        className={cn(
                          "rounded-full text-xs",
                          isDark
                            ? "bg-white/5 border-white/20 text-white/70 hover:bg-white/10 hover:text-white"
                            : "bg-neutral-50 border-neutral-300 text-neutral-600 hover:bg-neutral-100",
                        )}
                      >
                        Summarize my Coding videos
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => handleStarterQuestion("Quiz me on Physics")}
                        className={cn(
                          "rounded-full text-xs",
                          isDark
                            ? "bg-white/5 border-white/20 text-white/70 hover:bg-white/10 hover:text-white"
                            : "bg-neutral-50 border-neutral-300 text-neutral-600 hover:bg-neutral-100",
                        )}
                      >
                        Quiz me on Physics
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => handleStarterQuestion("What claims were debunked?")}
                        className={cn(
                          "rounded-full text-xs",
                          isDark
                            ? "bg-white/5 border-white/20 text-white/70 hover:bg-white/10 hover:text-white"
                            : "bg-neutral-50 border-neutral-300 text-neutral-600 hover:bg-neutral-100",
                        )}
                      >
                        What claims were debunked?
                      </Button>
                    </div>
                    <div className="flex gap-2">
                      <Input
                        placeholder="Type your question..."
                        value={chatInput}
                        onChange={(e) => setChatInput(e.target.value)}
                        onKeyDown={(e) => e.key === "Enter" && handleSendMessage()}
                        className={cn(
                          isDark
                            ? "bg-white/5 border-white/20 text-white placeholder:text-white/40"
                            : "bg-white border-neutral-300 text-neutral-900 placeholder:text-neutral-400",
                        )}
                      />
                      <Button
                        onClick={handleSendMessage}
                        disabled={!chatInput.trim()}
                        className={cn(
                          "rounded-full border",
                          isDark
                            ? currentTheme.activeTab
                            : currentTheme.activeTabLight,
                        )}
                      >
                        <Send className="w-4 h-4" />
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              </div>
            </div>
          )}
        </main>
        <footer
          className={cn("border-t backdrop-blur-sm py-6 mt-auto", isDark ? "border-white/10" : "border-neutral-200")}
        >
          <div className="container mx-auto px-6">
            <p className={cn("text-center text-sm font-light", isDark ? "text-white/40" : "text-neutral-500")}>
              Copyright © 2026 Chestify | Capstone project - Group 12
            </p>
          </div>
        </footer>
      </div>
    </div>
  )
}
