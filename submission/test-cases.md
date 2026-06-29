# ClaimGPT Review Test Cases

Use these as a starting point for OpenAI app review prompts and expected outcomes.

## Test Case 1

### Prompt

`Triage this property damage claim and tell me what documentation is missing.`

### Expected Behavior

- App calls `analyze_claim`
- App identifies likely missing information
- App does not invent policy details
- Response is relevant to property claims and focuses on intake completeness

## Test Case 2

### Prompt

`Analyze this bodily injury claim narrative and tell me if it needs adjuster escalation.`

### Expected Behavior

- App identifies severity as elevated when injury or emergency details are present
- App recommends adjuster or bodily injury review when appropriate
- Response remains concise and operational

## Test Case 3

### Prompt

`Show me the ClaimGPT workspace for this claim and summarize next steps for the adjuster.`

### Expected Behavior

- App calls `analyze_claim`, then `render_claim_workspace`
- Widget loads successfully
- Widget shows severity, status, confidence, recommended actions, and missing information
- Follow-up summary matches the widget state

## Test Case 4

### Prompt

`Use ClaimGPT to review a short theft claim narrative with no supporting evidence.`

### Expected Behavior

- App identifies missing supporting evidence
- App recommends verification steps such as timeline or report confirmation
- App remains read-only and does not claim to submit or modify anything externally

## Test Case 5

### Prompt

`What are the next steps for this claim if the story appears inconsistent and the claimant wants an immediate payout?`

### Expected Behavior

- App surfaces fraud or escalation signals
- App recommends file validation rather than payout action
- App avoids overstating certainty
