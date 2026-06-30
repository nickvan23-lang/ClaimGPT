import { createServer } from "node:http";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import {
  registerAppResource,
  registerAppTool,
  RESOURCE_MIME_TYPE,
} from "@modelcontextprotocol/ext-apps/server";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { z } from "zod";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT_DIR = path.resolve(__dirname, "..");
const PUBLIC_DIR = path.join(ROOT_DIR, "public");
const WIDGET_URI = "ui://widget/eco-ai-adjuster-workspace-v1.html";
const WIDGET_HTML = readFileSync(path.join(PUBLIC_DIR, "widget.html"), "utf8");
const LANDING_HTML = readFileSync(path.join(PUBLIC_DIR, "index.html"), "utf8");

const APP_DOMAIN = process.env.CLAIMGPT_PUBLIC_DOMAIN ?? "https://claim-gpt.com";
const SUPPORT_EMAIL = process.env.CLAIMGPT_SUPPORT_EMAIL ?? "support@claim-gpt.com";
const SUPPORT_URL = process.env.CLAIMGPT_SUPPORT_URL ?? `${APP_DOMAIN}/support`;
const PRIVACY_URL = process.env.CLAIMGPT_PRIVACY_URL ?? `${APP_DOMAIN}/privacy`;
const OPENAI_APPS_CHALLENGE_TOKEN =
  process.env.OPENAI_APPS_CHALLENGE_TOKEN ?? "0K_llmmXaQhaRNLdZhB7915noSoUoNn6GhMk9zqa6eA";

const SITEMAP_XML = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
  <url><loc>${APP_DOMAIN}/</loc></url>
  <url><loc>${APP_DOMAIN}/privacy</loc></url>
  <url><loc>${APP_DOMAIN}/support</loc></url>
</urlset>`;
const ROBOTS_TXT = `User-agent: *\nAllow: /\nSitemap: ${APP_DOMAIN}/sitemap.xml\n`;
const SECURITY_TXT = `Contact: ${SUPPORT_EMAIL}\nPreferred-Languages: en\nCanonical: ${APP_DOMAIN}/\nPolicy: ${PRIVACY_URL}\n`;
const STATIC_PUBLIC_FILES = new Map<string, { fileName: string; contentType: string }>([
  ["/favicon.svg", { fileName: "favicon.svg", contentType: "image/svg+xml; charset=utf-8" }],
  ["/og-card.svg", { fileName: "og-card.svg", contentType: "image/svg+xml; charset=utf-8" }],
  ["/site.webmanifest", { fileName: "site.webmanifest", contentType: "application/manifest+json; charset=utf-8" }],
]);

// ── ECO-AI Master System Prompt ───────────────────────────────────────────
const ECO_AI_INSTRUCTIONS = `
You are ECO-AI (Enterprise Claims Orchestration AI), an advanced agentic co-pilot for licensed Property & Casualty (P&C) and Life & Health insurance adjusters. You are deployed at claim-gpt.com and operate inside ChatGPT via the Model Context Protocol (MCP).

PRIMARY DIRECTIVE
Accelerate the claims lifecycle by automating data extraction, synthesizing complex documents, interpreting policy language, and executing structured API interactions. You serve as a strictly compliant analytical assistant — you NEVER make final binding decisions on approvals, denials, liability, or coverage.

IMMUTABLE COMPLIANCE GUARDRAILS
1. Traceability: Every factual claim, policy interpretation, or financial extraction MUST cite its source (e.g., "[Source: Police Report, pg. 2]").
2. HITL Mandate: You never unilaterally approve, deny, or settle a claim. Always append "ADJUSTER REVIEW AND AUTHORIZATION REQUIRED" to any action that carries legal or financial consequence.
3. No Unilateral Denials: If coverage appears excluded, output: "RECOMMENDATION FOR REVIEW: Potential exclusion identified under Section [X]. Final determination requires licensed adjuster review."
4. NAIC Compliance: Evaluate claims based solely on documented evidence and policy text. Never reference demographic data in triage or adjudication reasoning.
5. Data Privacy (HIPAA/GLBA): Do not unnecessarily repeat PII or PHI. Reference claimants by claim ID where possible.
6. Idempotency: Before calling update_claim_status, verify current claim state. If a prerequisite is missing (e.g., reserve must be set before payment), sequence the prerequisite actions first.

AVAILABLE MCP TOOLS — invoke autonomously when the adjuster's request requires external data or system action:
- query_policy_system(policyNumber, claimId?): Retrieves live policy data, coverages, limits, deductibles, and endorsements.
- extract_document_data(documentType, content, schemaType, claimId?): Sends document to multimodal parsing engine; returns validated structured JSON.
- run_fraud_analytics(claimId, claimType, narrative?): Returns anomaly risk score and SIU referral indicators.
- update_claim_status(claimId, status, reserveAmount?, notes?, authorizedBy?): Updates claim workflow status and financial reserve. Requires adjuster authorization.
- draft_communication(intent, recipient, contextData): Generates legally compliant email or letter draft for adjuster review. Never transmit without adjuster sign-off.
- run_fnol_triage(claimId, policyNumber, claimType, narrative, evidenceCount?): Full Stage 1 orchestration — policy verification, fraud scoring, routing decision, triage summary. Call this first for any new claim.
- render_adjuster_workspace(workspaceData): Renders the ECO-AI enterprise adjuster workspace widget. Always call after run_fnol_triage or after gathering sufficient claim data.

WORKFLOW EXECUTION PROTOCOLS
Stage 1 — FNOL & Triage: Call run_fnol_triage → render_adjuster_workspace. Tag FAST_TRACK or COMPLEX_ADJUDICATION.
Stage 2 — Investigation: Call extract_document_data for each uploaded document. Cross-reference against FNOL narrative for inconsistencies.
Stage 3 — Policy Analysis: Call query_policy_system. Structure response as: Evidence / Policy Clause / Analysis / Conclusion.
Stage 4 — Settlement: Aggregate verified damages. Call draft_communication. Remind adjuster to authorize update_claim_status.

RESPONSE FORMAT
- Use Markdown headers and tables for all structured data.
- Use definitive phrasing: "The data indicates..." not "I think..." or "It looks like..."
- Never use colloquialisms, filler text, or speculative language.
- Always remind adjuster that state-changing operations require their explicit authorization.

Support: ${SUPPORT_URL} | ${SUPPORT_EMAIL}
`.trim();

// ── Enums ─────────────────────────────────────────────────────────────────
const routingEnum = z.enum(["FAST_TRACK", "COMPLEX_ADJUDICATION"]);
const severityEnum = z.enum(["low", "moderate", "high", "critical"]);
const riskBandEnum = z.enum(["low", "moderate", "high", "critical"]);
const policyStatusEnum = z.enum(["active", "lapsed", "cancelled", "suspended"]);
const claimStatusEnum = z.enum(["new", "fnol", "investigation", "evaluation", "settlement", "closed", "denied", "litigated"]);
const documentTypeEnum = z.enum(["medical_record", "repair_estimate", "police_report", "invoice", "correspondence", "proof_of_loss", "photo_evidence"]);
const schemaTypeEnum = z.enum(["medical", "property", "auto", "liability", "general"]);
const communicationIntentEnum = z.enum(["settlement_offer", "request_for_information", "denial_recommendation", "acknowledgment", "status_update", "reservation_of_rights"]);

// ── Zod Schemas ───────────────────────────────────────────────────────────
const coverageSchema = z.object({
  type: z.string(),
  limit: z.number(),
  deductible: z.number(),
  applicable: z.boolean(),
  sublimit: z.number().optional(),
});

const policyDataSchema = z.object({
  policyNumber: z.string(),
  status: policyStatusEnum,
  holderName: z.string(),
  holderAddress: z.string(),
  effectiveDate: z.string(),
  expirationDate: z.string(),
  carrier: z.string(),
  agent: z.string(),
  coverages: z.array(coverageSchema),
  endorsements: z.array(z.string()),
  exclusions: z.array(z.string()),
  priorClaimsCount: z.number(),
  lenderInterest: z.string().optional(),
});

const documentExtractionSchema = z.object({
  documentType: z.string(),
  schemaType: z.string(),
  extractedFields: z.record(z.union([z.string(), z.number(), z.boolean()])),
  lineItems: z.array(z.object({ description: z.string(), amount: z.number(), quantity: z.number().optional() })).optional(),
  totalAmount: z.number().optional(),
  dateOfLoss: z.string().optional(),
  parties: z.array(z.string()).optional(),
  confidence: z.number(),
  flags: z.array(z.string()),
  summary: z.string(),
});

const anomalySchema = z.object({
  signal: z.string(),
  severity: z.enum(["low", "moderate", "high"]),
  detail: z.string(),
});

const fraudAnalyticsSchema = z.object({
  claimId: z.string(),
  riskScore: z.number(),
  riskBand: riskBandEnum,
  anomalies: z.array(anomalySchema),
  dataInconsistencies: z.array(z.string()),
  priorClaimsCount: z.number(),
  networkLinks: z.array(z.string()),
  recommendation: z.string(),
  confidence: z.number(),
});

const claimUpdateSchema = z.object({
  claimId: z.string(),
  previousStatus: z.string(),
  newStatus: z.string(),
  reserveAmount: z.number().optional(),
  updatedAt: z.string(),
  auditEntry: z.string(),
  requiresManagerApproval: z.boolean(),
  nextRequiredAction: z.string(),
});

const communicationSchema = z.object({
  intent: z.string(),
  recipient: z.string(),
  subject: z.string(),
  body: z.string(),
  tone: z.enum(["formal", "empathetic", "neutral"]),
  legalDisclaimer: z.string(),
  requiresAdjusterAuthorization: z.boolean(),
  draftId: z.string(),
});

const timelineEventSchema = z.object({
  date: z.string(),
  event: z.string(),
  source: z.string(),
  significance: z.enum(["low", "moderate", "high"]),
});

const missingDocSchema = z.object({
  name: z.string(),
  required: z.boolean(),
  description: z.string(),
  requestedFrom: z.string(),
});

const fnolTriageSchema = z.object({
  claimId: z.string(),
  policyNumber: z.string(),
  claimType: z.string(),
  dateOfLoss: z.string().optional(),
  routing: routingEnum,
  severity: severityEnum,
  policyStatus: policyStatusEnum,
  policyVerified: z.boolean(),
  fraudRiskScore: z.number(),
  fraudRiskBand: riskBandEnum,
  missingDocuments: z.array(missingDocSchema),
  recommendedActions: z.array(z.string()),
  timeline: z.array(timelineEventSchema),
  summary: z.string(),
  suggestedReserve: z.number(),
  estimatedCycleTime: z.string(),
});

const workspaceInputSchema = {
  claimId: z.string(),
  policyNumber: z.string(),
  holderName: z.string(),
  claimType: z.string(),
  dateOfLoss: z.string().optional(),
  routing: routingEnum,
  severity: severityEnum,
  currentStatus: claimStatusEnum,
  summary: z.string(),
  incidentDescription: z.string().optional(),
  timeline: z.array(timelineEventSchema).optional(),
  recommendedActions: z.array(z.string()),
  estimatedCycleTime: z.string().optional(),
  policyStatus: policyStatusEnum,
  carrier: z.string().optional(),
  effectiveDate: z.string().optional(),
  expirationDate: z.string().optional(),
  coverages: z.array(coverageSchema).optional(),
  endorsements: z.array(z.string()).optional(),
  exclusions: z.array(z.string()).optional(),
  fraudRiskScore: z.number(),
  fraudRiskBand: riskBandEnum,
  fraudAnomalies: z.array(anomalySchema).optional(),
  dataInconsistencies: z.array(z.string()).optional(),
  priorClaimsCount: z.number().optional(),
  suggestedReserve: z.number(),
  deductibleAmount: z.number().optional(),
  netRecommendedPayout: z.number().optional(),
  missingDocuments: z.array(missingDocSchema),
  draftCommunicationSubject: z.string().optional(),
  draftCommunicationBody: z.string().optional(),
  lastUpdated: z.string().optional(),
};

// ── Mock Data Generators ──────────────────────────────────────────────────
function hashCode(str: string): number {
  let h = 0;
  for (let i = 0; i < str.length; i++) h = (Math.imul(31, h) + str.charCodeAt(i)) | 0;
  return Math.abs(h);
}

function pick<T>(arr: T[], seed: number): T { return arr[seed % arr.length]; }

function mockPolicyData(policyNumber: string): z.infer<typeof policyDataSchema> {
  const h = hashCode(policyNumber);
  const statuses: Array<z.infer<typeof policyStatusEnum>> = ["active", "active", "active", "active", "lapsed"];
  return {
    policyNumber,
    status: pick(statuses, h),
    holderName: pick(["Sarah Williams", "Michael Chen", "James Rodriguez", "Patricia O'Brien", "David Kim"], h),
    holderAddress: pick([
      "1847 Oak Street, Austin TX 78701",
      "3922 Elm Drive, Denver CO 80203",
      "512 Maple Avenue, Nashville TN 37201",
      "7841 Pine Road, Phoenix AZ 85001",
      "2231 Cedar Lane, Portland OR 97201",
    ], h + 1),
    effectiveDate: "2025-01-01",
    expirationDate: "2026-12-31",
    carrier: pick(["Nationwide Mutual", "Travelers Property Casualty", "Hartford Fire Insurance", "Liberty Mutual Insurance", "State Farm General"], h + 2),
    agent: pick(["Meridian Insurance Group", "Apex Coverage Partners", "BlueStar Agency LLC", "Central Risk Advisors", "Summit Insurance Solutions"], h + 3),
    priorClaimsCount: h % 4,
    lenderInterest: h % 3 === 0 ? "Wells Fargo Bank N.A." : undefined,
    coverages: [
      { type: "Dwelling (Coverage A)", limit: 350000 + (h % 10) * 25000, deductible: 1000 + (h % 5) * 500, applicable: true },
      { type: "Personal Property (Coverage C)", limit: 125000 + (h % 5) * 10000, deductible: 1000, applicable: true },
      { type: "Loss of Use (Coverage D)", limit: 70000, deductible: 0, applicable: h % 3 !== 0 },
      { type: "Personal Liability (Coverage E)", limit: 300000, deductible: 0, applicable: false },
      { type: "Medical Payments (Coverage F)", limit: 5000, deductible: 0, applicable: false },
    ],
    endorsements: [
      "HO 04 61 – Scheduled Personal Property",
      h % 2 === 0 ? "HO 05 48 – Water Backup and Sump Overflow" : "HO 17 32 – Fungi, Wet or Dry Rot, or Bacteria",
    ],
    exclusions: [
      "Flood damage (NFIP coverage required separately)",
      "Earth movement",
      "Intentional loss",
      "Power failure originating off-premises",
    ],
  };
}

function mockFraudAnalytics(claimId: string, seed: string): z.infer<typeof fraudAnalyticsSchema> {
  const h = hashCode(claimId + seed);
  const score = 18 + (h % 65);
  const band: z.infer<typeof riskBandEnum> = score >= 70 ? "high" : score >= 44 ? "moderate" : "low";
  const pool: Array<z.infer<typeof anomalySchema>> = [
    { signal: "Late Reporting Delay", severity: "moderate", detail: `Claim reported ${9 + (h % 12)} days after stated date of loss. Standard window is 24–72 hours.` },
    { signal: "Prior Claims Velocity", severity: "low", detail: `Claimant has filed ${1 + (h % 3)} prior claim(s) in the past 36 months.` },
    { signal: "Repair Estimate Outlier", severity: "moderate", detail: "Submitted estimate is 34% above regional median for comparable damage scope [Source: Regional Cost Index, Q2 2026]." },
    { signal: "Narrative Inconsistency", severity: "high", detail: "FNOL narrative describes front-end impact; police report references rear-end collision [Source: Police Report, pg. 2]." },
    { signal: "Unregistered Contractor", severity: "low", detail: "Repair vendor not in carrier preferred network and has no prior claim file history." },
    { signal: "Coverage Limit Recently Increased", severity: "moderate", detail: "Dwelling limits increased 43 days before reported date of loss." },
  ];
  const count = score >= 65 ? 3 : score >= 40 ? 2 : 1;
  return {
    claimId,
    riskScore: score,
    riskBand: band,
    anomalies: pool.slice(h % 3, (h % 3) + count),
    dataInconsistencies: count >= 2 ? ["Reported date of loss in FNOL does not match police report event timestamp by 72 hours."] : [],
    priorClaimsCount: h % 4,
    networkLinks: [],
    recommendation: band === "high"
      ? "Refer to Special Investigations Unit (SIU) before proceeding. Do not issue payment until SIU clearance."
      : band === "moderate"
        ? "Conduct enhanced documentation review. Verify estimate with preferred network vendor."
        : "Standard triage protocols apply. No SIU referral required at this time.",
    confidence: Number((0.76 + (h % 16) / 100).toFixed(2)),
  };
}

function mockFnolTriage(
  claimId: string, policyNumber: string, claimType: string, narrative: string, evidenceCount: number
): z.infer<typeof fnolTriageSchema> {
  const policy = mockPolicyData(policyNumber);
  const fraud = mockFraudAnalytics(claimId, claimType + narrative.slice(0, 40));
  const h = hashCode(claimId);
  const text = narrative.toLowerCase();
  const highSeverity = text.includes("total") || text.includes("fire") || text.includes("injur") || text.includes("hospital");
  const routing: z.infer<typeof routingEnum> =
    fraud.riskBand === "high" || highSeverity ? "COMPLEX_ADJUDICATION"
      : evidenceCount >= 3 && fraud.riskBand === "low" ? "FAST_TRACK"
        : "COMPLEX_ADJUDICATION";
  const severity: z.infer<typeof severityEnum> = highSeverity ? "high" : fraud.riskBand === "high" ? "high" : "moderate";
  const reserve = highSeverity ? 45000 + (h % 30) * 1000 : 15000 + (h % 20) * 500;
  const deductible = policy.coverages[0]?.deductible ?? 1000;
  const missing: Array<z.infer<typeof missingDocSchema>> = [
    evidenceCount === 0 ? { name: "Photographic Evidence", required: true, description: "Photographs of all damaged areas", requestedFrom: "Policyholder" } : null,
    { name: "Signed Proof of Loss", required: true, description: "Sworn statement of loss per policy conditions", requestedFrom: "Policyholder" },
    { name: "Contractor Repair Estimate", required: true, description: "Detailed line-item estimate from licensed contractor", requestedFrom: "Policyholder" },
    text.includes("water") || text.includes("leak") ? { name: "Plumber's Cause-of-Loss Report", required: false, description: "Cause determination from licensed plumber", requestedFrom: "Policyholder" } : null,
    text.includes("injur") ? { name: "HIPAA Authorization Form", required: true, description: "Signed medical release for bodily injury records", requestedFrom: "Claimant" } : null,
  ].filter(Boolean) as Array<z.infer<typeof missingDocSchema>>;

  const today = new Date();
  const fmt = (d: Date) => d.toISOString().split("T")[0];
  return {
    claimId, policyNumber, claimType, routing, severity,
    policyStatus: policy.status,
    policyVerified: policy.status === "active",
    fraudRiskScore: fraud.riskScore,
    fraudRiskBand: fraud.riskBand,
    missingDocuments: missing,
    recommendedActions: [
      `Policy ${policyNumber} status confirmed: ${policy.status.toUpperCase()}. Applicable deductible: $${deductible.toLocaleString()}.`,
      fraud.riskBand === "high"
        ? "Refer to SIU immediately. Do not advance claim or issue payment until SIU clearance obtained."
        : `Request ${missing.length} outstanding document(s) per checklist. 21-day collection window applies.`,
      routing === "FAST_TRACK"
        ? "Eligible for straight-through processing (STP). Set initial reserve and assign automation workflow."
        : "Assign to licensed adjuster for complex adjudication. Schedule field inspection within 5 business days.",
      `Set initial reserve at $${reserve.toLocaleString()} pending scope-of-loss determination. ADJUSTER AUTHORIZATION REQUIRED.`,
    ],
    timeline: [
      { date: fmt(new Date(today.getTime() - 15 * 86400000)), event: "Date of loss — policyholder report", source: "FNOL Submission", significance: "high" },
      { date: fmt(new Date(today.getTime() - 8 * 86400000)), event: `Claim ${claimId} opened in claims management system`, source: "System", significance: "moderate" },
      { date: fmt(today), event: "ECO-AI FNOL triage complete — routing decision issued", source: "ECO-AI", significance: "high" },
    ],
    summary: `${claimType} claim on policy ${policyNumber} triaged. Policy: ${policy.status.toUpperCase()}. Fraud risk: ${fraud.riskBand.toUpperCase()} (${fraud.riskScore}/100). Routing: ${routing.replace("_", " ")}. ${missing.length} document(s) outstanding.`,
    suggestedReserve: reserve,
    estimatedCycleTime: routing === "FAST_TRACK" ? "3–7 business days" : "14–28 business days",
  };
}

function mockCommunication(
  intent: z.infer<typeof communicationIntentEnum>,
  recipient: string,
  ctx: Record<string, unknown>
): z.infer<typeof communicationSchema> {
  const claimId = String(ctx.claimId ?? "CLM-UNKNOWN");
  const claimType = String(ctx.claimType ?? "your claim");
  const draftId = "DRAFT-" + Date.now().toString(36).toUpperCase();
  const templates: Record<z.infer<typeof communicationIntentEnum>, { subject: string; body: string; tone: "formal" | "empathetic" | "neutral" }> = {
    acknowledgment: {
      subject: `Claim Acknowledgment — ${claimId}`,
      tone: "empathetic",
      body: `Dear ${recipient},\n\nThank you for notifying us of your ${claimType}. Your claim has been assigned reference number ${claimId} and is currently under review.\n\nAn adjuster will contact you within 3 business days to discuss next steps and any additional documentation we may require.\n\nWe understand this may be a difficult time, and we are committed to processing your claim fairly and promptly.\n\nSincerely,\nClaims Department`,
    },
    request_for_information: {
      subject: `Action Required: Additional Documentation — ${claimId}`,
      tone: "neutral",
      body: `Dear ${recipient},\n\nTo continue processing your claim (${claimId}), we require the following additional documentation:\n\n[SEE ECO-AI MISSING DOCUMENTS CHECKLIST FOR SPECIFIC ITEMS]\n\nPlease provide these materials within 21 calendar days. Documents may be submitted via the customer portal, secure email, or postal mail.\n\nIf you have questions, please contact your assigned adjuster.\n\nSincerely,\nClaims Department`,
    },
    settlement_offer: {
      subject: `Settlement Offer — ${claimId}`,
      tone: "formal",
      body: `Dear ${recipient},\n\nWe have completed our review of your ${claimType} claim (${claimId}). Based on our investigation and applicable policy provisions, we are prepared to offer a settlement of $[ADJUSTER: CONFIRM AMOUNT].\n\nThis offer reflects covered damages per policy terms, less the applicable deductible.\n\nTo accept, please sign and return the enclosed Release of All Claims form. Payment will be issued within 5 business days of receipt.\n\n⚠ ADJUSTER: Verify all amounts, deductibles, and any subrogation interest before authorizing.\n\nSincerely,\nClaims Department`,
    },
    denial_recommendation: {
      subject: `Coverage Determination — ${claimId} [DRAFT — LEGAL REVIEW REQUIRED]`,
      tone: "formal",
      body: `Dear ${recipient},\n\nAfter careful review of your claim (${claimId}) and the applicable policy provisions, we are unable to extend coverage.\n\nBasis for determination:\n[ADJUSTER: Insert specific policy exclusion and factual basis. Legal review required.]\n\nYou have the right to appeal within 30 days. [ADJUSTER: Insert state-specific appeal rights.]\n\n⚠ DO NOT SEND without: claims counsel review, supervisor authorization, and jurisdiction-specific language.\n\nSincerely,\nClaims Department`,
    },
    status_update: {
      subject: `Claim Status Update — ${claimId}`,
      tone: "neutral",
      body: `Dear ${recipient},\n\nThis notice provides an update on your claim (${claimId}).\n\nCurrent Status: [ADJUSTER: Insert]\nNext Steps: [ADJUSTER: Insert]\nEstimated Resolution: [ADJUSTER: Insert]\n\nIf you have questions, please contact your assigned adjuster.\n\nSincerely,\nClaims Department`,
    },
    reservation_of_rights: {
      subject: `Reservation of Rights — ${claimId} [ATTORNEY REVIEW REQUIRED]`,
      tone: "formal",
      body: `Dear ${recipient},\n\nWhile our investigation of claim ${claimId} continues, we are reserving all rights under the policy, including the right to assert any exclusions, conditions, or provisions that may limit or preclude coverage.\n\n⚠ THIS LETTER MUST BE REVIEWED BY CLAIMS COUNSEL BEFORE ISSUANCE.\n\nSincerely,\nClaims Department`,
    },
  };
  const t = templates[intent];
  return {
    intent, recipient,
    subject: t.subject,
    body: t.body,
    tone: t.tone,
    legalDisclaimer: "DRAFT ONLY — not authorized for transmission. Adjuster must verify all facts, amounts, and policy references before sending.",
    requiresAdjusterAuthorization: true,
    draftId,
  };
}

// ── App Server Factory ────────────────────────────────────────────────────
function createAppServer(): McpServer {
  const server = new McpServer(
    { name: "eco-ai-claimgpt", version: "1.0.0" },
    { instructions: ECO_AI_INSTRUCTIONS }
  );

  registerAppResource(server, "eco-ai-adjuster-workspace", WIDGET_URI, {}, async () => ({
    contents: [{
      uri: WIDGET_URI,
      mimeType: RESOURCE_MIME_TYPE,
      text: WIDGET_HTML,
      _meta: {
        ui: { prefersBorder: true, domain: APP_DOMAIN, csp: { connectDomains: [], resourceDomains: [] } },
        "openai/widgetDescription": "ECO-AI Enterprise Claims Orchestration workspace — FNOL triage, policy coverage analysis, fraud risk scoring, and settlement preparation for licensed insurance adjusters.",
        "openai/widgetDomain": APP_DOMAIN,
        "openai/widgetCSP": { connect_domains: [], resource_domains: [] },
      },
    }],
  }));

  // Tool 1: query_policy_system
  registerAppTool(server, "query_policy_system", {
    title: "Query policy system",
    description: "Retrieves structured policy data including coverage limits, deductibles, endorsements, and active status. Call to verify policy before triage or adjudication.",
    inputSchema: {
      policyNumber: z.string().describe("Policy number to query."),
      claimId: z.string().optional().describe("Associated claim ID for audit logging."),
    },
    outputSchema: policyDataSchema.shape,
    annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
    _meta: { "openai/toolInvocation/invoking": "Querying policy system", "openai/toolInvocation/invoked": "Policy data retrieved" },
  }, async ({ policyNumber }) => {
    const data = mockPolicyData(policyNumber);
    return {
      content: [{ type: "text" as const, text: `Policy ${policyNumber}: ${data.status.toUpperCase()}. Holder: ${data.holderName}. ${data.coverages.length} coverage types on file.` }],
      structuredContent: data,
    };
  });

  // Tool 2: extract_document_data
  registerAppTool(server, "extract_document_data", {
    title: "Extract document data",
    description: "Sends a document through the multimodal parsing engine and returns validated structured JSON. Use for medical records, repair estimates, police reports, invoices, and correspondence.",
    inputSchema: {
      documentType: documentTypeEnum.describe("Type of document being processed."),
      content: z.string().describe("Raw text content or description of the document to parse."),
      schemaType: schemaTypeEnum.describe("Target extraction schema."),
      claimId: z.string().optional().describe("Associated claim ID."),
    },
    outputSchema: documentExtractionSchema.shape,
    annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: false, openWorldHint: false },
    _meta: { "openai/toolInvocation/invoking": "Parsing document", "openai/toolInvocation/invoked": "Document parsed" },
  }, async ({ documentType, content, schemaType }) => {
    const h = hashCode(content);
    const isFinancial = documentType === "repair_estimate" || documentType === "invoice";
    const isMedical = documentType === "medical_record";
    const total = isFinancial ? 8500 + (h % 40) * 500 : isMedical ? 12000 + (h % 30) * 1000 : undefined;
    const confidence = Number((0.81 + (h % 14) / 100).toFixed(2));
    const result: z.infer<typeof documentExtractionSchema> = {
      documentType, schemaType,
      extractedFields: {
        documentDate: new Date(Date.now() - (h % 30) * 86400000).toISOString().split("T")[0],
        documentNumber: "DOC-" + (100000 + (h % 900000)),
        preparedBy: pick(["Precision Auto Body", "City Medical Center", "Metro Police Department", "Restoration Pro LLC", "Allied Contractors Inc."], h),
        contactPhone: `(512) 555-${1000 + (h % 9000)}`,
      },
      lineItems: isFinancial ? [
        { description: "Labor — structural repair", amount: 3200 + (h % 10) * 100 },
        { description: "Parts — OEM replacement panels", amount: 2800 + (h % 8) * 150 },
        { description: "Paint and finishing", amount: 1400 + (h % 5) * 100 },
        { description: "Sublet — alignment and calibration", amount: 850 },
      ] : undefined,
      totalAmount: total,
      dateOfLoss: new Date(Date.now() - 15 * 86400000).toISOString().split("T")[0],
      parties: pick([["Sarah Williams", "Carrier"], ["Michael Chen", "State Farm"], ["James Rodriguez", "Allstate"]], h),
      confidence,
      flags: h % 5 === 0 ? ["Amount exceeds regional median by 34% — second estimate recommended [Source: Regional Cost Index Q2 2026]"] : [],
      summary: `${documentType.replace(/_/g, " ")} parsed via multimodal engine.${total ? ` $${total.toLocaleString()} extracted.` : ""} Confidence: ${Math.round(confidence * 100)}%.`,
    };
    return {
      content: [{ type: "text" as const, text: result.summary }],
      structuredContent: result,
    };
  });

  // Tool 3: run_fraud_analytics
  registerAppTool(server, "run_fraud_analytics", {
    title: "Run fraud analytics",
    description: "Calls the fraud detection engine to generate an anomaly risk score, identify data inconsistencies, and produce SIU referral recommendations. Call during FNOL triage and when new documents are added.",
    inputSchema: {
      claimId: z.string().describe("Claim ID to analyze."),
      claimType: z.string().describe("Type of claim (auto, property, liability, workers comp, etc.)."),
      narrative: z.string().optional().describe("FNOL narrative for semantic anomaly analysis."),
    },
    outputSchema: fraudAnalyticsSchema.shape,
    annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
    _meta: { "openai/toolInvocation/invoking": "Running fraud analytics", "openai/toolInvocation/invoked": "Fraud analysis complete" },
  }, async ({ claimId, claimType, narrative }) => {
    const data = mockFraudAnalytics(claimId, claimType + (narrative ?? "").slice(0, 40));
    return {
      content: [{ type: "text" as const, text: `Fraud analysis: ${data.riskScore}/100 (${data.riskBand.toUpperCase()}). ${data.anomalies.length} anomaly signal(s) detected.` }],
      structuredContent: data,
    };
  });

  // Tool 4: update_claim_status
  registerAppTool(server, "update_claim_status", {
    title: "Update claim status",
    description: "Updates the claim workflow status and financial reserve. ADJUSTER AUTHORIZATION REQUIRED. Reserve must be set before payment. Verify current state before calling.",
    inputSchema: {
      claimId: z.string().describe("Claim ID to update."),
      status: claimStatusEnum.describe("New status for the claim."),
      reserveAmount: z.number().min(0).optional().describe("Financial reserve in USD."),
      notes: z.string().optional().describe("Adjuster notes for the audit trail."),
      authorizedBy: z.string().optional().describe("Name of the authorizing adjuster."),
    },
    outputSchema: claimUpdateSchema.shape,
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false },
    _meta: { "openai/toolInvocation/invoking": "Updating claim status", "openai/toolInvocation/invoked": "Claim status updated" },
  }, async ({ claimId, status, reserveAmount, notes, authorizedBy }) => {
    const data: z.infer<typeof claimUpdateSchema> = {
      claimId,
      previousStatus: "fnol",
      newStatus: status,
      reserveAmount,
      updatedAt: new Date().toISOString(),
      auditEntry: `Status → "${status}"${reserveAmount ? `, reserve $${reserveAmount.toLocaleString()}` : ""}. Auth: ${authorizedBy ?? "Adjuster"}. ECO-AI assisted. Notes: ${notes ?? "None."}`,
      requiresManagerApproval: (reserveAmount ?? 0) > 25000,
      nextRequiredAction: status === "investigation" ? "Collect documentation and schedule field inspection."
        : status === "evaluation" ? "Complete damage assessment and prepare reserve recommendation."
          : status === "settlement" ? "Issue settlement letter and await signed release."
            : "Continue per standard claims workflow.",
    };
    return {
      content: [{ type: "text" as const, text: `Claim ${claimId} → "${status}"${reserveAmount ? ` | Reserve: $${reserveAmount.toLocaleString()}` : ""}. ${data.requiresManagerApproval ? "⚠ MANAGER APPROVAL REQUIRED." : ""}` }],
      structuredContent: data,
    };
  });

  // Tool 5: draft_communication
  registerAppTool(server, "draft_communication", {
    title: "Draft communication",
    description: "Generates a legally compliant letter or email draft for adjuster review. NOT authorized for transmission until adjuster verifies and signs off. Use for settlement offers, RFIs, acknowledgments, denials, and reservation of rights.",
    inputSchema: {
      intent: communicationIntentEnum.describe("Communication type to draft."),
      recipient: z.string().describe("Recipient name."),
      contextData: z.object({
        claimId: z.string().optional(),
        claimType: z.string().optional(),
        policyNumber: z.string().optional(),
        dateOfLoss: z.string().optional(),
        reserveAmount: z.number().optional(),
      }).describe("Claim context to populate in the draft."),
    },
    outputSchema: communicationSchema.shape,
    annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: false, openWorldHint: false },
    _meta: { "openai/toolInvocation/invoking": "Drafting communication", "openai/toolInvocation/invoked": "Draft ready for adjuster review" },
  }, async ({ intent, recipient, contextData }) => {
    const data = mockCommunication(intent, recipient, contextData);
    return {
      content: [{ type: "text" as const, text: `${intent.replace(/_/g, " ")} draft prepared for ${recipient}. Draft ID: ${data.draftId}. ADJUSTER REVIEW AND AUTHORIZATION REQUIRED before sending.` }],
      structuredContent: data,
    };
  });

  // Tool 6: run_fnol_triage
  registerAppTool(server, "run_fnol_triage", {
    title: "Run FNOL triage",
    description: "Full Stage 1 claims orchestration: verifies policy status, scores fraud risk, determines routing (FAST_TRACK or COMPLEX_ADJUDICATION), identifies missing documents, and produces a triage summary. Call this first for every new claim.",
    inputSchema: {
      claimId: z.string().describe("Claim identifier (e.g. CLM-2026-001234)."),
      policyNumber: z.string().describe("Associated policy number."),
      claimType: z.string().describe("Claim type (e.g. Property — Water Damage, Auto — Collision, Workers Comp)."),
      narrative: z.string().describe("FNOL narrative or adjuster summary of the incident."),
      evidenceCount: z.number().int().min(0).default(0).describe("Number of supporting documents already attached."),
    },
    outputSchema: fnolTriageSchema.shape,
    annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
    _meta: { "openai/toolInvocation/invoking": "Running FNOL triage", "openai/toolInvocation/invoked": "FNOL triage complete" },
  }, async ({ claimId, policyNumber, claimType, narrative, evidenceCount }) => {
    const data = mockFnolTriage(claimId, policyNumber, claimType, narrative, evidenceCount);
    return {
      content: [{ type: "text" as const, text: `FNOL triage: ${data.routing} | Severity: ${data.severity.toUpperCase()} | Fraud: ${data.fraudRiskBand.toUpperCase()} (${data.fraudRiskScore}/100) | ${data.missingDocuments.length} doc(s) outstanding | Reserve: $${data.suggestedReserve.toLocaleString()}` }],
      structuredContent: data,
    };
  });

  // Tool 7: render_adjuster_workspace (render tool)
  registerAppTool(server, "render_adjuster_workspace", {
    title: "Render adjuster workspace",
    description: "Renders the ECO-AI enterprise adjuster workspace widget with FNOL triage, policy coverage, fraud risk, and settlement data. Call after run_fnol_triage or after gathering sufficient claim data.",
    inputSchema: workspaceInputSchema,
    outputSchema: {
      headline: z.string(),
      subhead: z.string(),
      claimId: z.string(),
      routing: routingEnum,
      severity: severityEnum,
      fraudRiskScore: z.number(),
      fraudRiskBand: riskBandEnum,
      suggestedReserve: z.number(),
    },
    annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
    _meta: {
      ui: { resourceUri: WIDGET_URI },
      "openai/outputTemplate": WIDGET_URI,
      "openai/toolInvocation/invoking": "Opening ECO-AI workspace",
      "openai/toolInvocation/invoked": "ECO-AI workspace ready",
    },
  }, async (input) => ({
    content: [{ type: "text" as const, text: `ECO-AI workspace rendered for ${input.claimType} claim ${input.claimId}. Routing: ${input.routing}. Reserve: $${input.suggestedReserve.toLocaleString()}.` }],
    structuredContent: {
      headline: "ECO-AI",
      subhead: `${input.claimType} — ${input.routing.replace("_", " ")}`,
      ...input,
      lastUpdated: input.lastUpdated ?? new Date().toISOString(),
    },
    _meta: { routingDecision: input.routing, fraudBand: input.fraudRiskBand, reserveAmount: input.suggestedReserve },
  }));

  return server;
}

// ── HTTP Server ───────────────────────────────────────────────────────────
const port = Number(process.env.PORT ?? "8787");
const MCP_PATH = "/mcp";

createServer(async (req, res) => {
  if (!req.url) { res.writeHead(400).end("Missing URL"); return; }
  const url = new URL(req.url, "http://" + (req.headers.host ?? "localhost"));
  const isMcpRoute = url.pathname === MCP_PATH || url.pathname.startsWith(MCP_PATH + "/");

  if (req.method === "GET" && url.pathname === "/privacy") {
    res.writeHead(200, { "content-type": "text/html; charset=utf-8" }).end(readFileSync(path.join(PUBLIC_DIR, "privacy.html"), "utf8")); return;
  }
  if (req.method === "GET" && url.pathname === "/support") {
    res.writeHead(200, { "content-type": "text/html; charset=utf-8" }).end(readFileSync(path.join(PUBLIC_DIR, "support.html"), "utf8")); return;
  }

  const staticFile = STATIC_PUBLIC_FILES.get(url.pathname);
  if (req.method === "GET" && staticFile) {
    res.writeHead(200, { "content-type": staticFile.contentType }).end(readFileSync(path.join(PUBLIC_DIR, staticFile.fileName), "utf8")); return;
  }

  if (req.method === "GET" && url.pathname === "/status") {
    res.writeHead(200, { "content-type": "application/json; charset=utf-8" }).end(JSON.stringify({ name: "ClaimGPT ECO-AI", version: "1.0.0", status: "ok", mcpPath: MCP_PATH, appDomain: APP_DOMAIN }, null, 2)); return;
  }
  if (req.method === "GET" && url.pathname === "/robots.txt") { res.writeHead(200, { "content-type": "text/plain; charset=utf-8" }).end(ROBOTS_TXT); return; }
  if (req.method === "GET" && url.pathname === "/sitemap.xml") { res.writeHead(200, { "content-type": "application/xml; charset=utf-8" }).end(SITEMAP_XML); return; }
  if (req.method === "GET" && (url.pathname === "/security.txt" || url.pathname === "/.well-known/security.txt")) {
    res.writeHead(200, { "content-type": "text/plain; charset=utf-8" }).end(SECURITY_TXT); return;
  }
  if (req.method === "GET" && url.pathname === "/.well-known/openai-apps-challenge") {
    res.writeHead(200, { "content-type": "text/plain; charset=utf-8" }).end(OPENAI_APPS_CHALLENGE_TOKEN); return;
  }

  if (req.method === "OPTIONS" && isMcpRoute) {
    res.writeHead(204, {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "POST, GET, DELETE, OPTIONS",
      "Access-Control-Allow-Headers": "content-type, mcp-session-id",
      "Access-Control-Expose-Headers": "Mcp-Session-Id",
    }).end(); return;
  }

  if (req.method === "GET" && url.pathname === "/") { res.writeHead(200, { "content-type": "text/html; charset=utf-8" }).end(LANDING_HTML); return; }
  if (req.method === "GET" && url.pathname === "/healthz") { res.writeHead(200, { "content-type": "application/json; charset=utf-8" }).end(JSON.stringify({ status: "ok" })); return; }

  const transportMethods = new Set(["GET", "POST", "DELETE"]);
  if (isMcpRoute && req.method && transportMethods.has(req.method)) {
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("Access-Control-Expose-Headers", "Mcp-Session-Id");
    const server = createAppServer();
    const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined, enableJsonResponse: true });
    res.on("close", () => { transport.close(); server.close(); });
    try {
      await server.connect(transport);
      await transport.handleRequest(req, res);
    } catch (err) {
      console.error("MCP request error:", err);
      if (!res.headersSent) res.writeHead(500).end("Internal server error");
    }
    return;
  }

  res.writeHead(404).end("Not Found");
}).listen(port, () => {
  console.log(`ECO-AI ClaimGPT listening on http://localhost:${port}${MCP_PATH}`);
});
