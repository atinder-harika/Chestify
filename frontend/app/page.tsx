"use client"

import { useState, useEffect } from "react"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Badge } from "@/components/ui/badge"
import { CheckCircle2, AlertTriangle, Loader2, Send, Plus, Package, Moon, Sun, Clock } from "lucide-react"
import { cn } from "@/lib/utils"
import { auth, googleProvider, db } from "@/lib/firebase/config"
import { signInWithPopup, onAuthStateChanged, User } from "firebase/auth"
import { collection, query, onSnapshot, orderBy } from "firebase/firestore"
import { addVideoToFirestore } from "@/lib/firestore-helpers"

const mockContentItems = [
  {
    id: "101",
    url: "https://youtube.com/shorts/example1",
    title: "3 Ways to Center a Div",
    summary: "Explains Flexbox, Grid, and margin:auto methods clearly.",
    transcript: "First, set display flex...",
    category: "Web Development",
    tags: ["CSS", "Frontend", "Coding"],
    fact_check: {
      status: "Verified",
      reason: "Consistent with W3C standards.",
      source_link:
        "https://developer.mozilla.org/en-US/docs/Web/CSS/CSS_Flexible_Box_Layout/Aligning_Items_in_a_Flex_Container",
    },
    status: "verified" as const,
    created_at: "2023-10-27T10:00:00Z",
    thumbnail: "/coding-tutorial.png",
  },
  {
    id: "102",
    url: "https://youtube.com/shorts/example2",
    title: "Alkaline Water Cures Everything?",
    summary: "Claims that changing body pH prevents all disease.",
    transcript: "Cancer cannot survive in an alkaline environment...",
    category: "Health",
    tags: ["Diet", "Wellness", "Debunked"],
    fact_check: {
      status: "False",
      reason: "The human body maintains a strictly regulated pH. Diet cannot significantly change blood pH.",
      source_link: "https://www.cancer.org/cancer/survivorship/coping/nutrition/benefits.html",
    },
    status: "misleading" as const,
    created_at: "2023-10-27T11:30:00Z",
    thumbnail: "/lemon-health.jpg",
  },
  {
    id: "103",
    url: "https://youtube.com/shorts/example3",
    title: "Quantum Physics Explained",
    summary: "Processing transcript...",
    transcript: "",
    category: "Physics",
    tags: [],
    fact_check: {
      status: "Unverified",
      reason: "Pending analysis...",
      source_link: "",
    },
    status: "processing" as const,
    created_at: "2023-10-27T12:00:00Z",
    thumbnail: "/quantum-physics-abstract.png",
  },
]

type TabType = "library" | "add" | "chat"
type FilterType = "all" | "verified" | "misleading" | "processing"

type RecentActivity = {
  url: string
  status: "processing" | "verified" | "failed"
  timestamp: string
}

export default function ChestifyApp() {
  const [user, setUser] = useState<User | null>(null)
  const [authLoading, setAuthLoading] = useState(true)
  const [view, setView] = useState<"landing" | "app">("landing")
  const [activeTab, setActiveTab] = useState<TabType>("library")
  const [filter, setFilter] = useState<FilterType>("all")
  const [urlInput, setUrlInput] = useState("")
  const [isAdding, setIsAdding] = useState(false)
  const [chatInput, setChatInput] = useState("")
  const [messages, setMessages] = useState<Array<{ role: "user" | "assistant"; content: string }>>([])
  const [isDark, setIsDark] = useState(true)
  const [recentActivity, setRecentActivity] = useState<RecentActivity[]>([
    { url: "https://youtube.com/shorts/physics-intro", status: "verified", timestamp: "2 hours ago" },
    { url: "https://youtube.com/shorts/marketing-tips", status: "processing", timestamp: "5 hours ago" },
    { url: "https://tiktok.com/@user/video123", status: "failed", timestamp: "1 day ago" },
  ])
  const [firestoreItems, setFirestoreItems] = useState<any[]>([])

  // Firebase auth listener
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (currentUser) => {
      setUser(currentUser)
      if (currentUser) {
        setView("app")
      }
      setAuthLoading(false)
    })
    return () => unsubscribe()
  }, [])

  // Firestore real-time listener for user's items
  useEffect(() => {
    if (!user) {
      setFirestoreItems([])
      return
    }

    const itemsRef = collection(db, `users/${user.uid}/items`)
    const q = query(itemsRef, orderBy("created_at", "desc"))

    const unsubscribe = onSnapshot(q, (snapshot) => {
      const items: any[] = []
      snapshot.forEach((doc) => {
        items.push({ id: doc.id, ...doc.data() })
      })
      setFirestoreItems(items)
    })

    return () => unsubscribe()
  }, [user])

  const handleSignIn = async () => {
    try {
      await signInWithPopup(auth, googleProvider)
    } catch (error) {
      console.error("Sign in error:", error)
    }
  }

  const handleAddVideo = async () => {
    if (!urlInput.trim() || !user) return
    setIsAdding(true)

    try {
      await addVideoToFirestore(urlInput)
      
      const newActivity: RecentActivity = {
        url: urlInput,
        status: "processing",
        timestamp: "Just now",
      }
      setRecentActivity([newActivity, ...recentActivity.slice(0, 2)])

      setUrlInput("")
      setActiveTab("library")
    } catch (error) {
      console.error("Error adding video:", error)
      alert("Failed to add video. Please try again.")
    } finally {
      setIsAdding(false)
    }
  }

  const handleSendMessage = () => {
    if (!chatInput.trim()) return
    setMessages([...messages, { role: "user", content: chatInput }])
    setChatInput("")

    // Simulate AI response
    setTimeout(() => {
      setMessages((prev) => [
        ...prev,
        {
          role: "assistant",
          content: "I can help you understand the content in your library. What would you like to know?",
        },
      ])
    }, 1000)
  }

  const handleStarterQuestion = (question: string) => {
    setChatInput(question)
  }

  // Merge Firestore items with mock items for display
  const allItems = [...firestoreItems, ...mockContentItems]
  
  const filteredItems = allItems.filter((item) => {
    if (filter === "all") return true
    if (filter === item.status.toLowerCase()) return true
    if (filter === "verified" && item.fact_check?.status === "Verified") return true
    if (filter === "misleading" && (item.fact_check?.status === "False" || item.fact_check?.status === "Questionable")) return true
    if (filter === "processing" && item.status === "processing") return true
    return false
  })

  // Show loading spinner while checking auth
  if (authLoading) {
    return (
      <div
        className={cn(
          "min-h-screen flex items-center justify-center",
          isDark ? "bg-gradient-to-br from-zinc-900 to-black" : "bg-white",
        )}
      >
        <Loader2 className={cn("h-8 w-8 animate-spin", isDark ? "text-yellow-400" : "text-yellow-500")} />
      </div>
    )
  }

  if (view === "landing") {
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
        <div className="relative z-10 flex flex-col items-center justify-center min-h-screen px-6">
          <div className="max-w-4xl mx-auto text-center space-y-8">
            <h1
              className={cn(
                "text-5xl md:text-7xl font-semibold leading-tight bg-gradient-to-r bg-clip-text text-transparent",
                isDark ? "from-yellow-400 via-yellow-200 to-white" : "from-yellow-500 via-yellow-400 to-yellow-600",
              )}
            >
              Turn short-form noise into a treasure chest of knowledge
            </h1>
            <p className={cn("text-xl md:text-2xl font-light", isDark ? "text-white/70" : "text-neutral-600")}>
              Discover, build, and grow with AI-verified education
            </p>
            <Button
              onClick={handleSignIn}
              className="mt-8 px-12 py-6 text-lg rounded-full bg-gradient-to-r from-yellow-400 to-yellow-200 text-black hover:from-yellow-300 hover:to-yellow-100 font-medium"
            >
              Get In Touch / Sign In
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
                <Package className="w-7 h-7 text-yellow-400" />
                <h1
                  className={cn(
                    "text-3xl font-bold bg-gradient-to-r bg-clip-text text-transparent",
                    isDark ? "from-yellow-400 to-white" : "from-yellow-500 to-yellow-600",
                  )}
                >
                  Chestify
                </h1>
              </div>
              <Button
                onClick={() => setIsDark(!isDark)}
                variant="ghost"
                size="icon"
                className={cn(
                  "rounded-full",
                  isDark ? "text-yellow-400 hover:bg-yellow-500/10" : "text-neutral-600 hover:bg-neutral-100",
                )}
              >
                {isDark ? <Sun className="w-5 h-5" /> : <Moon className="w-5 h-5" />}
              </Button>
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
                      ? "bg-yellow-500/20 text-yellow-400 border border-yellow-500/50"
                      : "bg-yellow-400 text-black border border-yellow-400"
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
                      ? "bg-yellow-500/20 text-yellow-400 border border-yellow-500/50"
                      : "bg-yellow-400 text-black border border-yellow-400"
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
                      ? "bg-yellow-500/20 text-yellow-400 border border-yellow-500/50"
                      : "bg-yellow-400 text-black border border-yellow-400"
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
                    isDark ? "from-yellow-400 to-white" : "from-yellow-500 to-yellow-600",
                  )}
                >
                  Your Video Chest
                </h2>
                <p className={cn("mb-6", isDark ? "text-white/60" : "text-neutral-600")}>
                  Browse your fact-checked video collection
                </p>

                <div className="flex gap-2 mb-6">
                  {["All", "Verified", "Misleading", "Processing"].map((filterOption) => (
                    <button
                      key={filterOption}
                      onClick={() => setFilter(filterOption.toLowerCase())}
                      className={cn(
                        "px-4 py-2 rounded-full text-sm font-medium transition-all duration-300",
                        filter === filterOption.toLowerCase()
                          ? "bg-gradient-to-r from-yellow-400 to-yellow-200 text-black"
                          : isDark
                            ? "bg-white/5 text-white/60 hover:bg-white/10 border border-white/10"
                            : "bg-neutral-100 text-neutral-600 hover:bg-neutral-200 border border-neutral-200",
                      )}
                    >
                      {filterOption}
                    </button>
                  ))}
                </div>
              </div>

              <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
                {filteredItems.map((item) => (
                  <Card
                    key={item.id}
                    className={cn(
                      "group backdrop-blur-md border transition-all duration-500 ease-out hover:-translate-y-3 overflow-hidden relative cursor-pointer h-[400px] flex flex-col",
                      isDark ? "bg-neutral-900/60" : "bg-white shadow-sm",
                      item.status === "verified" &&
                        (isDark
                          ? "border-cyan-500/30 hover:border-cyan-500/60 hover:shadow-[0_20px_50px_-12px_rgba(6,182,212,0.4)]"
                          : "border-teal-300 hover:border-teal-400 hover:shadow-[0_20px_50px_-12px_rgba(20,184,166,0.3)]"),
                      item.status === "misleading" &&
                        (isDark
                          ? "border-orange-500/50 hover:border-orange-500/80 hover:shadow-[0_20px_50px_-12px_rgba(249,115,22,0.4)]"
                          : "border-orange-300 hover:border-orange-400 hover:shadow-[0_20px_50px_-12px_rgba(251,146,60,0.3)]"),
                      item.status === "processing" &&
                        (isDark
                          ? "border-purple-400/30 hover:border-purple-400/60 hover:shadow-[0_20px_50px_-12px_rgba(168,85,247,0.4)]"
                          : "border-purple-300 hover:border-purple-400 hover:shadow-[0_20px_50px_-12px_rgba(168,85,247,0.3)]"),
                    )}
                  >
                    {/* Thumbnail Section - Fixed at top */}
                    <div className="relative w-full flex-1 overflow-hidden">
                      <img
                        src={item.thumbnail || "/placeholder.svg"}
                        alt={item.title}
                        className="w-full h-full object-cover"
                      />
                      {/* Platform Badge */}
                      <Badge
                        className={cn(
                          "absolute top-3 right-3 backdrop-blur-sm text-xs z-10",
                          isDark
                            ? "bg-black/70 text-white/90 border-white/20"
                            : "bg-white/90 text-neutral-900 border-neutral-200",
                        )}
                      >
                        {item.url.includes("youtube") ? "YouTube Shorts" : "TikTok"}
                      </Badge>
                    </div>

                    {/* Info Bar - Compact by default, expands on hover to cover thumbnail */}
                    <div
                      className={cn(
                        "absolute bottom-0 left-0 right-0 transition-all duration-500 ease-out backdrop-blur-xl",
                        // Default: small bar at bottom
                        "h-24 group-hover:h-full group-hover:top-0",
                        isDark ? "bg-black/90 border-t border-white/10" : "bg-white/95 border-t border-neutral-200",
                      )}
                    >
                      {/* Compact View Content - visible by default */}
                      <div className="absolute bottom-0 left-0 right-0 p-4 transition-all duration-500 ease-out group-hover:opacity-0 group-hover:translate-y-4">
                        <div className="flex items-center justify-between mb-2">
                          <Badge
                            variant="outline"
                            className={cn(
                              "text-xs",
                              isDark ? "border-white/20 text-white/60" : "border-neutral-300 text-neutral-600",
                            )}
                          >
                            {item.category}
                          </Badge>
                          {item.status === "verified" && (
                            <CheckCircle2 className={cn("w-4 h-4", isDark ? "text-cyan-400" : "text-teal-600")} />
                          )}
                          {item.status === "misleading" && (
                            <AlertTriangle className={cn("w-4 h-4", isDark ? "text-orange-500" : "text-orange-600")} />
                          )}
                          {item.status === "processing" && (
                            <Loader2
                              className={cn("w-4 h-4 animate-spin", isDark ? "text-purple-400" : "text-purple-600")}
                            />
                          )}
                        </div>
                        <h3
                          className={cn("text-sm font-medium line-clamp-1", isDark ? "text-white" : "text-neutral-900")}
                        >
                          {item.title}
                        </h3>
                      </div>

                      {/* Expanded View Content - visible on hover */}
                      <div className="opacity-0 group-hover:opacity-100 transition-all duration-500 ease-out p-6 h-full overflow-y-auto">
                        <div className="flex items-start justify-between mb-4">
                          <Badge
                            variant="outline"
                            className={cn(
                              "text-xs",
                              isDark ? "border-white/20 text-white/60" : "border-neutral-300 text-neutral-600",
                            )}
                          >
                            {item.category}
                          </Badge>
                          {item.status === "verified" && (
                            <CheckCircle2 className={cn("w-5 h-5", isDark ? "text-cyan-400" : "text-teal-600")} />
                          )}
                          {item.status === "misleading" && (
                            <AlertTriangle className={cn("w-5 h-5", isDark ? "text-orange-500" : "text-orange-600")} />
                          )}
                          {item.status === "processing" && (
                            <Loader2
                              className={cn("w-5 h-5 animate-spin", isDark ? "text-purple-400" : "text-purple-600")}
                            />
                          )}
                        </div>

                        <h3 className={cn("text-lg font-semibold mb-3", isDark ? "text-white" : "text-neutral-900")}>
                          {item.title}
                        </h3>

                        {/* Tags */}
                        <div className="flex flex-wrap gap-2 mb-4">
                          {item.tags.map((tag) => (
                            <Badge
                              key={tag}
                              variant="secondary"
                              className={cn(
                                "text-xs",
                                isDark
                                  ? "bg-white/5 text-white/80 border-white/10"
                                  : "bg-neutral-100 text-neutral-700 border-neutral-200",
                              )}
                            >
                              {tag}
                            </Badge>
                          ))}
                        </div>

                        {/* Status-specific content */}
                        {item.status === "processing" ? (
                          <div className="space-y-2">
                            <div
                              className={cn("h-3 rounded animate-pulse", isDark ? "bg-white/10" : "bg-neutral-200")}
                            />
                            <div
                              className={cn(
                                "h-3 rounded animate-pulse w-3/4",
                                isDark ? "bg-white/10" : "bg-neutral-200",
                              )}
                            />
                          </div>
                        ) : (
                          <div className="space-y-4">
                            {/* Fact Check Status Box */}
                            <div
                              className={cn(
                                "p-4 rounded-lg border",
                                item.status === "verified"
                                  ? isDark
                                    ? "bg-cyan-500/10 border-cyan-500/30"
                                    : "bg-teal-50 border-teal-300"
                                  : isDark
                                    ? "bg-orange-500/10 border-orange-500/30"
                                    : "bg-orange-50 border-orange-300",
                              )}
                            >
                              <p
                                className={cn(
                                  "text-xs font-semibold mb-2",
                                  item.status === "verified"
                                    ? isDark
                                      ? "text-cyan-400"
                                      : "text-teal-700"
                                    : isDark
                                      ? "text-orange-400"
                                      : "text-orange-700",
                                )}
                              >
                                {item.status === "verified" ? "✓ VERIFIED" : "⚠ MISLEADING"}
                              </p>
                              <p className={cn("text-xs mb-2", isDark ? "text-white/80" : "text-neutral-700")}>
                                {item.fact_check.reason}
                              </p>
                              {item.fact_check.source_link && (
                                <a
                                  href={item.fact_check.source_link}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className={cn(
                                    "text-xs underline block",
                                    item.status === "verified"
                                      ? isDark
                                        ? "text-cyan-300 hover:text-cyan-200"
                                        : "text-teal-600 hover:text-teal-700"
                                      : isDark
                                        ? "text-orange-300 hover:text-orange-200"
                                        : "text-orange-600 hover:text-orange-700",
                                  )}
                                >
                                  Source
                                </a>
                              )}
                            </div>

                            {/* View AI Analysis Button for misleading content */}
                            {item.status === "misleading" && (
                              <Button
                                size="sm"
                                className={cn(
                                  "w-full rounded-full text-xs",
                                  isDark
                                    ? "bg-orange-500/20 text-orange-400 hover:bg-orange-500/30 border border-orange-500/30"
                                    : "bg-orange-100 text-orange-700 hover:bg-orange-200 border border-orange-300",
                                )}
                              >
                                View AI Analysis
                              </Button>
                            )}
                          </div>
                        )}
                      </div>
                    </div>
                  </Card>
                ))}
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
                      isDark ? "from-yellow-400 to-white" : "from-yellow-500 to-yellow-600",
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
                      "focus:border-yellow-500/50",
                      isDark
                        ? "bg-white/5 border-white/20 text-white placeholder:text-white/40"
                        : "bg-white border-neutral-300 text-neutral-900 placeholder:text-neutral-400",
                    )}
                  />
                  <Button
                    onClick={handleAddVideo}
                    disabled={isAdding || !urlInput.trim()}
                    className="w-full rounded-full bg-gradient-to-r from-yellow-400 to-yellow-200 text-black hover:from-yellow-300 hover:to-yellow-100 font-medium"
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
                        {activity.status === "verified" && (
                          <CheckCircle2
                            className={cn("w-4 h-4 flex-shrink-0", isDark ? "text-cyan-400" : "text-teal-600")}
                          />
                        )}
                        {activity.status === "processing" && (
                          <Loader2
                            className={cn(
                              "w-4 h-4 flex-shrink-0 animate-spin",
                              isDark ? "text-purple-400" : "text-purple-600",
                            )}
                          />
                        )}
                        {activity.status === "failed" && (
                          <AlertTriangle
                            className={cn("w-4 h-4 flex-shrink-0", isDark ? "text-orange-500" : "text-orange-600")}
                          />
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
                  isDark ? "from-yellow-400 to-white" : "from-yellow-500 to-yellow-600",
                )}
              >
                Chat
              </h2>
              <div className="h-[600px] flex flex-col">
                <Card
                  className={cn(
                    "flex-1 backdrop-blur border flex flex-col",
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
                  <CardContent className="flex-1 flex flex-col p-6">
                    <div className="flex-1 overflow-y-auto space-y-4 mb-4">
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
                                  ? "ml-auto bg-yellow-500/20 border border-yellow-500/30 text-white"
                                  : "ml-auto bg-yellow-100 border border-yellow-300 text-neutral-900"
                                : isDark
                                  ? "mr-auto bg-white/5 border border-white/10 text-white/90"
                                  : "mr-auto bg-neutral-100 border border-neutral-200 text-neutral-900",
                            )}
                          >
                            {msg.content}
                          </div>
                        ))
                      )}
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
                          "focus:border-yellow-500/50",
                          isDark
                            ? "bg-white/5 border-white/20 text-white placeholder:text-white/40"
                            : "bg-white border-neutral-300 text-neutral-900 placeholder:text-neutral-400",
                        )}
                      />
                      <Button
                        onClick={handleSendMessage}
                        disabled={!chatInput.trim()}
                        className={cn(
                          "rounded-full",
                          isDark
                            ? "bg-yellow-500/20 text-yellow-400 border border-yellow-500/50 hover:bg-yellow-500/30"
                            : "bg-yellow-400 text-black border border-yellow-400 hover:bg-yellow-300",
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
              Copyright © 2025 Chestify | Hackathon project - Atinder & Chahatbir
            </p>
          </div>
        </footer>
      </div>
    </div>
  )
}
