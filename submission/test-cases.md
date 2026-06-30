# ClaimGPT Review Test Cases

Use these as a starting point for OpenAI app review prompts and expected outcomes.

## Test Case 1

### Prompt

`Analyze this casualty claim and tell me the severity score, reserve view, and missing documentation.`

### Expected Behavior

- App calls `analyze_claim`
- App returns executive status including severity, TIP, litigation, and fraud views
- App identifies likely missing information
- App stays read-only and does not invent file mutations or payment authority

## Test Case 2

### Prompt

`Analyze this bodily injury claim narrative, estimate litigation risk, and tell me if it needs escalation.`

### Expected Behavior

- App identifies elevated severity when injury or emergency details are present
- App returns litigation probability and adjuster escalation cues when appropriate
- Response remains operational and read-only

## Test Case 3

### Prompt

`Show me the ClaimGPT OCCIE workspace for this claim and summarize the top 3 next steps for the adjuster.`

### Expected Behavior

- App calls `analyze_claim`, then `render_claim_workspace`
- Widget loads successfully
- Widget shows executive status, impact/liability, medical synthesis, anomalies, and a 3-step action plan
- Follow-up summary matches the widget state

## Test Case 4

### Prompt

`Use ClaimGPT to review a short liability claim narrative with no supporting evidence.`

### Expected Behavior

- App identifies missing supporting evidence
- App recommends verification steps such as timeline or report confirmation
- App remains read-only and does not claim to submit or modify anything externally

## Test Case 5

### Prompt

`What are the next steps for this claim if the story appears inconsistent and the claimant wants an immediate payout?`

### Expected Behavior

- App surfaces fraud or escalation signals
- App recommends validation-focused next steps rather than payout action
- App avoids overstating certainty or authorizing an outcome
