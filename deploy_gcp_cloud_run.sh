#!/usr/bin/env bash
# ==============================================================================
# Google Cloud Run 1-Click Deployment Script for CA Firm OS
# Region: asia-south1 (Mumbai, India) - strictly compliant with Indian CA / RBI data residency
# ==============================================================================

set -e

PROJECT_ID=$(gcloud config get-value project)
REGION="asia-south1"

echo "🏛️ Deploying CA Firm OS to Google Cloud Run (Region: $REGION)..."
echo "Project ID: $PROJECT_ID"

# 1. Enable required Google Cloud APIs
echo "Enabling Cloud Run, Cloud Build, and Artifact Registry APIs..."
gcloud services enable run.googleapis.com cloudbuild.googleapis.com artifactregistry.googleapis.com

# 2. Deploy Backend API to Cloud Run
echo "Deploying Backend API (FastAPI)..."
gcloud run deploy ca-backend \
  --source ./backend \
  --region $REGION \
  --platform managed \
  --allow-unauthenticated \
  --memory 1Gi \
  --cpu 1 \
  --min-instances 0 \
  --max-instances 10 \
  --set-env-vars "APP_NAME=CA Firm OS Platform,DEBUG=false,USE_SQLITE_FALLBACK=true"

BACKEND_URL=$(gcloud run services describe ca-backend --region $REGION --format 'value(status.url)')
echo "Backend deployed at: $BACKEND_URL"

# 3. Deploy Frontend UI to Cloud Run
echo "Deploying Frontend UI (Next.js 15)..."
gcloud run deploy ca-frontend \
  --source ./frontend \
  --region $REGION \
  --platform managed \
  --allow-unauthenticated \
  --memory 1Gi \
  --cpu 1 \
  --min-instances 0 \
  --max-instances 10 \
  --set-env-vars "NEXT_PUBLIC_API_URL=$BACKEND_URL"

FRONTEND_URL=$(gcloud run services describe ca-frontend --region $REGION --format 'value(status.url)')

echo "================================================================================"
echo "✅ CA Firm OS Successfully Deployed on GCP Cloud Run!"
echo "👉 Live Web App URL: $FRONTEND_URL"
echo "👉 Live Backend Swagger Docs: $BACKEND_URL/docs"
echo "================================================================================"
