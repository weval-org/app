import { getModelCard } from '@/lib/storageService';
import { NextRequest, NextResponse } from 'next/server';

export async function GET(
  request: NextRequest,
  { params }: { params: { modelId: string } }
) {
  try {
    const { modelId } = params;
    
    if (!modelId) {
      return NextResponse.json(
        { error: 'Model ID is required' },
        { status: 400 }
      );
    }

    const modelCard = await getModelCard(modelId);
    
    if (!modelCard) {
      return NextResponse.json(
        { error: `Model card not found for: ${modelId}` },
        { status: 404 }
      );
    }

    return NextResponse.json(modelCard);
  } catch (error) {
    console.error('Error fetching model card:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
} 