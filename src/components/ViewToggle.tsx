'use client'

import { useRouter, usePathname } from 'next/navigation'

interface ViewToggleProps {
  className?: string
}

export function ViewToggle({ className = '' }: ViewToggleProps) {
  const router = useRouter()
  const pathname = usePathname()
  
  const isGrid = pathname.includes('/eval_0/grid')
  const isScenarios = pathname.includes('/eval_0/scenarios')

  return (
    <div className={`inline-flex rounded-lg border border-border bg-background/50 p-0.5 ${className}`}>
      <button
        onClick={() => router.push('/eval_0/grid')}
        className={`px-4 py-1.5 text-sm font-medium rounded-md transition-colors ${
          isGrid 
            ? 'bg-primary text-primary-foreground shadow-sm' 
            : 'text-muted-foreground hover:bg-muted'
        }`}
      >
        Grid View
      </button>
      <button
        onClick={() => router.push('/eval_0/scenarios')}
        className={`px-4 py-1.5 text-sm font-medium rounded-md transition-colors ${
          isScenarios
            ? 'bg-primary text-primary-foreground shadow-sm'
            : 'text-muted-foreground hover:bg-muted'
        }`}
      >
        Scenario View
      </button>
    </div>
  )
} 