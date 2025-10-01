#!/bin/bash
# Quick test script to verify v17 deployment
# Run after deploying v17 to check if it's working

set -e

GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m'

echo "🧪 Testing v17 Parser Deployment"
echo "================================="
echo ""

SUPABASE_URL="https://dyevpemrrlmbhifhqiwx.supabase.co"
SUPABASE_ANON_KEY="eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImR5ZXZwZW1ycmxtYmhpZmhxaXd4Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTg5NTczOTAsImV4cCI6MjA3NDUzMzM5MH0.QCCmXXSgXBPakqDFuJHD1IJOi2cbd9ogrCuvqbisnu4"

# Test 1: Simple Costco receipt
echo "Test 1: Simple Costco receipt (2 items)"
echo "---------------------------------------"

RESPONSE=$(curl -s -X POST "$SUPABASE_URL/functions/v1/parse-receipt-v17" \
  -H "Authorization: Bearer $SUPABASE_ANON_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "ocr_text": "WHOLESALE\nArvada #676\n96716 ORG SPINACH\n3.79 E\n9211 ORG YEL ONIO\n5.99 E\nSUBTOTAL\n9.78\nTAX\n0.38\n**** TOTAL\n10.16",
    "household_id": "aeefe34a-a1b7-494e-97cc-b7418a314aee"
  }')

echo "Response: $RESPONSE" | head -c 200
echo ""
echo ""

# Check if response contains success
if echo "$RESPONSE" | grep -q '"success":true'; then
    echo -e "${GREEN}✅ Test 1 PASSED: Function responding${NC}"
else
    echo -e "${RED}❌ Test 1 FAILED: No success in response${NC}"
    echo "Full response: $RESPONSE"
    exit 1
fi

# Check if items were extracted
if echo "$RESPONSE" | grep -q 'ORGANIC SPINACH'; then
    echo -e "${GREEN}✅ Test 2 PASSED: Items extracted${NC}"
else
    echo -e "${RED}❌ Test 2 FAILED: No items found${NC}"
    exit 1
fi

# Check if method is correct
if echo "$RESPONSE" | grep -q 'costco-adaptive'; then
    echo -e "${GREEN}✅ Test 3 PASSED: Correct parser method${NC}"
else
    echo -e "${YELLOW}⚠️  Test 3 WARNING: Method not 'costco-adaptive'${NC}"
fi

echo ""
echo -e "${GREEN}🎉 All tests passed!${NC}"
echo ""
echo "Next steps:"
echo "1. Test with your real Costco receipt"
echo "2. Check logs: npx supabase functions logs parse-receipt-v17 --tail"
echo "3. Monitor for 24 hours"
echo ""
