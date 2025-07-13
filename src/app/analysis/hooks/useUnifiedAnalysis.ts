'use client';

import { useContext } from 'react';
import { AnalysisContext } from '../context/AnalysisContext';

// Simplified hook since we now have a unified provider
export const useUnifiedAnalysis = () => {
  const context = useContext(AnalysisContext);
  
  if (!context) {
    throw new Error('useUnifiedAnalysis must be used within an AnalysisProvider');
  }
  
  return context;
}; 