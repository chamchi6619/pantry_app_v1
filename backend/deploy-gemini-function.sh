#!/bin/bash

# Deploy Gemini 2.0 Flash Edge Function to Supabase

echo "🚀 Deploying parse-receipt-gemini Edge Function..."

cd supabase

# Check if logged in
if ! npx supabase projects list &>/dev/null; then
    echo "⚠️  Not logged in to Supabase"
    echo "Run: npx supabase login"
    exit 1
fi

# Deploy function
npx supabase functions deploy parse-receipt-gemini \
  --project-ref dyevpemrrlmbhifhqiwx

if [ $? -eq 0 ]; then
    echo "✅ Deployment successful!"
    echo ""
    echo "Set secrets (if not already set):"
    echo "  npx supabase secrets set GEMINI_API_KEY=your_key_here --project-ref dyevpemrrlmbhifhqiwx"
    echo ""
    echo "Test the function:"
    echo "  curl -X POST https://dyevpemrrlmbhifhqiwx.supabase.co/functions/v1/parse-receipt-gemini \\"
    echo "    -H 'Authorization: Bearer YOUR_ANON_KEY' \\"
    echo "    -H 'Content-Type: application/json' \\"
    echo "    -d '{\"ocr_text\":\"COSTCO\\n96716 ORG SPINACH\\n4.99\",\"household_id\":\"test\"}'"
else
    echo "❌ Deployment failed"
    exit 1
fi
