# 🏛️ Deploying CA Firm OS to Google Cloud Run

This guide explains how to deploy the entire **CA Firm OS** platform (**FastAPI Backend + Next.js 15 Frontend + PostgreSQL**) to **Google Cloud Run** in the **Mumbai, India (`asia-south1`)** region to ensure strict data residency under **ICAI SQC 1** and RBI compliance guidelines.

---

## ⚡ Method 1: 1-Click Deployment via Google Cloud Shell (Easiest)

Google Cloud Shell runs directly in your browser with `gcloud` and `docker` pre-installed and authenticated with zero local setup required.

### Step 1: Open Google Cloud Shell
1. Open your browser and go to:  
   👉 **[https://shell.cloud.google.com](https://shell.cloud.google.com)**
2. Select or create your GCP Project.

### Step 2: Clone & Deploy
In the Cloud Shell terminal, run:

```bash
# 1. Clone the repository
git clone https://github.com/Mjsharma1234/ca-agentic-platform.git
cd ca-agentic-platform

# 2. Make deployment script executable and run
chmod +x deploy_gcp_cloud_run.sh
./deploy_gcp_cloud_run.sh
```

The script will:
- Enable Cloud Run, Cloud Build, and Artifact Registry.
- Build and containerize the **FastAPI Backend** and deploy to Cloud Run (`asia-south1`).
- Build and containerize the **Next.js 15 Frontend** and deploy to Cloud Run (`asia-south1`).
- Output the live public HTTPS URLs for both frontend and backend.

---

## 🌐 Method 2: Continuous Deployment directly from GitHub (Console UI)

If you prefer connecting Google Cloud directly to GitHub so every `git push` automatically redeploys:

### 1. Deploy the Backend (`ca-backend`)
1. Go to [Google Cloud Run Console](https://console.cloud.google.com/run).
2. Click **Create Service**.
3. Choose **Continuously deploy from a repository** &rarr; click **Set up with Cloud Build**.
4. Select GitHub and choose repository: `Mjsharma1234/ca-agentic-platform`.
5. Branch: `^master$`.
6. Build Type: **Dockerfile**.
7. Source location: `/backend/Dockerfile`.
8. Service Name: `ca-backend`.
9. Region: **`asia-south1` (Mumbai)**.
10. Authentication: **Allow unauthenticated invocations**.
11. Container Port: `8080`.
12. Click **Create**. Note down the assigned URL (e.g. `https://ca-backend-xxxx-el.a.run.app`).

### 2. Deploy the Frontend (`ca-frontend`)
1. In Cloud Run Console, click **Create Service**.
2. Select **Continuously deploy from a repository**.
3. Source location: `/frontend/Dockerfile`.
4. Service Name: `ca-frontend`.
5. Region: **`asia-south1` (Mumbai)**.
6. Under **Variables & Secrets**, add:
   * `NEXT_PUBLIC_API_URL`: *(paste the backend URL from Step 1, e.g. `https://ca-backend-xxxx-el.a.run.app`)*
7. Click **Create**.

---

## 🗄️ Database Options on GCP

### Development / Low-Volume Testing (Built-in)
By default, the backend runs in self-contained SQLite mode (`USE_SQLITE_FALLBACK=true`), storing data in persistent Cloud Run volumes or container disk.

### Production Enterprise Deployment (Cloud SQL for PostgreSQL)
For high-throughput multi-partner CA firms:
1. Create a **Cloud SQL for PostgreSQL** instance in `asia-south1` (Mumbai).
   ```bash
   gcloud sql instances create ca-firm-db --database-version=POSTGRES_16 --tier=db-f1-micro --region=asia-south1
   gcloud sql databases create ca_platform --instance=ca-firm-db
   ```
2. Connect Cloud Run to Cloud SQL:
   ```bash
   gcloud run services update ca-backend \
     --add-cloudsql-instances YOUR_PROJECT_ID:asia-south1:ca-firm-db \
     --set-env-vars "DATABASE_URL=postgresql://ca_user:password@/ca_platform?host=/cloudsql/YOUR_PROJECT_ID:asia-south1:ca-firm-db"
   ```

---

## 🔒 Custom Domain Mapping (e.g., `app.yourfirm.com`)
1. In the Cloud Run Console, go to **Manage Custom Domains**.
2. Click **Add Mapping** &rarr; Select service `ca-frontend`.
3. Enter your domain (e.g. `portal.nallamalaco.com`).
4. Add the provided DNS CNAME records at your domain registrar (GoDaddy, Namecheap, Cloudflare). Google Cloud automatically provisions a free SSL certificate.
