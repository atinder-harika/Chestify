"use client"

/*
 * Owner: Dhruti Harshadbhai Prajapati
 * Review focus: Theme selection and light/dark mode controls shared by both headers.
 */

import { Moon, Palette, Sun } from "lucide-react"
import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { cn } from "@/lib/utils"
type ThemeName = string

type ThemeConfig = {
  name: string
  buttonGradient: string
  icon: string
}

type ThemeControlsProps = {
  isDark: boolean
  activeTheme: ThemeName
  currentTheme: ThemeConfig
  themes: Record<string, ThemeConfig>
  onThemeChange: (theme: ThemeName) => void
  onToggleDark: () => void
}

// Maps the supplied theme record into a Radix dropdown and invokes the parent
// callbacks when a theme or the light/dark mode is selected.
export function ThemeControls({
  isDark,
  activeTheme,
  currentTheme,
  themes,
  onThemeChange,
  onToggleDark,
}: ThemeControlsProps) {
  return (
    <div className="flex items-center gap-4">
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            variant="ghost"
            size="icon"
            className={cn(
              "rounded-full",
              isDark ? `${currentTheme.icon} hover:bg-white/10` : "text-neutral-600 hover:bg-neutral-100",
            )}
          >
            <Palette className="w-5 h-5" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent
          align="end"
          className={cn(
            "w-48 backdrop-blur-md border",
            isDark ? "bg-neutral-900/80 border-white/10" : "bg-white border-neutral-200",
          )}
        >
          {Object.entries(themes).map(([key, theme]) => (
            <DropdownMenuItem
              key={key}
              onClick={() => onThemeChange(key as ThemeName)}
              className={cn("cursor-pointer flex items-center gap-2", activeTheme === key && "bg-white/10")}
            >
              <div className={`w-4 h-4 rounded-full bg-gradient-to-r ${theme.buttonGradient}`} />
              <span className={isDark ? "text-white" : "text-neutral-900"}>{theme.name}</span>
            </DropdownMenuItem>
          ))}
        </DropdownMenuContent>
      </DropdownMenu>

      <Button
        onClick={onToggleDark}
        variant="ghost"
        size="icon"
        className={cn(
          "rounded-full",
          isDark ? `${currentTheme.icon} hover:bg-white/10` : "text-neutral-600 hover:bg-neutral-100",
        )}
      >
        {isDark ? <Sun className="w-5 h-5" /> : <Moon className="w-5 h-5" />}
      </Button>
    </div>
  )
}
