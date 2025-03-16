import './globals.css'
import type { Metadata } from 'next'
import { Inter } from 'next/font/google'
import AuthProvider from '@/components/AuthProvider'
import Navbar from '@/components/Navbar'

const inter = Inter({ subsets: ['latin'] })

export const metadata: Metadata = {
  title: 'AI Ad Generator',
  description: 'Create high-converting ad videos with AI',
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="en" data-theme="dark">
      <body className={`${inter.className} min-h-screen bg-gradient-to-b from-background to-background-light text-white`}>
        <AuthProvider>
          <Navbar />
          <main className="container mx-auto px-4 py-4">
            {children}
          </main>
          <footer className="py-6 text-center text-sm text-gray-500">
            <p>© {new Date().getFullYear()} AI Ad Generator. All rights reserved.</p>
          </footer>
        </AuthProvider>
      </body>
    </html>
  )
}
