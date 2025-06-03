import { useEffect } from 'react'

interface ModalProps {
  isOpen: boolean
  onClose: () => void
  children: React.ReactNode
  maxWidth?: 'sm' | 'md' | 'lg' | 'xl' | '2xl' | '3xl' | '4xl' | '5xl' | '6xl' | '7xl'
}

export function Modal({ isOpen, onClose, children, maxWidth = '4xl' }: ModalProps) {
  useEffect(() => {
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    if (isOpen) {
      window.addEventListener('keydown', handleEscape)
      return () => window.removeEventListener('keydown', handleEscape)
    }
  }, [isOpen, onClose])

  if (!isOpen) return null

  return (
    <div 
      className="fixed inset-0 bg-background/80 backdrop-blur-sm flex items-center justify-center p-4"
      style={{ zIndex: 1000 }}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose()
      }}
    >
      <div className={`relative bg-card border border-border rounded-lg shadow-lg w-full max-w-${maxWidth} max-h-[90vh] overflow-hidden flex flex-col`}>
        {children}
      </div>
    </div>
  )
}

// Helper components for consistent modal structure
export function ModalHeader({ children, className = '' }: { children: React.ReactNode, className?: string }) {
  return (
    <div className={`p-6 border-b border-border ${className}`}>
      {children}
    </div>
  )
}

export function ModalBody({ children, className = '' }: { children: React.ReactNode, className?: string }) {
  return (
    <div className={`flex-1 overflow-y-auto ${className}`}>
      {children}
    </div>
  )
}

export function ModalCloseButton({ onClose }: { onClose: () => void }) {
  return (
    <button 
      onClick={onClose}
      className="absolute right-4 top-4 p-2 hover:bg-muted rounded-full flex-none"
    >
      <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <path d="M6 18L18 6M6 6l12 12" />
      </svg>
    </button>
  )
}

// Add FullScreenModalProps type
interface FullScreenModalProps {
  isOpen: boolean
  onClose: () => void
  children: React.ReactNode
}

// Add FullScreenModal export
export function FullScreenModal({ isOpen, onClose, children }: FullScreenModalProps) {
  useEffect(() => {
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    if (isOpen) {
      window.addEventListener('keydown', handleEscape)
      return () => window.removeEventListener('keydown', handleEscape)
    }
  }, [isOpen, onClose])

  if (!isOpen) return null
  
  return (
    <div className="fixed inset-0 bg-background z-50 flex flex-col">
      {children}
    </div>
  )
} 