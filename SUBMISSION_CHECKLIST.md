# ClaimGPT Submission Checklist

This checklist maps the current repo to the current Apps SDK submission requirements.

## Current repo status

- App archetype: `vanilla-widget`
- Public app name candidate: `ClaimGPT`
- Current MCP path: `/mcp`
- Current review mode: starter / pre-production

## Items now present in the repo

- MCP server entrypoint with public `/mcp` route
- Widget resource using `text/html;profile=mcp-app`
- Explicit CSP keys on the widget resource
- Public privacy page scaffold at `/privacy`
- Public support page scaffold at `/support`
- Basic health metadata at `/`
- Read-only tools with explicit annotations
- Decoupled data tool + render tool structure
- Draft listing copy and review-test assets under `submission/`

## Required before submission

1. Replace every placeholder in `public/privacy.html` and `public/support.html`.
2. Choose and verify the final publication name under your legal entity.
3. Buy or assign a real public domain and set:
   - `CLAIMGPT_PUBLIC_DOMAIN`
   - `CLAIMGPT_PRIVACY_URL`
   - `CLAIMGPT_SUPPORT_URL`
4. Deploy the app to a stable public HTTPS endpoint. Do not submit a tunnel URL.
5. Install dependencies and run:
   - `npm install`
   - `npm run check`
   - `npm run build`
6. Exercise the app in ChatGPT Developer Mode using realistic prompts.
7. Capture submission screenshots showing the real UI, not placeholders.
8. Prepare final support contact details.
9. Verify your OpenAI organization for the publication name you will use.
10. Prepare test prompts and expected results for review.
11. Finalize listing text, screenshots, and release notes from the `submission/` folder.

## Name security steps

The repo cannot reserve the public app name by itself. To reduce the risk of losing the name:

1. Verify the OpenAI organization under the exact publication name you want to use.
2. Acquire the matching public domain if available.
3. Secure matching social/brand handles if you plan to market publicly.
4. Consider trademark counsel if the brand matters materially to the business.
5. Submit the app draft in the OpenAI Platform Dashboard as soon as the production URL and legal pages are ready.

## Final launch order

1. Deploy the app on `https://claim-gpt.com`.
2. Verify `/`, `/privacy`, `/support`, `/status`, and `/healthz`.
3. Replace placeholder legal/support copy.
4. Refresh the app metadata in ChatGPT Developer Mode.
5. Submit the OpenAI app draft.

## Suggested first review prompts

1. `Triage this property damage claim and tell me what documentation is missing.`
2. `Analyze this bodily injury claim narrative and tell me if it needs adjuster escalation.`
3. `Show me the ClaimGPT workspace for this claim and summarize next steps for the adjuster.`
