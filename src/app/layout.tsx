import React from 'react'
import './globals.css'
import type { Metadata } from 'next'
import { Inter } from 'next/font/google'
import Link from 'next/link'

const inter = Inter({ subsets: ['latin'] })

export const metadata: Metadata = {
  title: 'AI Ad Video Generator',
  description: 'Generate high-converting ad videos with AI',
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="en">
      <body className={`${inter.className} min-h-screen bg-background text-white`}>
        <header className="border-b border-gray-800 bg-background-light/50 backdrop-blur-sm">
          <div className="container mx-auto px-4 sm:px-6 lg:px-8 max-w-7xl">
            <nav className="flex items-center justify-between h-16">
              <Link href="/" className="text-xl font-bold text-white hover:text-primary transition">
                AI Ad Generator
              </Link>
              <div className="flex items-center gap-6">
                <Link href="/voiceover" className="text-gray-300 hover:text-white transition">
                  Voiceover
                </Link>
                <Link href="/upload" className="text-gray-300 hover:text-white transition">
                  Upload
                </Link>
                <Link href="/generate" className="text-gray-300 hover:text-white transition">
                  Generate
                </Link>
                <Link
                  href="/voiceover"
                  className="bg-primary hover:bg-primary-dark text-white px-4 py-2 rounded-lg transition"
                >
                  Get Started
                </Link>
              </div>
            </nav>
          </div>
        </header>

        <main className="container mx-auto px-4 sm:px-6 lg:px-8 max-w-7xl py-8">
          {children}
        </main>

        <footer className="border-t border-gray-800 mt-auto">
          <div className="container mx-auto px-4 sm:px-6 lg:px-8 max-w-7xl py-8">
            <p className="text-center text-gray-500">
              © {new Date().getFullYear()} AI Ad Generator. All rights reserved.
            </p>
          </div>
        </footer>
      </body>
    </html>
  )
}
