#!/bin/bash

# Author Distance Analysis - Full Run
# Compares GPT-4o → GPT-5 transition to literary author distances

set -e  # Exit on error

# Configuration
TIMESTAMP=$(date +%Y-%m-%d_%H-%M-%S)
OUTPUT_DIR="./results/author-distance"
OUTPUT_FILE="${OUTPUT_DIR}/analysis_${TIMESTAMP}.json"

# Create output directory if it doesn't exist
mkdir -p "$OUTPUT_DIR"

# Model selection
MODELS="openrouter:openai/gpt-4o,openrouter:openai/gpt-5,openrouter:openai/gpt-4o-mini,openrouter:openai/gpt-4.1,openrouter:openai/o4-mini,anthropic:claude-3-7-sonnet-20250219,openrouter:anthropic/claude-sonnet-4,openrouter:anthropic/claude-3.5-haiku,openrouter:deepseek/deepseek-chat-v3.1,openrouter:google/gemini-2.5-pro,openrouter:x-ai/grok-3,together:meta-llama/Meta-Llama-3.1-405B-Instruct-Turbo"

echo "=================================="
echo "AUTHOR DISTANCE ANALYSIS"
echo "=================================="
echo ""
echo "Output: $OUTPUT_FILE"
echo "Models: 12 (GPT-4o, GPT-5, Claude, Gemini, DeepSeek, Grok, Llama)"
echo "Passages: 7 authors (Carroll, Hemingway, Woolf, Baldwin, Le Guin, Morrison, Didion)"
echo "Samples per prompt: 3"
echo "Estimated runtime: 25-30 minutes"
echo ""
echo "Starting analysis at $(date)..."
echo ""

# Run the analysis
pnpm cli author-distance \
  --passages src/cli/experiments/examples/author-passages-sample.json \
  --models "$MODELS" \
  --samples 3 \
  --temperature 0.7 \
  --embedding-model "openai:text-embedding-3-small" \
  --extractor-model "openai:gpt-4o-mini" \
  --output "$OUTPUT_FILE"

echo ""
echo "=================================="
echo "ANALYSIS COMPLETE"
echo "=================================="
echo ""
echo "Results saved to: $OUTPUT_FILE"
echo "Completed at $(date)"
echo ""
echo "Next steps:"
echo "  1. View results: cat $OUTPUT_FILE | jq '.interpretation'"
echo "  2. Extract distances: cat $OUTPUT_FILE | jq '.distances.modelToModel'"
echo "  3. View GPT-4o → GPT-5 comparison: cat $OUTPUT_FILE | jq '.interpretation.closestAuthorPairs[] | select(.modelPair | contains([\"gpt-4o\", \"gpt-5\"]))'"
echo ""
