'use client'

import { create } from 'zustand'
import type { StateCreator } from 'zustand'

type ErrorStore = {
  showError: ((message: string) => void) | null
  setShowError: (handler: (message: string) => void) => void
}

export const useErrorStore = create<ErrorStore>((set) => ({
  showError: null,
  setShowError: (handler: (message: string) => void) => set({ showError: handler })
})) 