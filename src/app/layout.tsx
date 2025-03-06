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
    <html lang="en" data-theme="dark">
      <body className={`${inter.className} min-h-screen bg-gradient-to-b from-background to-background-light text-white`}>
        <div className="fixed inset-0 bg-purple-glow pointer-events-none z-0"></div>
        
        <header className="sticky top-0 z-50 border-b border-white/10 bg-background/80 backdrop-blur-xl">
          <div className="container mx-auto px-4 sm:px-6 lg:px-8 max-w-7xl">
            <nav className="flex items-center justify-between h-16">
              <Link href="/" className="text-xl font-bold text-transparent bg-clip-text bg-gradient-to-r from-primary to-primary-light hover:from-primary-light hover:to-primary transition-all duration-300">
                AI Ad Generator
              </Link>
              <div className="flex items-center gap-6">
                <Link href="/voiceover" className="text-gray-300 hover:text-white hover:text-shadow-glow transition-all duration-200">
                  Voiceover
                </Link>
                <Link href="/upload" className="text-gray-300 hover:text-white hover:text-shadow-glow transition-all duration-200">
                  Upload
                </Link>
                <Link href="/editor" className="text-gray-300 hover:text-white hover:text-shadow-glow transition-all duration-200">
                  Editor
                </Link>
                <Link
                  href="/voiceover"
                  className="bg-gradient-to-r from-primary to-primary-light hover:from-primary-light hover:to-primary text-white px-5 py-2 rounded-lg shadow-lg shadow-primary/20 transition-all duration-300 transform hover:scale-105"
                >
                  Get Started
                </Link>
              </div>
            </nav>
          </div>
        </header>

        <main className="container relative z-10 mx-auto px-4 sm:px-6 lg:px-8 max-w-7xl py-8">
          {children}
        </main>

        <footer className="border-t border-white/10 mt-auto bg-background/80 backdrop-blur-xl">
          <div className="container mx-auto px-4 sm:px-6 lg:px-8 max-w-7xl py-8">
            <div className="flex flex-col md:flex-row justify-between items-center gap-4">
              <p className="text-gray-400">
                © {new Date().getFullYear()} AI Ad Generator. All rights reserved.
              </p>
              <div className="flex gap-6">
                <Link href="/" className="text-gray-400 hover:text-primary transition-colors">Home</Link>
                <Link href="/voiceover" className="text-gray-400 hover:text-primary transition-colors">Voiceover</Link>
                <Link href="/upload" className="text-gray-400 hover:text-primary transition-colors">Upload</Link>
                <Link href="/editor" className="text-gray-400 hover:text-primary transition-colors">Editor</Link>
              </div>
            </div>
          </div>
        </footer>
      </body>
    </html>
  )
}
