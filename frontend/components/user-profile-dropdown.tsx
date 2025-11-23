"use client"

import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { Settings, LogOut } from "lucide-react"
import { cn } from "@/lib/utils"

interface UserData {
  displayName: string
  email: string
  photoURL: string
  initials: string
}

interface UserProfileDropdownProps {
  isDark: boolean
  onSignOut: () => void
  user?: UserData | null
  currentTheme: {
    icon: string
    activeTab?: string
    activeTabLight?: string
  }
}

export function UserProfileDropdown({ isDark, onSignOut, user, currentTheme }: UserProfileDropdownProps) {
  // Show nothing if user is not loaded yet
  if (!user) {
    return null
  }

  const handleSettingsClick = () => {
    console.log("Settings clicked")
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          className={cn(
            "rounded-full transition-all duration-200 border-2",
            isDark 
              ? `border-white/10 hover:border-opacity-50 ${currentTheme.icon.replace('text-', 'hover:border-')}` 
              : `border-neutral-200 hover:border-opacity-50 ${currentTheme.icon.replace('text-', 'hover:border-')}`,
          )}
        >
          <Avatar className="w-9 h-9">
            <AvatarImage src={user.photoURL || "/placeholder.svg"} alt={user.displayName} />
            <AvatarFallback
              className={cn(
                "text-sm font-semibold",
                isDark ? `${currentTheme.icon.replace('text-', 'bg-')}/20 ${currentTheme.icon}` : `${currentTheme.icon.replace('text-', 'bg-')} text-black`,
              )}
            >
              {user.initials}
            </AvatarFallback>
          </Avatar>
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent
        align="end"
        className={cn(
          "w-64 backdrop-blur-md border shadow-lg rounded-md",
          isDark ? "bg-neutral-950/80 border-white/10" : "bg-white/80 border-neutral-200",
        )}
      >
        <DropdownMenuLabel className="py-3">
          <div className={cn("font-semibold", isDark ? "text-white" : "text-neutral-900")}>{user.displayName}</div>
          <div className={cn("text-sm font-normal mt-1", isDark ? "text-neutral-400" : "text-neutral-500")}>
            {user.email}
          </div>
        </DropdownMenuLabel>
        <DropdownMenuSeparator className={isDark ? "bg-white/10" : "bg-neutral-200"} />
        <DropdownMenuItem
          onClick={handleSettingsClick}
          className={cn(
            "cursor-pointer transition-colors",
            isDark 
              ? `focus:bg-opacity-10 focus:${currentTheme.icon.replace('text-', 'text-')} hover:${currentTheme.icon.replace('text-', 'bg-')}/10` 
              : `focus:bg-opacity-20 focus:${currentTheme.icon.replace('text-', 'text-')} hover:${currentTheme.icon.replace('text-', 'bg-')}/20`,
          )}
        >
          <Settings className="w-4 h-4 mr-2" />
          Settings
        </DropdownMenuItem>
        <DropdownMenuItem
          onClick={onSignOut}
          className={cn(
            "cursor-pointer transition-colors",
            isDark 
              ? `focus:bg-opacity-10 focus:${currentTheme.icon.replace('text-', 'text-')} hover:${currentTheme.icon.replace('text-', 'bg-')}/10` 
              : `focus:bg-opacity-20 focus:${currentTheme.icon.replace('text-', 'text-')} hover:${currentTheme.icon.replace('text-', 'bg-')}/20`,
          )}
        >
          <LogOut className="w-4 h-4 mr-2" />
          Sign Out
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
