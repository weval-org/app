'use client'

import React from 'react'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'

interface SimilarityMatrixProps {
  data: Record<string, Record<string, number>>
}

export default function SimilarityMatrix({ data }: SimilarityMatrixProps) {
  // Extract model names from the data
  const models = Object.keys(data)
  
  // Helper function to get short model names for display
  const getModelShortName = (model: string): string => {
    return model
      .replace('openai:', '')
      .replace('anthropic:', '')
      .replace('openrouter:', '')
  }
  
  // Helper function to determine cell color based on similarity value
  const getSimilarityColorClass = (value: number): string => {
    if (value >= 0.95) return 'bg-green-200'
    if (value >= 0.9) return 'bg-green-100'
    if (value >= 0.85) return 'bg-lime-50'
    if (value >= 0.8) return 'bg-yellow-50'
    if (value >= 0.75) return 'bg-orange-50'
    if (value >= 0.7) return 'bg-red-50'
    return 'bg-red-100'
  }
  
  if (models.length === 0) {
    return <div>No similarity data available.</div>
  }
  
  return (
    <div className="overflow-auto max-h-[400px]">
      <Table className="min-w-full border-collapse">
        <TableHeader className="sticky top-0 bg-background z-10">
          <TableRow>
            <TableHead className="sticky left-0 bg-background z-20">Model</TableHead>
            {models.map((model) => (
              <TableHead key={model} className="px-2 py-1 text-xs font-medium text-center">
                {getModelShortName(model)}
              </TableHead>
            ))}
          </TableRow>
        </TableHeader>
        <TableBody>
          {models.map((model1) => (
            <TableRow key={model1}>
              <TableCell className="sticky left-0 bg-background z-10 font-medium">
                {getModelShortName(model1)}
              </TableCell>
              {models.map((model2) => {
                const similarity = model1 === model2 
                  ? 1 
                  : (data[model1] && data[model1][model2] !== undefined) 
                    ? data[model1][model2]
                    : (data[model2] && data[model2][model1] !== undefined)
                      ? data[model2][model1]
                      : null
                
                return (
                  <TableCell 
                    key={model2} 
                    className={`px-2 py-1 text-center text-xs ${
                      similarity !== null ? getSimilarityColorClass(similarity) : ''
                    } ${model1 === model2 ? 'bg-gray-100' : ''}`}
                  >
                    {similarity !== null ? similarity.toFixed(3) : '-'}
                  </TableCell>
                )
              })}
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  )
}