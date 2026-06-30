# ClaimGPT

ClaimGPT is a ChatGPT app for OCCIE-style casualty claims intelligence with an enterprise ECO-AI orchestration branch. It uses a docs-aligned MCP server plus a widget that renders structured claim analysis inside ChatGPT.

This repo now includes the baseline public-launch artifacts required to prepare for submission:

- public privacy page
- public support page
- environment-driven app domain metadata
- Dockerized production runtime
- Render deployment manifest
- submission checklist for OpenAI review

## Archetype

`vanilla-widget`

This app uses a small Node MCP server and one HTML widget. It keeps the architecture simple while following the current Apps SDK pattern:

- `analyze_claim` generates the OCCIE-style casualty analysis and enterprise orchestration blueprint.
- `render_claim_workspace` renders the adjuster-facing workspace.

## Local run

1. Install dependencies:

```bash
npm install
```

2. Start the MCP server:

```bash
npm run dev
```

3. The server listens at:

```text
http://localhost:8787/mcp
```

## ChatGPT developer mode

1. Expose the local server with HTTPS, for example:

```bash
ngrok http 8787
```

2. In ChatGPT, enable Developer Mode under `Settings -> Apps & Connectors -> Advanced settings`.
3. Create a new app using the tunneled URL plus `/mcp`.
4. Refresh the app after changing tool metadata or widget content.

## Production configuration

Before public deployment, copy `.env.example` into your deployment environment and set real values for:

- `CLAIMGPT_PUBLIC_DOMAIN`
- `CLAIMGPT_SUPPORT_EMAIL`
- `CLAIMGPT_PRIVACY_URL`
- `CLAIMGPT_SUPPORT_URL`

The widget resource metadata will use `CLAIMGPT_PUBLIC_DOMAIN` for `_meta.ui.domain`, which is required for app submission.

If you are using the deployment manifests, keep the hostname exact. The app submission snapshot is tied to the live production URL you configure.

## Production run

The production entrypoint now uses the built server:

```bash
npm run build
npm run start
```

Health routes:

- `GET /` for app metadata
- `GET /healthz` for a simple health probe
- `GET /privacy`
- `GET /support`
- `GET /enterprise`
- `GET|POST|DELETE /mcp`

## Container deployment

This repo includes a [Dockerfile](/Users/nicholas/Desktop/ClaimGPT/Dockerfile) and a [Render config](/Users/nicholas/Desktop/ClaimGPT/render.yaml) for a low-friction launch path on Render.

Build and run locally:

```bash
docker build -t claimgpt .
docker run --rm -p 8787:8787 --env-file .env claimgpt
```

For public release, prefer a stable HTTPS host with logs and metrics rather than a tunnel URL.

Platform-specific deployment notes live in [DEPLOYMENT.md](/Users/nicholas/Desktop/ClaimGPT/DEPLOYMENT.md). The repo now treats Render as the default host.

## Submission assets

Draft app-store/review assets live under [submission/](/Users/nicholas/Desktop/ClaimGPT/submission):

- [listing-copy.md](/Users/nicholas/Desktop/ClaimGPT/submission/listing-copy.md)
- [test-cases.md](/Users/nicholas/Desktop/ClaimGPT/submission/test-cases.md)
- [release-notes-draft.md](/Users/nicholas/Desktop/ClaimGPT/submission/release-notes-draft.md)
- [screenshots-checklist.md](/Users/nicholas/Desktop/ClaimGPT/submission/screenshots-checklist.md)

## Public web assets

The landing page now includes basic public-domain assets for branding and previews:

- [public/favicon.svg](/Users/nicholas/Desktop/ClaimGPT/public/favicon.svg)
- [public/og-card.svg](/Users/nicholas/Desktop/ClaimGPT/public/og-card.svg)
- [public/site.webmanifest](/Users/nicholas/Desktop/ClaimGPT/public/site.webmanifest)
- [public/robots.txt](/Users/nicholas/Desktop/ClaimGPT/public/robots.txt)
- [public/security.txt](/Users/nicholas/Desktop/ClaimGPT/public/security.txt)
- [public/sitemap.xml](/Users/nicholas/Desktop/ClaimGPT/public/sitemap.xml)

## Public review prep

See [SUBMISSION_CHECKLIST.md](/Users/nicholas/Desktop/ClaimGPT/SUBMISSION_CHECKLIST.md) for the release audit and the remaining non-code steps to secure the name and submit the app.

## Next Steps

1. Wait for `claim-gpt.com` to finish verifying against the live host.
2. Verify the app in ChatGPT Developer Mode against the public URL.
3. Capture final submission screenshots from the production deployment.
4. Submit the app draft in the OpenAI Platform Dashboard.

## Project structure

```text
ClaimGPT/
├─ .env.example
├─ .dockerignore
├─ .gitignore
├─ DEPLOYMENT.md
├─ Dockerfile
├─ SUBMISSION_CHECKLIST.md
├─ package.json
├─ render.yaml
├─ tsconfig.json
├─ public/
│  ├─ privacy.html
│  ├─ support.html
│  └─ widget.html
└─ src/
   └─ server.ts
```

## Current analysis model

The current implementation is read-only and heuristic. It now returns:

- executive status with severity, TIP, litigation probability, and fraud risk
- impact and liability analysis
- medical synthesis with chronology and inline citations to supplied source items
- enterprise orchestration guidance with MCP tools, workflow stages, guardrails, and integration architecture
- anomalies and red flags
- a 3-step adjuster action plan

## Next useful extensions

- Replace the heuristic analysis in `src/server.ts` with a real claims workflow or model-backed service.
- Add secure claimant/document lookup tools and real PDF/page extraction.
- Split the widget into a React frontend if the workspace needs richer interactions.
- Add telemetry, error reporting, and a real deployment target such as Vercel, Fly.io, or Cloud Run.
