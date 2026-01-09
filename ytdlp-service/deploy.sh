#!/bin/bash

# Deploy yt-dlp service to Google Cloud Run
#
# Prerequisites:
# 1. Install gcloud CLI: https://cloud.google.com/sdk/docs/install
# 2. Authenticate: gcloud auth login
# 3. Set project: gcloud config set project YOUR_PROJECT_ID
# 4. Enable APIs: gcloud services enable run.googleapis.com containerregistry.googleapis.com

set -e  # Exit on error

# Configuration
SERVICE_NAME="ytdlp-service"
REGION="us-central1"  # Change if needed
MEMORY="512Mi"
TIMEOUT="60s"
MAX_INSTANCES="10"
MIN_INSTANCES="0"  # Scale to zero when idle (FREE!)

echo "🚀 Deploying yt-dlp service to Google Cloud Run..."
echo ""
echo "Configuration:"
echo "  Service:      $SERVICE_NAME"
echo "  Region:       $REGION"
echo "  Memory:       $MEMORY"
echo "  Timeout:      $TIMEOUT"
echo "  Max instances: $MAX_INSTANCES"
echo ""

# Check if gcloud is installed
if ! command -v gcloud &> /dev/null; then
    echo "❌ Error: gcloud CLI not found"
    echo "Please install from: https://cloud.google.com/sdk/docs/install"
    exit 1
fi

# Check if user is authenticated
if ! gcloud auth list --filter=status:ACTIVE --format="value(account)" &> /dev/null; then
    echo "❌ Error: Not authenticated with gcloud"
    echo "Run: gcloud auth login"
    exit 1
fi

# Get current project
PROJECT_ID=$(gcloud config get-value project 2>/dev/null)
if [ -z "$PROJECT_ID" ]; then
    echo "❌ Error: No project set"
    echo "Run: gcloud config set project YOUR_PROJECT_ID"
    exit 1
fi

echo "📦 Project: $PROJECT_ID"
echo ""

# Deploy
echo "🏗️  Building and deploying..."
gcloud run deploy $SERVICE_NAME \
  --source . \
  --platform managed \
  --region $REGION \
  --allow-unauthenticated \
  --memory $MEMORY \
  --timeout $TIMEOUT \
  --max-instances $MAX_INSTANCES \
  --min-instances $MIN_INSTANCES

# Get service URL
echo ""
echo "✅ Deployment complete!"
echo ""
SERVICE_URL=$(gcloud run services describe $SERVICE_NAME --region $REGION --format 'value(status.url)')
echo "🌐 Service URL: $SERVICE_URL"
echo ""
echo "Test endpoints:"
echo "  Health:   curl $SERVICE_URL/health"
echo "  Metadata: curl -X POST $SERVICE_URL/metadata -H 'Content-Type: application/json' -d '{\"url\": \"https://youtube.com/watch?v=dQw4w9WgXcQ\"}'"
echo ""
echo "💡 Next steps:"
echo "1. Test the service: curl $SERVICE_URL/health"
echo "2. Update Supabase Edge Function with this URL"
echo "3. Deploy Supabase function"
echo ""
