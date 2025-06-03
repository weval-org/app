'use client';

import React from 'react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, Label } from 'recharts';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';

// Type for the data point expected by the chart
interface ChartDataPoint {
    modelId: string;
    score: number;
    error?: string | null; // Optional error message
}

interface CoverageScoreBarChartProps {
    // Expects data pre-filtered to exclude IDEAL and formatted for recharts
    chartData: ChartDataPoint[];
    promptId: string; // To display in title/description
}

const CoverageScoreBarChart: React.FC<CoverageScoreBarChartProps> = ({ chartData, promptId }) => {
    if (!chartData || chartData.length === 0) {
        return (
            <Card>
                <CardHeader>
                    <CardTitle>LLM Coverage Scores</CardTitle>
                    <CardDescription>Prompt: {promptId}</CardDescription>
                </CardHeader>
                <CardContent>
                    <p className="text-muted-foreground">No coverage data available for comparison against Ideal for this prompt.</p>
                </CardContent>
            </Card>
        );
    }

    // Custom Tooltip Content
    const CustomTooltip = ({ active, payload, label }: any) => {
      if (active && payload && payload.length) {
        const data = payload[0].payload as ChartDataPoint;
        return (
          <div className="bg-background border p-2 rounded shadow-lg text-sm">
            <p className="font-semibold">{`${data.modelId}`}</p>
            {data.error ? (
                 <p className="text-red-600">{`Error: ${data.error}`}</p>
            ) : (
                 <p>{`Coverage Score: ${data.score.toFixed(3)}`}</p>
            )}
          </div>
        );
      }
      return null;
    };

    return (
        <ResponsiveContainer width="100%" height={300}>
            <BarChart
                data={chartData}
                margin={{
                    top: 5, right: 30, left: 0, bottom: 5,
                }}
            >
                <CartesianGrid strokeDasharray="3 3" vertical={false}/>
                <XAxis dataKey="modelId" angle={-20} textAnchor="end" height={50} interval={0} fontSize={10} />
                <YAxis domain={[0, 1]} tickFormatter={(value) => value.toFixed(1)}>
                   <Label value="Coverage Score (vs Ideal)" angle={-90} position="insideLeft" style={{ textAnchor: 'middle' }} fontSize={12}/>
                </YAxis>
                <Tooltip content={<CustomTooltip />} cursor={{ fill: 'rgba(206, 212, 218, 0.3)' }}/>
                {/* <Legend /> */}
                <Bar dataKey="score" name="Coverage Score" fill="#8884d8" >
                     {/* Maybe add labels later if needed: <LabelList dataKey="score" position="top" formatter={(value: number) => value.toFixed(2)} fontSize={10}/> */}
                </Bar>
                {/* Consider adding a bar/representation for errored models if needed */}
            </BarChart>
        </ResponsiveContainer>
    );
};

export default CoverageScoreBarChart; 