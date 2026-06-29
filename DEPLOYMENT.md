# ClaimGPT Deployment Guide

This repo is ready for container-based deployment. Render is the default path for a cheap, simple launch.

## Required environment variables

Set these before public deployment:

- `CLAIMGPT_PUBLIC_DOMAIN`
- `CLAIMGPT_SUPPORT_EMAIL`
- `CLAIMGPT_COMPANY_NAME`
- `CLAIMGPT_PRIVACY_URL`
- `CLAIMGPT_SUPPORT_URL`
- `PORT` (defaults to `8787`)

## Render

Repo artifact: [render.yaml](/Users/nicholas/Desktop/ClaimGPT/render.yaml)

Suggested steps:

1. Push this repo to GitHub.
2. Create a new Render Web Service from the repo.
3. Let Render detect [render.yaml](/Users/nicholas/Desktop/ClaimGPT/render.yaml).
4. Set the environment variables listed above.
5. Point your custom domain at the Render service.
6. Confirm:
   - `GET /healthz`
   - `GET /privacy`
   - `GET /support`
   - `POST /mcp`

## Public release checklist

After deployment, do these in order:

1. Put the final legal text in `privacy.html` and `support.html`.
2. Set the real production domain env vars.
3. Validate the live HTTPS routes.
4. Test the app in ChatGPT Developer Mode against the production URL.
5. Capture screenshots from the production deployment.
6. Submit the app in the OpenAI Platform Dashboard.

## Exact `claim-gpt.com` values

Use these values when configuring the live environment:

```bash
CLAIMGPT_PUBLIC_DOMAIN=https://claim-gpt.com
CLAIMGPT_SUPPORT_EMAIL=support@claim-gpt.com
CLAIMGPT_COMPANY_NAME=ClaimGPT
CLAIMGPT_PRIVACY_URL=https://claim-gpt.com/privacy
CLAIMGPT_SUPPORT_URL=https://claim-gpt.com/support
```

Use `https://claim-gpt.com/healthz` for monitoring and `https://claim-gpt.com/status` for machine-readable metadata.

## Name security

The engineering side is now prepared for immediate deployment. The remaining steps that materially secure the name are operational:

1. Register the domain you want to publish under.
2. Use that exact name in OpenAI organization verification.
3. Submit the app draft under that verified name as soon as the production endpoint is live.
