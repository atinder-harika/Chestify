/*
 * Review focus: Progress tab statistics computed client-side from the user's
 * checked videos (no backend or AI calls).
 */

export type ProgressVerdict = "true" | "half_truth" | "false" | "unverified"

export type ProgressInput = {
  created: Date | null
  category: string
  verdict: ProgressVerdict
}

export type TopicStat = {
  name: string
  total: number
  counts: Record<ProgressVerdict, number>
}

export type Badge = {
  id: string
  title: string
  text: string
  current: number
  target: number
  unlocked: boolean
}

export type ProgressStats = {
  checked: number
  caught: number
  falseCount: number
  topicsExplored: number
  thisMonth: number
  streak: number
  activity: { date: string; count: number }[]
  topics: TopicStat[]
  badges: Badge[]
}

export const HEATMAP_DAYS = 84

// Local calendar day, so a streak follows the user's own midnight.
export function dayKey(date: Date): string {
  const y = date.getFullYear()
  const m = String(date.getMonth() + 1).padStart(2, "0")
  const d = String(date.getDate()).padStart(2, "0")
  return `${y}-${m}-${d}`
}

function addDays(date: Date, days: number): Date {
  const copy = new Date(date)
  copy.setDate(copy.getDate() + days)
  return copy
}

// Consecutive days with at least one check, ending today (or yesterday, so
// the streak isn't lost before the user's first check of the day).
export function computeStreak(days: Set<string>, today: Date): number {
  let cursor = days.has(dayKey(today)) ? today : addDays(today, -1)
  let streak = 0
  while (days.has(dayKey(cursor))) {
    streak += 1
    cursor = addDays(cursor, -1)
  }
  return streak
}

export function computeProgress(items: ProgressInput[], today = new Date()): ProgressStats {
  const perDay = new Map<string, number>()
  const topicMap = new Map<string, TopicStat>()
  let caught = 0
  let falseCount = 0
  let thisMonth = 0

  for (const item of items) {
    if (item.verdict === "false" || item.verdict === "half_truth") caught += 1
    if (item.verdict === "false") falseCount += 1

    if (item.created) {
      const key = dayKey(item.created)
      perDay.set(key, (perDay.get(key) || 0) + 1)
      if (item.created.getFullYear() === today.getFullYear() && item.created.getMonth() === today.getMonth()) {
        thisMonth += 1
      }
    }

    const name = item.category.trim() || "Other"
    const topic = topicMap.get(name) || {
      name,
      total: 0,
      counts: { true: 0, half_truth: 0, false: 0, unverified: 0 },
    }
    topic.total += 1
    topic.counts[item.verdict] += 1
    topicMap.set(name, topic)
  }

  const activity = Array.from({ length: HEATMAP_DAYS }, (_, i) => {
    const date = dayKey(addDays(today, i - (HEATMAP_DAYS - 1)))
    return { date, count: perDay.get(date) || 0 }
  })

  const topics = [...topicMap.values()].sort((a, b) => b.total - a.total || a.name.localeCompare(b.name))
  const streak = computeStreak(new Set(perDay.keys()), today)
  const checked = items.length

  const badge = (id: string, title: string, text: string, current: number, target: number): Badge => ({
    id,
    title,
    text,
    current: Math.min(current, target),
    target,
    unlocked: current >= target,
  })

  return {
    checked,
    caught,
    falseCount,
    topicsExplored: topics.length,
    thisMonth,
    streak,
    activity,
    topics,
    badges: [
      badge("first", "First Check", "Check your first video", checked, 1),
      badge("myth", "Myth Buster", "Catch a false claim", falseCount, 1),
      badge("skeptic", "Skeptic", "Catch 5 misleading claims", caught, 5),
      badge("truth", "Truth Seeker", "Check 10 videos", checked, 10),
      badge("explorer", "Explorer", "Explore 5 topics", topics.length, 5),
      badge("streak", "On a Roll", "Keep a 3-day streak", streak, 3),
    ],
  }
}
