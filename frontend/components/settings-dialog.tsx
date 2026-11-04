"use client"

/*
 * Review focus: Account settings: display name, profile picture (a small
 * data URL on the user's Firestore doc, no Storage needed) and password.
 */

import { useEffect, useRef, useState } from "react"
import * as Dialog from "@radix-ui/react-dialog"
import { FirebaseError } from "firebase/app"
import {
  EmailAuthProvider,
  reauthenticateWithCredential,
  sendPasswordResetEmail,
  updatePassword,
  updateProfile,
  type User,
} from "firebase/auth"
import { doc, setDoc } from "firebase/firestore"
import { Loader2, X } from "lucide-react"
import { Button } from "@/components/ui/button"
import { auth, db } from "@/lib/firebase/config"
import { cn } from "@/lib/utils"

const AVATAR_SIZE = 160

// Crops the image to a centered square and shrinks it to a small JPEG data URL.
async function toAvatarDataUrl(file: File): Promise<string> {
  const bitmap = await createImageBitmap(file)
  const side = Math.min(bitmap.width, bitmap.height)
  const canvas = document.createElement("canvas")
  canvas.width = AVATAR_SIZE
  canvas.height = AVATAR_SIZE
  const context = canvas.getContext("2d")
  if (!context) throw new Error("Canvas unavailable")
  context.drawImage(
    bitmap,
    (bitmap.width - side) / 2,
    (bitmap.height - side) / 2,
    side,
    side,
    0,
    0,
    AVATAR_SIZE,
    AVATAR_SIZE,
  )
  return canvas.toDataURL("image/jpeg", 0.85)
}

function passwordError(error: unknown): string {
  const code = error instanceof FirebaseError ? error.code : ""
  if (code === "auth/invalid-credential" || code === "auth/wrong-password") return "Your current password is wrong."
  if (code === "auth/weak-password") return "Use a new password with at least 6 characters."
  if (code === "auth/too-many-requests") return "Too many attempts. Wait a minute and try again."
  if (code === "auth/requires-recent-login") return "Please sign out and back in, then try again."
  return "Couldn't change your password. Please try again."
}

export function SettingsDialog({
  open,
  onOpenChange,
  user,
  avatar,
  isDark,
  buttonClassName,
  onProfileUpdated,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  user: User
  // Current stored picture (data URL), if any.
  avatar?: string | null
  isDark: boolean
  // Theme gradient + text classes for primary buttons.
  buttonClassName: string
  // Called after the display name changes, so the header refreshes.
  onProfileUpdated: () => void
}) {
  const [name, setName] = useState(user.displayName || "")
  const [savingName, setSavingName] = useState(false)
  const [nameNotice, setNameNotice] = useState<string | null>(null)
  const [pictureBusy, setPictureBusy] = useState(false)
  const [pictureError, setPictureError] = useState<string | null>(null)
  const [currentPassword, setCurrentPassword] = useState("")
  const [newPassword, setNewPassword] = useState("")
  const [passwordBusy, setPasswordBusy] = useState(false)
  const [passwordNotice, setPasswordNotice] = useState<{ ok: boolean; text: string } | null>(null)
  const fileInput = useRef<HTMLInputElement>(null)

  const hasPassword = user.providerData.some((p) => p.providerId === "password")

  // Fresh form each time the dialog opens.
  useEffect(() => {
    if (!open) return
    setName(user.displayName || "")
    setNameNotice(null)
    setPictureError(null)
    setCurrentPassword("")
    setNewPassword("")
    setPasswordNotice(null)
  }, [open, user])

  const saveName = async () => {
    const trimmed = name.trim()
    if (!trimmed || trimmed === user.displayName) return
    setSavingName(true)
    setNameNotice(null)
    try {
      await updateProfile(user, { displayName: trimmed.slice(0, 60) })
      onProfileUpdated()
      setNameNotice("Saved.")
    } catch (error) {
      console.error("Name update failed:", error)
      setNameNotice("Couldn't save your name. Please try again.")
    } finally {
      setSavingName(false)
    }
  }

  const choosePicture = async (file?: File) => {
    if (!file) return
    if (!file.type.startsWith("image/")) {
      setPictureError("Choose an image file.")
      return
    }
    setPictureBusy(true)
    setPictureError(null)
    try {
      const dataUrl = await toAvatarDataUrl(file)
      await setDoc(doc(db, "users", user.uid), { avatar: dataUrl }, { merge: true })
    } catch (error) {
      console.error("Picture update failed:", error)
      setPictureError("Couldn't use that image. Try a different one.")
    } finally {
      setPictureBusy(false)
      if (fileInput.current) fileInput.current.value = ""
    }
  }

  const removePicture = async () => {
    setPictureBusy(true)
    try {
      await setDoc(doc(db, "users", user.uid), { avatar: null }, { merge: true })
    } finally {
      setPictureBusy(false)
    }
  }

  const changePassword = async () => {
    if (!user.email) return
    setPasswordBusy(true)
    setPasswordNotice(null)
    try {
      await reauthenticateWithCredential(user, EmailAuthProvider.credential(user.email, currentPassword))
      await updatePassword(user, newPassword)
      setCurrentPassword("")
      setNewPassword("")
      setPasswordNotice({ ok: true, text: "Password changed." })
    } catch (error) {
      console.error("Password change failed:", error)
      setPasswordNotice({ ok: false, text: passwordError(error) })
    } finally {
      setPasswordBusy(false)
    }
  }

  const sendReset = async () => {
    if (!user.email) return
    try {
      await sendPasswordResetEmail(auth, user.email)
      setPasswordNotice({ ok: true, text: `Reset link sent to ${user.email}. Check your spam folder too.` })
    } catch (error) {
      console.error("Reset email failed:", error)
      setPasswordNotice({ ok: false, text: "Couldn't send the reset link. Please try again." })
    }
  }

  const label = cn("text-sm font-medium", isDark ? "text-white" : "text-neutral-900")
  const hint = cn("text-xs", isDark ? "text-white/50" : "text-neutral-500")
  const input = cn(
    "h-10 w-full rounded-lg border px-3 text-sm outline-none",
    isDark
      ? "border-white/15 bg-white/5 text-white placeholder:text-white/35 focus:border-white/30"
      : "border-neutral-300 bg-white text-neutral-900 placeholder:text-neutral-400 focus:border-neutral-400",
  )
  const ghost = cn(
    "rounded-full border text-sm",
    isDark ? "border-white/15 bg-white/5 text-white/85 hover:bg-white/10" : "border-neutral-300 bg-white text-neutral-800 hover:bg-neutral-50",
  )
  const initials = (user.displayName || user.email || "C").slice(0, 1).toUpperCase()

  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm" />
        <Dialog.Content
          className={cn(
            "fixed left-1/2 top-1/2 z-50 max-h-[90dvh] w-[calc(100%-2rem)] max-w-lg -translate-x-1/2 -translate-y-1/2 overflow-y-auto rounded-3xl border p-6 shadow-2xl sm:p-8",
            isDark ? "border-white/10 bg-[#0f0f11]" : "border-neutral-200 bg-white",
          )}
        >
          <div className="mb-6 flex items-center justify-between">
            <Dialog.Title className={cn("text-xl font-semibold", isDark ? "text-white" : "text-neutral-900")}>
              Settings
            </Dialog.Title>
            <Dialog.Close
              aria-label="Close settings"
              className={cn("rounded-full p-2", isDark ? "text-white/60 hover:bg-white/10" : "text-neutral-500 hover:bg-neutral-100")}
            >
              <X className="h-4 w-4" />
            </Dialog.Close>
          </div>
          <Dialog.Description className="sr-only">Change your name, profile picture and password.</Dialog.Description>

          <div className="space-y-8">
            <section className="flex items-center gap-4">
              <div className={cn("flex h-16 w-16 flex-shrink-0 items-center justify-center overflow-hidden rounded-full text-xl font-semibold", isDark ? "bg-white/10 text-white" : "bg-neutral-100 text-neutral-800")}>
                {avatar || user.photoURL ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={avatar || user.photoURL || ""} alt="" className="h-full w-full object-cover" />
                ) : (
                  initials
                )}
              </div>
              <div className="space-y-2">
                <p className={label}>Profile picture</p>
                <div className="flex flex-wrap gap-2">
                  <Button type="button" size="sm" disabled={pictureBusy} onClick={() => fileInput.current?.click()} className={ghost}>
                    {pictureBusy && <Loader2 className="mr-1 h-3 w-3 animate-spin" />}
                    Upload
                  </Button>
                  {avatar && (
                    <Button type="button" size="sm" disabled={pictureBusy} onClick={removePicture} className={ghost}>
                      Remove
                    </Button>
                  )}
                </div>
                <input
                  ref={fileInput}
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={(e) => choosePicture(e.target.files?.[0])}
                />
                {pictureError && <p className="text-xs text-red-400">{pictureError}</p>}
              </div>
            </section>

            <section className="space-y-2">
              <label htmlFor="settings-name" className={label}>
                Display name
              </label>
              <div className="flex gap-2">
                <input
                  id="settings-name"
                  value={name}
                  maxLength={60}
                  onChange={(e) => {
                    setName(e.target.value)
                    setNameNotice(null)
                  }}
                  onKeyDown={(e) => e.key === "Enter" && saveName()}
                  className={input}
                />
                <Button
                  type="button"
                  onClick={saveName}
                  disabled={savingName || !name.trim() || name.trim() === user.displayName}
                  className={cn("h-10 rounded-full bg-gradient-to-r px-5", buttonClassName)}
                >
                  {savingName ? <Loader2 className="h-4 w-4 animate-spin" /> : "Save"}
                </Button>
              </div>
              {nameNotice && <p className={hint}>{nameNotice}</p>}
            </section>

            <section className="space-y-2">
              <p className={label}>Password</p>
              {hasPassword ? (
                <>
                  <input
                    type="password"
                    autoComplete="current-password"
                    placeholder="Current password"
                    value={currentPassword}
                    onChange={(e) => setCurrentPassword(e.target.value)}
                    className={input}
                  />
                  <input
                    type="password"
                    autoComplete="new-password"
                    placeholder="New password (6+ characters)"
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                    className={input}
                  />
                  <div className="flex flex-wrap items-center gap-3">
                    <Button
                      type="button"
                      onClick={changePassword}
                      disabled={passwordBusy || !currentPassword || newPassword.length < 6}
                      className={cn("rounded-full bg-gradient-to-r px-5", buttonClassName)}
                    >
                      {passwordBusy ? <Loader2 className="h-4 w-4 animate-spin" /> : "Change password"}
                    </Button>
                    <button type="button" onClick={sendReset} className={cn("text-sm underline underline-offset-2", isDark ? "text-white/60 hover:text-white" : "text-neutral-600")}>
                      Forgot it? Send a reset link
                    </button>
                  </div>
                </>
              ) : (
                <p className={hint}>You sign in with Google, so your password is managed in your Google account.</p>
              )}
              {passwordNotice && (
                <p className={cn("text-xs", passwordNotice.ok ? (isDark ? "text-emerald-300" : "text-emerald-700") : "text-red-400")}>
                  {passwordNotice.text}
                </p>
              )}
            </section>

            <p className={hint}>Signed in as {user.email}</p>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  )
}
