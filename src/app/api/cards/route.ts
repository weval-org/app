import { listModelCards } from '@/lib/storageService';
import { NextResponse } from 'next/server';

export async function GET() {
  try {
    const modelCardIds = await listModelCards();
    
    return NextResponse.json({
      modelCards: modelCardIds,
      count: modelCardIds.length
    });
  } catch (error) {
    console.error('Error listing model cards:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
} 