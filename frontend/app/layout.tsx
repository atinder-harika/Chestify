import type React from "react"
import type { Metadata } from "next"
import { Geist, Geist_Mono } from "next/font/google"
import "./globals.css"

/*
 * Owner: Chahatbir Singh
 * Review focus: Root document layout, fonts, metadata, and application shell.
 */

const _geist = Geist({ subsets: ["latin"] })
const _geistMono = Geist_Mono({ subsets: ["latin"] })

export const metadata: Metadata = {
  title: "Chestify - Turn Noise into Knowledge",
  description: "Turn short-form noise into a treasure chest of knowledge. AI-verified education for quality learning.",
  generator: "v0.app",
  icons: {
    icon: "/favicon.ico",
  },
}

// Wraps route content in the HTML document, applies the language and font
// classes, and supplies the shared metadata-defined application shell.
export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    <html lang="en" className="dark">
      <body className={`font-sans antialiased`}>
        {children}
      </body>
    </html>
  )
}
