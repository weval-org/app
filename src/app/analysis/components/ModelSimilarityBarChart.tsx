'use client'

import React, { useState } from 'react'
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend
} from 'recharts'
import { Button } from '@/components/ui/button'

interface ModelSimilarityBarChartProps {
  similarityMatrix: Record<string, Record<string, number>>
  models: string[]
}

export default function ModelSimilarityBarChart({ similarityMatrix, models }: ModelSimilarityBarChartProps) {
  const [selectedModel, setSelectedModel] = useState<string | null>(models[0] || null);
  
  // If we don't have enough data, don't render
  if (!selectedModel || !similarityMatrix[selectedModel]) {
    return <div>Insufficient data for bar chart visualization.</div>;
  }
  
  // Transform the data for the bar chart - format that works with Recharts
  const data = models
    .filter(model => model !== selectedModel) // Exclude the selected model itself
    .map(model => ({
      name: model,
      similarity: similarityMatrix[selectedModel][model]
    }))
    .sort((a, b) => b.similarity - a.similarity); // Sort by similarity (highest first)
  
  if (data.length === 0) {
    return <div>No similarity data available for visualization.</div>;
  }
  
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-2 justify-center">
        {models.map((model) => (
          <Button
            key={model}
            variant={selectedModel === model ? "default" : "outline"}
            size="sm"
            onClick={() => setSelectedModel(model)}
          >
            {model}
          </Button>
        ))}
      </div>
      
      <div className="w-full h-96">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart
            data={data}
            layout="vertical"
            margin={{ top: 20, right: 30, left: 90, bottom: 20 }}
          >
            <CartesianGrid strokeDasharray="3 3" />
            <XAxis 
              type="number" 
              domain={[0, 1]} 
              tickCount={6}
              tickFormatter={(value) => value.toFixed(2)}
            />
            <YAxis 
              dataKey="name" 
              type="category" 
              width={80} 
              tick={{ fontSize: 12 }}
            />
            <Tooltip
              formatter={(value: number) => [value.toFixed(3), 'Similarity']}
              labelFormatter={(label) => `${selectedModel} ↔ ${label}`}
            />
            <Legend />
            <Bar 
              dataKey="similarity" 
              name={`Similarity to ${selectedModel}`} 
              fill="#3b82f6" 
              barSize={24}
            />
          </BarChart>
        </ResponsiveContainer>
      </div>
      
      <div className="text-center text-sm text-muted-foreground px-4">
        This bar chart shows how similar the selected model's responses are to other models.
        Longer bars indicate greater similarity.
      </div>
    </div>
  );
} 