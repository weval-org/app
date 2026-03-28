#!/bin/bash

# Test script for fact-check endpoint
# Usage: ./examples/test-factcheck.sh [endpoint-url]

ENDPOINT="${1:-http://localhost:3172/api/internal/factcheck}"

echo "Testing fact-check endpoint: $ENDPOINT"
echo ""

# Test 1: True claim (should score high)
echo "=== Test 1: True Claim ==="
echo "Claim: Water freezes at 0°C at standard atmospheric pressure"
curl -s -X POST "$ENDPOINT" \
  -H "Content-Type: application/json" \
  -d '{
    "claim": "Water freezes at 0°C (32°F) at standard atmospheric pressure"
  }' | jq '.'
echo ""
echo ""

# Test 2: False claim (should score low)
echo "=== Test 2: False Claim ==="
echo "Claim: The Earth is flat"
curl -s -X POST "$ENDPOINT" \
  -H "Content-Type: application/json" \
  -d '{
    "claim": "The Earth is flat"
  }' | jq '.'
echo ""
echo ""

# Test 3: Partially true claim (should score medium)
echo "=== Test 3: Partially True Claim ==="
echo "Claim: All programming languages are interpreted"
curl -s -X POST "$ENDPOINT" \
  -H "Content-Type: application/json" \
  -d '{
    "claim": "All programming languages are interpreted"
  }' | jq '.'
echo ""
echo ""

# Test 4: Scientific fact (should score very high with high confidence)
echo "=== Test 4: Scientific Fact ==="
echo "Claim: The speed of light in a vacuum is approximately 299,792,458 meters per second"
curl -s -X POST "$ENDPOINT" \
  -H "Content-Type: application/json" \
  -d '{
    "claim": "The speed of light in a vacuum is approximately 299,792,458 meters per second",
    "includeRaw": true
  }' | jq '.'
echo ""
echo ""

# Test 5: Recent event (time-sensitive, may vary)
echo "=== Test 5: Recent Event (Time-Sensitive) ==="
echo "Claim: António Guterres is the current Secretary-General of the United Nations"
curl -s -X POST "$ENDPOINT" \
  -H "Content-Type: application/json" \
  -d '{
    "claim": "António Guterres is the current Secretary-General of the United Nations"
  }' | jq '.'
echo ""
echo ""

# Test 6: Complex claim requiring nuance
echo "=== Test 6: Complex Claim ==="
echo "Claim: COVID-19 vaccines are highly effective at preventing severe illness"
curl -s -X POST "$ENDPOINT" \
  -H "Content-Type: application/json" \
  -d '{
    "claim": "COVID-19 vaccines are highly effective at preventing severe illness and hospitalization",
    "maxTokens": 2500
  }' | jq '.'
echo ""
echo ""

# Test 7: Error case - missing claim
echo "=== Test 7: Error Case - Missing Claim ==="
curl -s -X POST "$ENDPOINT" \
  -H "Content-Type: application/json" \
  -d '{}' | jq '.'
echo ""
echo ""

# Test 8: Error case - invalid method
echo "=== Test 8: Error Case - Invalid Method ==="
curl -s -X GET "$ENDPOINT" | jq '.'
echo ""

echo "=== Tests Complete ==="
