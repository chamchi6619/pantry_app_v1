#!/bin/bash
# Deploy v17 Parser to Supabase
# Run this script to deploy the v17 adaptive parser

set -e  # Exit on error

echo "🚀 Deploying v17 Adaptive Parser to Supabase"
echo "=============================================="
echo ""

# Colors
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m' # No Color

# Check if we're in the right directory
if [ ! -d "backend/supabase/functions/parse-receipt-v17" ]; then
    echo -e "${RED}❌ Error: parse-receipt-v17 function not found${NC}"
    echo "Please run this script from the project root directory"
    exit 1
fi

echo -e "${GREEN}✅ Found v17 function directory${NC}"
echo ""

# Navigate to backend
cd backend

# Check if Supabase CLI is installed
if ! command -v npx &> /dev/null; then
    echo -e "${RED}❌ Error: npx not found${NC}"
    echo "Please install Node.js and npm"
    exit 1
fi

echo -e "${GREEN}✅ npx found${NC}"
echo ""

# Check if logged in
echo "🔐 Checking Supabase login status..."
if ! npx supabase projects list &> /dev/null; then
    echo -e "${YELLOW}⚠️  Not logged in to Supabase${NC}"
    echo ""
    echo "Please run: npx supabase login"
    echo "Then re-run this script"
    exit 1
fi

echo -e "${GREEN}✅ Logged in to Supabase${NC}"
echo ""

# Check if linked to project
echo "🔗 Checking project link..."
if ! npx supabase status &> /dev/null; then
    echo -e "${YELLOW}⚠️  Not linked to project${NC}"
    echo ""
    echo "Please run: npx supabase link --project-ref dyevpemrrlmbhifhqiwx"
    echo "Then re-run this script"
    exit 1
fi

echo -e "${GREEN}✅ Linked to project${NC}"
echo ""

# Deploy function
echo "📦 Deploying parse-receipt-v17..."
echo ""

if npx supabase functions deploy parse-receipt-v17; then
    echo ""
    echo -e "${GREEN}✅ Successfully deployed parse-receipt-v17!${NC}"
    echo ""
    echo "🔗 Function URL:"
    echo "https://dyevpemrrlmbhifhqiwx.supabase.co/functions/v1/parse-receipt-v17"
    echo ""
    echo "📋 Next Steps:"
    echo "1. Test the function with curl (see DEPLOY_V17.md)"
    echo "2. Update frontend to use v17 (src/services/receiptService.ts)"
    echo "3. Test with your Costco receipt"
    echo "4. Monitor logs: npx supabase functions logs parse-receipt-v17 --tail"
    echo ""
    echo -e "${GREEN}🎉 Deployment complete!${NC}"
else
    echo ""
    echo -e "${RED}❌ Deployment failed${NC}"
    echo ""
    echo "Troubleshooting:"
    echo "1. Check you're logged in: npx supabase login"
    echo "2. Check project link: npx supabase link --project-ref dyevpemrrlmbhifhqiwx"
    echo "3. Check function exists: ls -la supabase/functions/parse-receipt-v17/"
    echo "4. View detailed error with: npx supabase functions deploy parse-receipt-v17 --debug"
    exit 1
fi
