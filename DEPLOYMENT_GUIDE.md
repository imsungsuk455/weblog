# Cloudflare Pages Deployment Guide

Follow these steps to deploy your Astro blog to Cloudflare Pages.

## 1. Connect to Cloudflare Pages

1.  Log in to your [Cloudflare Dashboard](https://dash.cloudflare.com/).
2.  Navigate to **Workers & Pages** > **Create application** > **Pages** > **Connect to Git**.
3.  Select your GitHub repository and click **Begin setup**.
4.  **Project Settings**:
    *   **Framework preset**: `Astro`
    *   **Build command**: `pnpm run build` (or `npm run build`)
    *   **Build output directory**: `dist`

## 2. Generate Content Manually

Since automatic generation is disabled, you can generate content locally using the provided shortcuts:

1.  **AI Dashboard**: Run `start-dashboard.bat`.
    *   Browse to `http://localhost:3001` to generate, edit, and save posts.
2.  **Simple Batch**: Run `generate-content.bat`.
    *   Type your topic and let Gemini 3 Flash do the work.

## 3. Publish Changes

After generating a post:
1.  Check the new file in `src/data/blog/`.
2.  `git add .`
3.  `git commit -m "Add new blog post about [Topic]"`
4.  `git push origin main`

Cloudflare Pages will automatically detect the push and redeploy your site.

## 4. Troubleshooting

*   **API Key Error**: Ensure your `.env` file contains `GEMINI_API_KEY=YOUR_KEY`.
*   **Build Failures**: Check the Cloudflare Pages build logs. Ensure all dependencies are correctly listed in `package.json`.
