# Deployment Instructions

## Backend Deployment (Vercel)

1. **Set up Vercel KV (Redis)**:
   - Go to your Vercel dashboard
   - Navigate to your project → Storage → Create Database
   - Select KV (Redis) and create it
   - Copy the KV_REST_API_URL and KV_REST_API_TOKEN

2. **Deploy the backend to Vercel**:
   - Create a new project in Vercel
   - Connect to the `backend` directory
   - Add environment variables in project settings:
     - `KV_REST_API_URL`: Your KV REST API URL
     - `KV_REST_API_TOKEN`: Your KV REST API token
   - Deploy

3. After deployment, note your backend URL (e.g., `https://autoanalytix-backend.vercel.app`)

## Frontend Deployment (Vercel)

1. Configure the backend URL:
   - Copy `.env.example` to `.env`
   - Set `VITE_API_URL` to your backend URL:
     ```
     VITE_API_URL=https://your-backend-url.vercel.app
     ```

2. Deploy the frontend to Vercel:
   - Create a new project in Vercel
   - Connect to the `frontend` directory
   - Set **Root Directory** to `frontend` in project settings
   - Add the `.env` variable in Vercel project settings:
     - Go to Settings → Environment Variables
     - Add `VITE_API_URL` with your backend URL

3. Deploy

## Local Development

For local development, the backend uses in-memory storage (no KV needed). The frontend uses a proxy (configured in `vite.config.js`) to route API requests to the backend running on `http://127.0.0.1:8000`.

No environment variables needed for local development.
