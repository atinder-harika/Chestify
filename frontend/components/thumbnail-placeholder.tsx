/*
 * Review focus: On-theme stand-in for a video thumbnail that is missing or
 * has expired, so a card never shows a blank or broken image.
 */

import { useState } from "react"
import { ChestifyLogo } from "@/components/chestify-logo"
import { cn } from "@/lib/utils"

// Platform name shown under the logo, from the video's link.
export function platformName(url: string): string {
  if (url.includes("youtu")) return "YouTube"
  if (url.includes("instagram")) return "Instagram"
  if (url.includes("x.com") || url.includes("twitter")) return "X"
  if (url.includes("facebook") || url.includes("fb.watch")) return "Facebook"
  if (url.includes("tiktok")) return "TikTok"
  return "Video"
}

export function ThumbnailPlaceholder({
  url,
  gradient,
  className,
}: {
  url: string
  // The active theme's logo colors.
  gradient: [string, string]
  className?: string
}) {
  return (
    <div
      className={cn(
        "relative flex h-full w-full flex-col items-center justify-center gap-3 overflow-hidden bg-gradient-to-b from-zinc-800 via-zinc-900 to-black",
        className,
      )}
    >
      <div
        className="absolute inset-0 opacity-25 blur-3xl"
        style={{ background: `radial-gradient(circle at 50% 40%, ${gradient[0]}, transparent 55%), radial-gradient(circle at 50% 75%, ${gradient[1]}, transparent 50%)` }}
      />
      <ChestifyLogo className="relative h-14 opacity-90" gradient={gradient} title="" />
      <span className="relative text-xs font-medium uppercase tracking-[0.2em] text-white/50">{platformName(url)}</span>
    </div>
  )
}

// Small 9:16 thumbnail for compact lists (e.g. Recent checks), falling back to
// the logo on the theme gradient when the image is missing or fails to load.
export function SmallThumb({
  url,
  thumbnail,
  gradient,
}: {
  url: string
  thumbnail?: string
  gradient: [string, string]
}) {
  const [failed, setFailed] = useState(false)
  return (
    <div className="relative h-16 w-12 flex-shrink-0 overflow-hidden rounded-lg bg-zinc-900">
      {thumbnail && !failed ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={thumbnail} alt="" className="h-full w-full object-cover" onError={() => setFailed(true)} />
      ) : (
        <div className="flex h-full w-full items-center justify-center bg-gradient-to-b from-zinc-800 to-black">
          <ChestifyLogo className="h-5 opacity-80" gradient={gradient} title={`${platformName(url)} video`} />
        </div>
      )}
    </div>
  )
}
