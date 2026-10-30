"use client"

/*
 * Review focus: Email + password sign-in, sign-up, and password reset with
 * Firebase Auth, alongside the Google sign-in on the landing page.
 */

import { useState } from "react"
import { FirebaseError } from "firebase/app"
import {
  createUserWithEmailAndPassword,
  sendPasswordResetEmail,
  signInWithEmailAndPassword,
  updateProfile,
} from "firebase/auth"
import { Loader2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { auth } from "@/lib/firebase/config"
import { cn } from "@/lib/utils"

type Mode = "signin" | "signup" | "reset"

// Turns Firebase Auth error codes into messages a tester can act on.
function friendlyAuthError(error: unknown): string {
  const code = error instanceof FirebaseError ? error.code : ""
  switch (code) {
    case "auth/invalid-credential":
    case "auth/wrong-password":
    case "auth/user-not-found":
      return "Wrong email or password."
    case "auth/email-already-in-use":
      return "An account with this email already exists. Sign in instead, or use Google if you signed up that way."
    case "auth/weak-password":
      return "Use a password with at least 6 characters."
    case "auth/invalid-email":
      return "That email address doesn't look right."
    case "auth/missing-password":
      return "Enter your password."
    case "auth/too-many-requests":
      return "Too many attempts. Wait a minute and try again."
    case "auth/network-request-failed":
      return "Network error. Check your connection and try again."
    case "auth/operation-not-allowed":
      return "Email sign-in isn't enabled for this app yet."
    default:
      return "Something went wrong. Please try again."
  }
}

// Collapsible email form. Signing in or up triggers the page's
// onAuthStateChanged listener, which opens the app.
export function EmailAuthForm({
  isDark,
  submitClassName,
  onProfileUpdated,
}: {
  isDark: boolean
  submitClassName: string
  // Called after a new account's display name is saved, so the header refreshes.
  onProfileUpdated: () => void
}) {
  const [mode, setMode] = useState<Mode>("signin")
  const [name, setName] = useState("")
  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)

  const switchMode = (next: Mode) => {
    setMode(next)
    setError(null)
    setNotice(null)
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)
    setNotice(null)
    setBusy(true)
    try {
      if (mode === "signin") {
        await signInWithEmailAndPassword(auth, email.trim(), password)
      } else if (mode === "signup") {
        const credential = await createUserWithEmailAndPassword(auth, email.trim(), password)
        if (name.trim()) {
          await updateProfile(credential.user, { displayName: name.trim() })
          onProfileUpdated()
        }
      } else {
        await sendPasswordResetEmail(auth, email.trim())
        // Firebase doesn't reveal whether the account exists, so neither do we.
        setNotice("If an account exists for that email, a reset link is on its way. Check your spam folder too.")
      }
    } catch (err) {
      console.error("Email auth failed:", err)
      setError(friendlyAuthError(err))
    } finally {
      setBusy(false)
    }
  }

  const inputClass = isDark
    ? "bg-white/5 border-white/20 text-white placeholder:text-white/40"
    : "bg-white border-neutral-300 text-neutral-900 placeholder:text-neutral-400"
  const linkClass = cn("underline underline-offset-2", isDark ? "text-white/70 hover:text-white" : "text-neutral-600 hover:text-neutral-900")

  return (
    <form
      onSubmit={handleSubmit}
      className={cn(
        "w-full max-w-sm mx-auto space-y-3 rounded-2xl border p-5 text-left backdrop-blur",
        isDark ? "bg-black/40 border-white/10" : "bg-white border-neutral-200 shadow-sm",
      )}
    >
      <p className={cn("text-lg font-semibold", isDark ? "text-white" : "text-neutral-900")}>
        {mode === "signin" ? "Sign in with email" : mode === "signup" ? "Create an account" : "Reset your password"}
      </p>

      {mode === "signup" && (
        <Input
          placeholder="Name (optional)"
          autoComplete="name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          className={inputClass}
        />
      )}
      <Input
        type="email"
        placeholder="Email"
        autoComplete="email"
        required
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        className={inputClass}
      />
      {mode !== "reset" && (
        <Input
          type="password"
          placeholder={mode === "signup" ? "Password (6+ characters)" : "Password"}
          autoComplete={mode === "signup" ? "new-password" : "current-password"}
          required
          minLength={6}
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          className={inputClass}
        />
      )}

      {error && (
        <p className="text-sm text-red-400" role="alert">
          {error}
        </p>
      )}
      {notice && <p className={cn("text-sm", isDark ? "text-emerald-300" : "text-emerald-700")}>{notice}</p>}

      <Button type="submit" disabled={busy} className={cn("w-full rounded-full", submitClassName)}>
        {busy && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
        {mode === "signin" ? "Sign in" : mode === "signup" ? "Create account" : "Send reset link"}
      </Button>

      <div className={cn("flex flex-wrap justify-between gap-2 text-sm", isDark ? "text-white/60" : "text-neutral-600")}>
        {mode === "signin" && (
          <>
            <button type="button" onClick={() => switchMode("reset")} className={linkClass}>
              Forgot password?
            </button>
            <button type="button" onClick={() => switchMode("signup")} className={linkClass}>
              Create an account
            </button>
          </>
        )}
        {mode === "signup" && (
          <button type="button" onClick={() => switchMode("signin")} className={linkClass}>
            Already have an account? Sign in
          </button>
        )}
        {mode === "reset" && (
          <button type="button" onClick={() => switchMode("signin")} className={linkClass}>
            Back to sign in
          </button>
        )}
      </div>
    </form>
  )
}
