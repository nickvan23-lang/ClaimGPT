# ClaimGPT Submission Checklist

This checklist maps the current repo to the current Apps SDK submission requirements.

## Current repo status

- App archetype: `vanilla-widget`
- Public app name candidate: `ClaimGPT`
- Current MCP path: `/mcp`
- Current review mode: OCCIE casualty-analysis / pre-production

## Items now present in the repo

- MCP server entrypoint with public `/mcp` route
- Widget resource using `text/html;profile=mcp-app`
- Explicit CSP keys on the widget resource
- Public privacy page at `/privacy`
- Public support page at `/support`
- Public enterprise architecture page at `/enterprise`
- Basic health metadata at `/`
- Read-only tools with explicit annotations
- Decoupled data tool + render tool structure
- OCCIE-style executive status, medical synthesis, anomaly detection, and adjuster action planning
- ECO-AI orchestration branch describing MCP tools, workflow stages, and human-in-the-loop guardrails
- Draft listing copy and review-test assets under `submission/`
- Render deployment configured and live on the Render subdomain
- Production DNS records added for `claim-gpt.com`

## Required before submission

1. Choose and verify the final publication name under your legal entity.
2. Confirm the custom domain is fully live and serving the production app:
   - `https://claim-gpt.com/`
   - `https://claim-gpt.com/privacy`
   - `https://claim-gpt.com/support`
   - `https://claim-gpt.com/status`
   - `https://claim-gpt.com/healthz`
   - `https://claim-gpt.com/mcp`
3. Install dependencies and run:
   - `npm install`
   - `npm run check`
   - `npm run build`
4. Exercise the app in ChatGPT Developer Mode using realistic prompts.
5. Capture submission screenshots showing the real UI on the production deployment.
6. Verify your OpenAI organization for the publication name you will use.
7. Finalize listing text, screenshots, and release notes from the `submission/` folder.
8. Confirm whether `support@claim-gpt.com` should receive real email before public launch.

## Name security steps

The repo cannot reserve the public app name by itself. To reduce the risk of losing the name:

1. Verify the OpenAI organization under the exact publication name you want to use.
2. Acquire the matching public domain if available.
3. Secure matching social/brand handles if you plan to market publicly.
4. Consider trademark counsel if the brand matters materially to the business.
5. Submit the app draft in the OpenAI Platform Dashboard as soon as the production URL and legal pages are ready.

## Final launch order

1. Wait for `claim-gpt.com` and `www.claim-gpt.com` to finish resolving and verifying in Render.
2. Verify `/`, `/privacy`, `/support`, `/status`, `/healthz`, and `/mcp` on the custom domain.
3. Refresh the app metadata in ChatGPT Developer Mode.
4. Capture final screenshots from the production domain.
5. Submit the OpenAI app draft.

## Suggested first review prompts

1. `Analyze this casualty claim and tell me the severity score, reserve view, and missing documentation.`
2. `Analyze this bodily injury claim narrative, estimate litigation risk, and tell me if it needs escalation.`
3. `Show me the ClaimGPT OCCIE workspace for this claim and summarize the top 3 next steps for the adjuster.`
