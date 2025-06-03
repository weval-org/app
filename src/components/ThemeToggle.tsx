'use client'

import { useState, useEffect } from 'react'
import { useTheme } from 'next-themes'

export function ThemeToggle() {
  const { theme, setTheme } = useTheme()
  const [mounted, setMounted] = useState(false)

  useEffect(() => {
    setMounted(true)
  }, [])

  if (!mounted) return null

  return (
    <button
      onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
      className={`fixed bottom-4 right-4 w-8 h-8 rounded-full
                 flex items-center justify-center transition-colors z-[100]
                 border shadow-sm
                 ${theme === 'dark' 
                   ? 'bg-white border-white/20 hover:bg-white/90' 
                   : 'bg-gray-900 border-black/20 hover:bg-gray-800'}`}
      aria-label="Toggle theme"
    >
      <div className="text-sm">
        {theme === 'dark' ? '☀️' : '🌙'}
      </div>
    </button>
  )
} 