#!/bin/bash

# Helper script to analyze author distance results
# Usage: ./scripts/analyze-author-distance-results.sh <path-to-results.json>

if [ -z "$1" ]; then
  echo "Usage: $0 <path-to-results.json>"
  echo ""
  echo "Example: $0 results/author-distance/analysis_2025-01-20_14-30-00.json"
  exit 1
fi

RESULTS_FILE="$1"

if [ ! -f "$RESULTS_FILE" ]; then
  echo "Error: File not found: $RESULTS_FILE"
  exit 1
fi

echo "=================================="
echo "AUTHOR DISTANCE ANALYSIS RESULTS"
echo "=================================="
echo ""

# Metadata
echo "📋 METADATA"
echo "─────────────────────────────────"
echo "Timestamp: $(cat "$RESULTS_FILE" | jq -r '.metadata.timestamp')"
echo "Embedding Model: $(cat "$RESULTS_FILE" | jq -r '.metadata.embeddingModel')"
echo "Extractor Model: $(cat "$RESULTS_FILE" | jq -r '.metadata.extractorModel')"
echo "Authors: $(cat "$RESULTS_FILE" | jq -r '.metadata.authors | join(", ")')"
echo "Models tested: $(cat "$RESULTS_FILE" | jq -r '.metadata.candidateModels | length')"
echo "Samples per prompt: $(cat "$RESULTS_FILE" | jq -r '.metadata.samplesPerPrompt')"
echo ""

# GPT-4o → GPT-5 specific analysis
echo "🎯 PRIMARY FINDING: GPT-4o → GPT-5"
echo "─────────────────────────────────"
cat "$RESULTS_FILE" | jq -r '
  .interpretation.closestAuthorPairs[] |
  select(
    (.modelPair[0] | contains("gpt-4o")) and
    (.modelPair[1] | contains("gpt-5"))
  ) |
  "Model Distance: \(.distance | tonumber | . * 1000 | round / 1000)
Literary Equivalent: \(.closestAuthorPair[0]) ↔ \(.closestAuthorPair[1])
Author Distance: \(.authorDistance | tonumber | . * 1000 | round / 1000)
Match Quality: \(100 - .percentageDifference | tonumber | round)% similar"
'
echo ""

# All author-to-author distances (baseline)
echo "📚 AUTHOR BASELINES"
echo "─────────────────────────────────"
cat "$RESULTS_FILE" | jq -r '
  .distances.authorToAuthor |
  sort_by(.distance) |
  .[] |
  "\(.entityA) ↔ \(.entityB): \(.distance | tonumber | . * 1000 | round / 1000)"
'
echo ""

# Top 10 closest model pairs
echo "🤖 TOP 10 CLOSEST MODEL PAIRS"
echo "─────────────────────────────────"
cat "$RESULTS_FILE" | jq -r '
  .distances.modelToModel |
  sort_by(.distance) |
  .[0:10] |
  .[] |
  "\(.entityA | split("/")[-1]) ↔ \(.entityB | split("/")[-1]): \(.distance | tonumber | . * 1000 | round / 1000)"
'
echo ""

# Top 10 most distant model pairs
echo "🌌 TOP 10 MOST DISTANT MODEL PAIRS"
echo "─────────────────────────────────"
cat "$RESULTS_FILE" | jq -r '
  .distances.modelToModel |
  sort_by(.distance) |
  reverse |
  .[0:10] |
  .[] |
  "\(.entityA | split("/")[-1]) ↔ \(.entityB | split("/")[-1]): \(.distance | tonumber | . * 1000 | round / 1000)"
'
echo ""

# All GPT-4o comparisons
echo "🔍 ALL GPT-4o COMPARISONS"
echo "─────────────────────────────────"
cat "$RESULTS_FILE" | jq -r '
  .distances.modelToModel |
  map(select(.entityA | contains("gpt-4o") or .entityB | contains("gpt-4o"))) |
  sort_by(.distance) |
  .[] |
  "\(.entityA | split("/")[-1]) ↔ \(.entityB | split("/")[-1]): \(.distance | tonumber | . * 1000 | round / 1000)"
'
echo ""

# Summary statistics
echo "📊 SUMMARY STATISTICS"
echo "─────────────────────────────────"
cat "$RESULTS_FILE" | jq -r '
  .distances.modelToModel |
  [.[] | .distance] |
  {
    "Mean distance": (add / length | . * 1000 | round / 1000),
    "Min distance": (min | . * 1000 | round / 1000),
    "Max distance": (max | . * 1000 | round / 1000),
    "Median distance": (sort | if length % 2 == 0 then (.[length/2-1] + .[length/2]) / 2 else .[length/2 | floor] end | . * 1000 | round / 1000)
  } |
  to_entries |
  .[] |
  "\(.key): \(.value)"
'
echo ""

echo "✨ Analysis complete!"
echo ""
