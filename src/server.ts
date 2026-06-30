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
const WIDGET_URI = "ui://widget/claim-workspace-v1.html";
const WIDGET_HTML = readFileSync(path.join(PUBLIC_DIR, "widget.html"), "utf8");
const LANDING_HTML = readFileSync(path.join(PUBLIC_DIR, "index.html"), "utf8");
const ENTERPRISE_HTML = readFileSync(path.join(PUBLIC_DIR, "enterprise.html"), "utf8");

const APP_DOMAIN = process.env.CLAIMGPT_PUBLIC_DOMAIN ?? "https://claim-gpt.com";
const SUPPORT_EMAIL = process.env.CLAIMGPT_SUPPORT_EMAIL ?? "support@claim-gpt.com";
const SUPPORT_URL = process.env.CLAIMGPT_SUPPORT_URL ?? `${APP_DOMAIN}/support`;
const PRIVACY_URL = process.env.CLAIMGPT_PRIVACY_URL ?? `${APP_DOMAIN}/privacy`;
const OPENAI_APPS_CHALLENGE_TOKEN =
  process.env.OPENAI_APPS_CHALLENGE_TOKEN ?? "0K_llmmXaQhaRNLdZhB7915noSoUoNn6GhMk9zqa6eA";

const SITEMAP_XML = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
  <url>
    <loc>${APP_DOMAIN}/</loc>
  </url>
  <url>
    <loc>${APP_DOMAIN}/privacy</loc>
  </url>
  <url>
    <loc>${APP_DOMAIN}/support</loc>
  </url>
</urlset>
`;

const ROBOTS_TXT = `User-agent: *
Allow: /
Sitemap: ${APP_DOMAIN}/sitemap.xml
`;

const SECURITY_TXT = `Contact: ${SUPPORT_EMAIL}
Preferred-Languages: en
Canonical: ${APP_DOMAIN}/
Policy: ${PRIVACY_URL}
`;

const STATIC_PUBLIC_FILES = new Map<string, { fileName: string; contentType: string }>([
  ["/favicon.svg", { fileName: "favicon.svg", contentType: "image/svg+xml; charset=utf-8" }],
  ["/og-card.svg", { fileName: "og-card.svg", contentType: "image/svg+xml; charset=utf-8" }],
  [
    "/site.webmanifest",
    { fileName: "site.webmanifest", contentType: "application/manifest+json; charset=utf-8" },
  ],
]);

const claimTypeEnum = z.enum(["property", "bodily_injury", "workers_comp", "liability", "auto"]);
const severityBandEnum = z.enum(["low", "moderate", "high", "critical"]);
const statusEnum = z.enum([
  "new",
  "triage",
  "investigating",
  "awaiting-docs",
  "escalated",
  "adjuster-review",
]);

const sourceCitationSchema = z.object({
  sourceId: z.string(),
  sourceType: z.enum([
    "fnol",
    "medical_record",
    "bill",
    "demand_package",
    "telematics",
    "image",
    "statement",
    "police_report",
    "communication",
    "system_note",
  ]),
  label: z.string(),
  excerpt: z.string(),
  page: z.number().int().min(1).optional(),
  paragraph: z.number().int().min(1).optional(),
  confidence: z.number().min(0).max(1),
});

const treatmentEventSchema = z.object({
  date: z.string(),
  provider: z.string(),
  eventType: z.string(),
  details: z.string(),
  icdCodes: z.array(z.string()),
  prescriptions: z.array(z.string()),
  procedures: z.array(z.string()),
  citations: z.array(sourceCitationSchema).min(1),
});

const anomalySchema = z.object({
  category: z.enum(["medical", "billing", "liability", "fraud", "litigation", "documentation"]),
  severity: severityBandEnum,
  title: z.string(),
  details: z.string(),
  citations: z.array(sourceCitationSchema).min(1),
});

const actionPlanItemSchema = z.object({
  priority: z.number().int().min(1).max(3),
  action: z.string(),
  rationale: z.string(),
  citations: z.array(sourceCitationSchema).min(1),
});

const orchestrationToolSchema = z.object({
  name: z.string(),
  system: z.string(),
  purpose: z.string(),
  mode: z.enum(["read", "write", "read_write"]),
});

const workflowStageSchema = z.object({
  stage: z.string(),
  objective: z.string(),
  steps: z.array(z.string()).min(1),
});

const medicalInputSchema = z.object({
  sourceId: z.string(),
  provider: z.string(),
  noteDate: z.string(),
  summary: z.string(),
  icdCodes: z.array(z.string()).default([]),
  prescriptions: z.array(z.string()).default([]),
  procedures: z.array(z.string()).default([]),
  page: z.number().int().min(1).optional(),
  paragraph: z.number().int().min(1).optional(),
});

const billInputSchema = z.object({
  sourceId: z.string(),
  provider: z.string(),
  amount: z.number().nonnegative(),
  description: z.string(),
  page: z.number().int().min(1).optional(),
  paragraph: z.number().int().min(1).optional(),
});

const communicationInputSchema = z.object({
  sourceId: z.string(),
  authorRole: z.string(),
  date: z.string(),
  summary: z.string(),
  page: z.number().int().min(1).optional(),
  paragraph: z.number().int().min(1).optional(),
});

const analyzeClaimInputSchema = {
  claimType: claimTypeEnum.describe(
    "Claim line such as property, bodily_injury, workers_comp, liability, or auto."
  ),
  narrative: z.string().describe("FNOL narrative or adjuster summary."),
  evidenceCount: z.number().int().min(0).max(50).default(0),
  claimantAge: z.number().int().min(0).max(120).optional(),
  priorConditions: z.array(z.string()).default([]),
  jurisdiction: z.string().default("Unknown"),
  telematicsSummary: z
    .string()
    .optional()
    .describe("Optional telematics or impact dynamics summary."),
  imageObservations: z
    .array(z.string())
    .default([])
    .describe("Optional image or scene observations."),
  policeReportSummary: z.string().optional(),
  medicalRecords: z.array(medicalInputSchema).default([]),
  bills: z.array(billInputSchema).default([]),
  communications: z.array(communicationInputSchema).default([]),
};

const claimAnalysisSchema = z.object({
  claimType: claimTypeEnum,
  headline: z.string(),
  subhead: z.string(),
  executiveStatus: z.object({
    severityScore: z.number().min(1).max(100),
    severityBand: severityBandEnum,
    totalIncurredPrediction: z.object({
      amount: z.number().nonnegative(),
      low: z.number().nonnegative(),
      high: z.number().nonnegative(),
      confidence: z.number().min(0).max(1),
      rationale: z.string(),
    }),
    reserveRecommendation: z.string(),
    litigationProbability: z.number().min(0).max(100),
    fraudRisk: z.number().min(0).max(100),
    complexityScore: z.number().min(1).max(100),
    route: z.string(),
    status: statusEnum,
  }),
  impactLiability: z.object({
    biomechanicalPlausibility: z.string(),
    impactSeverityScore: z.number().min(0).max(100),
    liabilityAssessment: z.string(),
    comparativeNegligencePercent: z.number().min(0).max(100),
    subrogationOpportunity: z.string(),
    citations: z.array(sourceCitationSchema).min(1),
  }),
  medicalSynthesis: z.object({
    initialInjuryOverview: z.string(),
    currentMedicalStatus: z.string(),
    futureTreatmentTrajectory: z.string(),
    chronology: z.array(treatmentEventSchema),
  }),
  fraudReview: z.object({
    entityResolutionSummary: z.string(),
    alternativeDataSummary: z.string(),
    forensicsSummary: z.string(),
    citations: z.array(sourceCitationSchema).min(1),
  }),
  enterpriseOrchestration: z.object({
    systemPersona: z.string(),
    humanInLoopNotice: z.string(),
    complianceGuardrails: z.array(z.string()).min(4),
    mcpTools: z.array(orchestrationToolSchema).min(4),
    workflowStages: z.array(workflowStageSchema).length(4),
    integrationArchitecture: z.array(z.string()).min(4),
  }),
  anomaliesAndRedFlags: z.array(anomalySchema),
  adjusterActionPlan: z.array(actionPlanItemSchema).length(3),
  missingInformation: z.array(z.string()),
  traceabilityNote: z.string(),
});

type AnalyzeClaimInput = z.infer<z.ZodObject<typeof analyzeClaimInputSchema>>;
type ClaimAnalysis = z.infer<typeof claimAnalysisSchema>;
type CitationSourceType = z.infer<typeof sourceCitationSchema>["sourceType"];

function createCitation(
  sourceId: string,
  sourceType: CitationSourceType,
  label: string,
  excerpt: string,
  page?: number,
  paragraph?: number,
  confidence = 0.84
): z.infer<typeof sourceCitationSchema> {
  return {
    sourceId,
    sourceType,
    label,
    excerpt,
    page,
    paragraph,
    confidence,
  };
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function titleCase(input: string): string {
  return input
    .split(/[_\s-]+/)
    .filter(Boolean)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
}

function maskConditions(conditions: string[]): string[] {
  return conditions.map((condition) => condition.replace(/[A-Za-z0-9]/g, "x"));
}

function buildPrimaryCitations(input: AnalyzeClaimInput): z.infer<typeof sourceCitationSchema>[] {
  const citations: z.infer<typeof sourceCitationSchema>[] = [
    createCitation("fnol", "fnol", "FNOL narrative", input.narrative.slice(0, 220), 1, 1, 0.93),
  ];

  if (input.telematicsSummary) {
    citations.push(
      createCitation(
        "telematics",
        "telematics",
        "Telematics summary",
        input.telematicsSummary.slice(0, 220),
        1,
        1,
        0.82
      )
    );
  }

  if (input.policeReportSummary) {
    citations.push(
      createCitation(
        "police-report",
        "police_report",
        "Police report summary",
        input.policeReportSummary.slice(0, 220),
        1,
        1,
        0.8
      )
    );
  }

  if (input.communications[0]) {
    const communication = input.communications[0];
    citations.push(
      createCitation(
        communication.sourceId,
        "communication",
        `${communication.authorRole} communication`,
        communication.summary.slice(0, 220),
        communication.page,
        communication.paragraph,
        0.78
      )
    );
  }

  return citations;
}

function computeSeverityScore(input: AnalyzeClaimInput): number {
  const text = input.narrative.toLowerCase();
  let score = 28 + input.evidenceCount * 4 + input.medicalRecords.length * 5 + input.bills.length * 3;

  if (input.claimType === "bodily_injury" || input.claimType === "workers_comp") score += 14;
  if (text.includes("surgery") || text.includes("fracture")) score += 22;
  if (text.includes("ambulance") || text.includes("er") || text.includes("hospital")) score += 15;
  if (text.includes("lost time") || text.includes("missed work")) score += 10;
  if (text.includes("fire") || text.includes("total loss")) score += 18;
  if ((input.claimantAge ?? 0) >= 60) score += 4;
  if (input.priorConditions.length > 0) score += 6;

  return clamp(score, 1, 100);
}

function computeImpactSeverity(input: AnalyzeClaimInput): number {
  const text = `${input.narrative} ${input.telematicsSummary ?? ""} ${input.imageObservations.join(" ")}`.toLowerCase();
  let score = 22;

  if (text.includes("rear-end")) score += 10;
  if (text.includes("rollover") || text.includes("airbag")) score += 22;
  if (text.includes("drivable")) score -= 8;
  if (text.includes("minor bumper")) score -= 10;
  if (text.includes("intrusion") || text.includes("frame damage")) score += 18;
  if (text.includes("fire") || text.includes("collapse")) score += 16;

  return clamp(score + input.imageObservations.length * 3, 0, 100);
}

function extractMissingInformation(input: AnalyzeClaimInput): string[] {
  const text = input.narrative.toLowerCase();
  const missing: string[] = [];

  if (input.narrative.trim().length < 140) {
    missing.push("Expanded FNOL chronology with exact sequence of events.");
  }

  if (!/\b(january|february|march|april|may|june|july|august|september|october|november|december|\d{1,2}\/\d{1,2}\/\d{2,4}|\d{4}-\d{2}-\d{2})\b/.test(text)) {
    missing.push("Exact incident date and time.");
  }

  if (input.evidenceCount === 0) {
    missing.push("Supporting file set: photos, invoices, repair estimates, or medical attachments.");
  }

  if ((input.claimType === "bodily_injury" || input.claimType === "workers_comp") && input.medicalRecords.length === 0) {
    missing.push("Initial clinical notes or emergency treatment documentation.");
  }

  if (input.claimType === "liability" && !input.policeReportSummary) {
    missing.push("Liability documentation such as police report or witness statement summary.");
  }

  if (input.telematicsSummary === undefined && (input.claimType === "auto" || input.claimType === "bodily_injury")) {
    missing.push("Impact dynamics inputs such as telematics, vehicle damage notes, or scene photos.");
  }

  return missing;
}

function buildMedicalChronology(input: AnalyzeClaimInput): z.infer<typeof treatmentEventSchema>[] {
  if (input.medicalRecords.length === 0) {
    return [
      {
        date: "Pending",
        provider: "No provider documentation uploaded",
        eventType: "Documentation gap",
        details: "Medical chronology cannot be reconstructed until source treatment records are supplied.",
        icdCodes: [],
        prescriptions: [],
        procedures: [],
        citations: [
          createCitation("fnol", "fnol", "FNOL narrative", input.narrative.slice(0, 220), 1, 1, 0.72),
        ],
      },
    ];
  }

  return [...input.medicalRecords]
    .sort((a, b) => a.noteDate.localeCompare(b.noteDate))
    .map((record) => ({
      date: record.noteDate,
      provider: record.provider,
      eventType: record.procedures.length > 0 ? "Treatment event" : "Clinical evaluation",
      details: record.summary,
      icdCodes: record.icdCodes,
      prescriptions: record.prescriptions,
      procedures: record.procedures,
      citations: [
        createCitation(
          record.sourceId,
          "medical_record",
          `${record.provider} note`,
          record.summary.slice(0, 220),
          record.page,
          record.paragraph,
          0.9
        ),
      ],
    }));
}

function buildAnomalies(
  input: AnalyzeClaimInput,
  primaryCitations: z.infer<typeof sourceCitationSchema>[],
  missingInformation: string[]
): z.infer<typeof anomalySchema>[] {
  const text = `${input.narrative} ${input.communications.map((item) => item.summary).join(" ")}`.toLowerCase();
  const anomalies: z.infer<typeof anomalySchema>[] = [];

  if (missingInformation.length > 0) {
    anomalies.push({
      category: "documentation",
      severity: missingInformation.length >= 3 ? "high" : "moderate",
      title: "Core intake data is incomplete",
      details: missingInformation.join(" "),
      citations: [primaryCitations[0]],
    });
  }

  if (text.includes("urgent payout") || text.includes("cash only") || text.includes("wire today")) {
    anomalies.push({
      category: "fraud",
      severity: "high",
      title: "Accelerated payout pressure",
      details:
        "Claim communications contain urgency language seeking payment before normal verification is complete.",
      citations: primaryCitations.slice(0, 2),
    });
  }

  if (text.includes("different story") || text.includes("changed story") || text.includes("inconsistent")) {
    anomalies.push({
      category: "medical",
      severity: "high",
      title: "Narrative inconsistency detected",
      details:
        "The submitted story indicates material inconsistency that should be reconciled before reserve or settlement movement.",
      citations: primaryCitations.slice(0, 2),
    });
  }

  const totalBilled = input.bills.reduce((sum, bill) => sum + bill.amount, 0);
  if (input.bills.length >= 2 && totalBilled > 20000) {
    const bill = input.bills[0];
    anomalies.push({
      category: "billing",
      severity: "moderate",
      title: "Medical spend is elevated for the current documentation set",
      details:
        "Current bill volume should be benchmarked against group-health pricing and utilization norms before reserve increase.",
      citations: [
        createCitation(
          bill.sourceId,
          "bill",
          `${bill.provider} bill`,
          `${bill.description} for $${bill.amount.toFixed(2)}`,
          bill.page,
          bill.paragraph,
          0.88
        ),
      ],
    });
  }

  if ((input.claimType === "liability" || input.claimType === "auto") && !input.policeReportSummary) {
    anomalies.push({
      category: "liability",
      severity: "moderate",
      title: "Liability allocation remains weakly supported",
      details:
        "Comparative negligence and subrogation analysis is provisional because the file lacks a police report or external liability statement.",
      citations: [primaryCitations[0]],
    });
  }

  if (
    (input.claimType === "bodily_injury" || input.claimType === "workers_comp") &&
    input.communications.some((item) => /attorney|representation|counsel/i.test(item.summary))
  ) {
    const communication = input.communications.find((item) =>
      /attorney|representation|counsel/i.test(item.summary)
    )!;
    anomalies.push({
      category: "litigation",
      severity: "high",
      title: "Representation signal present",
      details:
        "The claim file contains language suggesting legal engagement or pre-retention posturing, increasing cycle-time and demand inflation risk.",
      citations: [
        createCitation(
          communication.sourceId,
          "communication",
          `${communication.authorRole} communication`,
          communication.summary.slice(0, 220),
          communication.page,
          communication.paragraph,
          0.86
        ),
      ],
    });
  }

  return anomalies;
}

function buildActionPlan(
  input: AnalyzeClaimInput,
  primaryCitations: z.infer<typeof sourceCitationSchema>[],
  missingInformation: string[],
  anomalies: z.infer<typeof anomalySchema>[],
  litigationProbability: number
): z.infer<typeof actionPlanItemSchema>[] {
  const actions: z.infer<typeof actionPlanItemSchema>[] = [];

  actions.push({
    priority: 1,
    action:
      missingInformation.length > 0
        ? "Issue a same-day documentation request package and pin the outstanding intake gaps."
        : "Confirm coverage position and move the file into adjuster review immediately.",
    rationale:
      missingInformation.length > 0
        ? "The file is not traceable enough for reserve or settlement movement until the missing intake elements are supplied."
        : "Core facts are developed enough to support a controlled handoff without further FNOL delay.",
    citations: [primaryCitations[0]],
  });

  actions.push({
    priority: 2,
    action:
      input.claimType === "bodily_injury" || input.claimType === "workers_comp"
        ? "Benchmark treatment utilization, reserve adequacy, and attorney-retention timing before Day 45."
        : "Validate liability evidence and reserve adequacy before any claimant-facing payment discussion.",
    rationale:
      input.claimType === "bodily_injury" || input.claimType === "workers_comp"
        ? `The current litigation probability is ${litigationProbability}% and treatment evolution may materially change total incurred.`
        : "Liability allocation and reserve movement remain sensitive to incomplete external evidence.",
    citations: anomalies[0] ? anomalies[0].citations : [primaryCitations[0]],
  });

  actions.push({
    priority: 3,
    action:
      anomalies.some((item) => item.category === "fraud")
        ? "Escalate to SIU-style validation steps focused on identity, chronology, and supporting-file authenticity."
        : "Document the current analytic rationale and schedule a 7-day file review checkpoint.",
    rationale:
      anomalies.some((item) => item.category === "fraud")
        ? "Fraud-linked urgency or contradiction signals should be resolved before any irreversible claim decision."
        : "The current recommendation set is read-only and should be revalidated as new records arrive.",
    citations:
      anomalies.find((item) => item.category === "fraud")?.citations ??
      anomalies[0]?.citations ??
      [primaryCitations[0]],
  });

  return actions;
}

function analyzeClaim(input: AnalyzeClaimInput): ClaimAnalysis {
  const primaryCitations = buildPrimaryCitations(input);
  const missingInformation = extractMissingInformation(input);
  const severityScore = computeSeverityScore(input);
  const impactSeverityScore = computeImpactSeverity(input);
  const litigationProbability = clamp(
    Math.round(
      14 +
        input.medicalRecords.length * 7 +
        input.communications.filter((item) => /attorney|representation|counsel/i.test(item.summary))
          .length *
          18 +
        (severityScore >= 70 ? 16 : 0)
    ),
    1,
    95
  );
  const fraudRisk = clamp(
    Math.round(
      9 +
        (missingInformation.length > 2 ? 10 : 0) +
        (/urgent payout|cash only|wire today|different story|changed story|inconsistent/i.test(
          `${input.narrative} ${input.communications.map((item) => item.summary).join(" ")}`
        )
          ? 28
          : 0) +
        input.imageObservations.filter((item) => /edited|cropped|metadata/i.test(item)).length * 10
    ),
    1,
    92
  );
  const complexityScore = clamp(
    Math.round(severityScore * 0.45 + litigationProbability * 0.25 + fraudRisk * 0.2 + impactSeverityScore * 0.1),
    1,
    100
  );
  const severityBand: z.infer<typeof severityBandEnum> =
    severityScore >= 85 ? "critical" : severityScore >= 65 ? "high" : severityScore >= 40 ? "moderate" : "low";
  const status: z.infer<typeof statusEnum> =
    missingInformation.length >= 3
      ? "awaiting-docs"
      : severityBand === "critical" || litigationProbability >= 65
        ? "escalated"
        : severityBand === "high"
          ? "adjuster-review"
          : "triage";
  const route =
    severityBand === "critical"
      ? "Catastrophic / senior casualty desk"
      : severityBand === "high"
        ? "Complex injury or liability tier"
        : "Core intake desk";

  const totalPaid = input.bills.reduce((sum, bill) => sum + bill.amount, 0);
  const maskedConditions = maskConditions(input.priorConditions);
  const treatmentEvents = buildMedicalChronology(input);
  const anomalies = buildAnomalies(input, primaryCitations, missingInformation);
  const actionPlan = buildActionPlan(
    input,
    primaryCitations,
    missingInformation,
    anomalies,
    litigationProbability
  );

  const tipBase =
    totalPaid +
    input.medicalRecords.length * 1800 +
    (severityBand === "critical" ? 28000 : severityBand === "high" ? 14000 : 5000) +
    (litigationProbability >= 60 ? 12000 : 3500);
  const tipAmount = Math.round(Math.max(tipBase, totalPaid + 3000));
  const tipLow = Math.round(tipAmount * 0.82);
  const tipHigh = Math.round(tipAmount * 1.24);

  const injuryOverview =
    input.medicalRecords.length > 0
      ? `Initial injury overview reconstructed from ${input.medicalRecords.length} medical source item(s). Reported comorbidity signals are masked but present: ${maskedConditions.length > 0 ? maskedConditions.join(", ") : "none documented"}.`
      : "No medical source file has been uploaded yet, so injury characterization remains provisional and is based on FNOL language only.";

  const currentStatus =
    input.medicalRecords.length > 0
      ? `Current status reflects active treatment chronology, ${input.bills.length} bill record(s), and severity band ${severityBand}. Reserve movement should remain traceable to the uploaded source set.`
      : "Current status cannot be medically synthesized beyond intake allegations because no treatment notes are attached.";

  const futureTrajectory =
    severityBand === "critical" || severityBand === "high"
      ? "Future treatment trajectory should assume continued utilization, additional diagnostics, and elevated legal-retention pressure until contradictions and reserve assumptions are resolved."
      : "Future treatment trajectory appears containable if the missing file elements are collected early and no new adverse medical developments emerge.";

  return {
    claimType: input.claimType,
    headline: "ClaimGPT OCCIE Workspace",
    subhead: "Casualty claims intelligence for triage, reserving, and red-flag review",
    executiveStatus: {
      severityScore,
      severityBand,
      totalIncurredPrediction: {
        amount: tipAmount,
        low: tipLow,
        high: tipHigh,
        confidence: Number(clamp(0.61 + input.medicalRecords.length * 0.04, 0.61, 0.91).toFixed(2)),
        rationale:
          "TIP is a directional reserve-support estimate derived from current bill volume, treatment intensity, severity, and litigation pressure.",
      },
      reserveRecommendation:
        tipAmount > totalPaid + 15000
          ? `Increase working reserves toward ${tipAmount.toLocaleString("en-US", {
              style: "currency",
              currency: "USD",
              maximumFractionDigits: 0,
            })} while documentation gaps and litigation exposure remain active.`
          : `Maintain current reserve posture near ${tipAmount.toLocaleString("en-US", {
              style: "currency",
              currency: "USD",
              maximumFractionDigits: 0,
            })} and revisit after the next material medical or liability update.`,
      litigationProbability,
      fraudRisk,
      complexityScore,
      route,
      status,
    },
    impactLiability: {
      biomechanicalPlausibility:
        impactSeverityScore >= 65
          ? "The reported mechanism and available impact indicators are directionally consistent with a higher-severity injury presentation, but medical causation still requires record-level review."
          : "Impact dynamics appear modest relative to severe injury allegations, so causation and treatment escalation should be validated carefully.",
      impactSeverityScore,
      liabilityAssessment:
        input.policeReportSummary
          ? "Liability view incorporates the supplied police-report summary and current claimant narrative."
          : "Liability view remains provisional and is based primarily on the FNOL narrative because external liability records are incomplete.",
      comparativeNegligencePercent:
        input.policeReportSummary && /shared|both|comparative|failed to yield/i.test(input.policeReportSummary)
          ? 35
          : input.claimType === "liability" || input.claimType === "auto"
            ? 15
            : 5,
      subrogationOpportunity:
        input.claimType === "property" || input.claimType === "auto"
          ? "Review vendor, adverse carrier, and scene-causation evidence for subrogation potential once liability support is complete."
          : "No strong subrogation path is evident yet from the current source set.",
      citations: primaryCitations,
    },
    medicalSynthesis: {
      initialInjuryOverview: injuryOverview,
      currentMedicalStatus: currentStatus,
      futureTreatmentTrajectory: futureTrajectory,
      chronology: treatmentEvents,
    },
    fraudReview: {
      entityResolutionSummary:
        fraudRisk >= 45
          ? "Entity-resolution review is recommended because the current file contains contradiction or urgency signals that justify identity, provider, and prior-claim matching."
          : "No strong entity-resolution conflict is evident from the supplied inputs alone, but cross-carrier matching data has not been provided in this environment.",
      alternativeDataSummary:
        input.communications.length > 0
          ? "Open-source and communication-led contradiction review should focus on activity claims, work-loss assertions, and externally visible functionality that could narrow impairment allegations."
          : "Alternative-data review remains pending because the current source set contains no external activity or public-footprint inputs.",
      forensicsSummary:
        input.imageObservations.some((item) => /edited|metadata|generative|cropped/i.test(item))
          ? "Submitted image observations include potential manipulation indicators and should be escalated for file-forensics review."
          : "No direct digital-forensics abnormality is evident from the supplied image observations, but original file metadata was not provided for validation.",
      citations: primaryCitations,
    },
    enterpriseOrchestration: {
      systemPersona:
        "Enterprise Claims Orchestration AI (ECO-AI), a read-only co-pilot for P&C and health-related claims operations that prepares analysis, drafts, routing, and API-ready recommendations without making binding claim decisions.",
      humanInLoopNotice:
        "Human adjuster authorization is required for any denial, payment, liability decision, status change, reserve commitment, or outbound communication that affects a live claim record.",
      complianceGuardrails: [
        "Every factual claim and recommendation must remain traceable to supplied source inputs with citations.",
        "Potential exclusions or denials are framed as recommendations for review, never unilateral coverage decisions.",
        "PII and PHI should be minimized in summaries and never disclosed beyond the active adjuster's authorized scope.",
        "State-changing actions must verify prerequisites and current state before any write-back recommendation.",
        "Fraud signals are described objectively as inconsistencies or anomalies, never as proven misconduct.",
      ],
      mcpTools: [
        {
          name: "query_policy_system",
          system: "Guidewire PolicyCenter / equivalent PAS",
          purpose: "Read policy status, limits, deductibles, endorsements, and applicable clause text.",
          mode: "read",
        },
        {
          name: "extract_document_data",
          system: "Multimodal parsing engine",
          purpose: "Extract structured fields and citations from bills, police reports, medical records, and estimates.",
          mode: "read",
        },
        {
          name: "run_fraud_analytics",
          system: "FRISS / Shift / consortium analytics",
          purpose: "Generate anomaly scores and supporting indicators for fraud or network review.",
          mode: "read",
        },
        {
          name: "update_claim_status",
          system: "Duck Creek Claims / Guidewire ClaimCenter",
          purpose: "Write approved status and reserve updates after human authorization and prerequisite checks.",
          mode: "write",
        },
        {
          name: "draft_communication",
          system: "Carrier correspondence service",
          purpose: "Prepare compliant request-for-information, settlement, or status-update drafts for adjuster review.",
          mode: "read_write",
        },
      ],
      workflowStages: [
        {
          stage: "Stage 1: FNOL & Triage",
          objective: "Capture, classify, and route the claim correctly at intake.",
          steps: [
            "Parse FNOL uploads and claimant narrative into structured facts.",
            "Verify policy status, deductibles, and effective coverage on the date of loss.",
            "Generate initial fraud and complexity signals to support routing.",
            "Tag the file as fast-track or complex adjudication based on severity and risk.",
          ],
        },
        {
          stage: "Stage 2: Investigation & Document Review",
          objective: "Reconstruct the file and surface contradictions before adjudication.",
          steps: [
            "Build a chronological treatment or repair timeline from uploaded documents.",
            "Cross-check downstream records against the original FNOL description.",
            "Highlight missing releases, reports, estimates, or source documents.",
            "Flag inconsistencies in damage mechanism, injury reporting, or billing.",
          ],
        },
        {
          stage: "Stage 3: Policy Interpretation & Adjudication Support",
          objective: "Support evidence-to-policy analysis without making the final decision.",
          steps: [
            "Retrieve the exact applicable policy clause or endorsement text.",
            "Compare evidence, coverage terms, and file chronology in a structured analysis.",
            "Summarize potential exclusions or triggers as review recommendations only.",
            "Prepare reserve and workflow recommendations grounded in current claim evidence.",
          ],
        },
        {
          stage: "Stage 4: Settlement & Communication",
          objective: "Prepare adjuster-ready settlement or information-request packages.",
          steps: [
            "Aggregate verified damages, applied deductibles, and reserve posture.",
            "Draft compliant claimant or vendor communications for adjuster review.",
            "Confirm human approval before any suggested write-back or payment action.",
            "Document the file rationale and next checkpoint after correspondence.",
          ],
        },
      ],
      integrationArchitecture: [
        "Event-driven intake from customer portals, core claims systems, or queue/webhook triggers.",
        "Multimodal document parsing for police reports, medical records, repair estimates, and scanned forms.",
        "MCP-backed read and write tools to core systems such as Guidewire, Duck Creek, and third-party analytics.",
        "Error-aware sequencing that understands prerequisites like reserve-before-payment or approval-before-closure.",
        "Centralized governance for traceability, role-based access, and auditability across claim actions.",
      ],
    },
    anomaliesAndRedFlags: anomalies,
    adjusterActionPlan: actionPlan,
    missingInformation,
    traceabilityNote:
      "All synthesized sections are derived only from user-supplied claim inputs. Inline citations point back to the exact provided source item, page, and paragraph where available.",
  };
}

function createAppServer(): McpServer {
  const server = new McpServer(
    { name: "claimgpt", version: "0.2.0" },
    {
      instructions: `ClaimGPT runs an OCCIE-style read-only casualty analysis workflow. Use analyze_claim to produce executive status, impact/liability, medical synthesis, anomalies, and a 3-step adjuster plan with citations anchored to supplied inputs. Then use render_claim_workspace to display the analysis. Do not authorize payment or denial. Direct support requests to ${SUPPORT_URL} or ${SUPPORT_EMAIL}.`,
    }
  );

  registerAppResource(server, "claim-workspace-widget", WIDGET_URI, {}, async () => ({
    contents: [
      {
        uri: WIDGET_URI,
        mimeType: RESOURCE_MIME_TYPE,
        text: WIDGET_HTML,
        _meta: {
          ui: {
            prefersBorder: true,
            domain: APP_DOMAIN,
            csp: {
              connectDomains: [],
              resourceDomains: [],
            },
          },
          "openai/widgetDescription":
            "OCCIE-style casualty claim workspace with executive status, liability view, medical synthesis, red flags, and an adjuster action plan.",
          "openai/widgetDomain": APP_DOMAIN,
          "openai/widgetCSP": {
            connect_domains: [],
            resource_domains: [],
          },
        },
      },
    ],
  }));

  registerAppTool(
    server,
    "analyze_claim",
    {
      title: "Analyze casualty claim",
      description:
        "Use this to evaluate a property, casualty, bodily injury, workers comp, or liability claim and return OCCIE-style executive status, medical synthesis, anomalies, and a 3-step action plan.",
      inputSchema: analyzeClaimInputSchema,
      outputSchema: claimAnalysisSchema.shape,
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        openWorldHint: false,
        idempotentHint: true,
      },
      _meta: {
        "openai/toolInvocation/invoking": "Analyzing claim file",
        "openai/toolInvocation/invoked": "Claim analysis complete",
      },
    },
    async (args) => {
      const analysis = analyzeClaim(args as AnalyzeClaimInput);

      return {
        content: [
          {
            type: "text" as const,
            text:
              `Executive status ready. Severity ${analysis.executiveStatus.severityScore}/100, ` +
              `TIP $${analysis.executiveStatus.totalIncurredPrediction.amount.toLocaleString()}, ` +
              `litigation ${analysis.executiveStatus.litigationProbability}%, fraud ${analysis.executiveStatus.fraudRisk}%.`,
          },
        ],
        structuredContent: analysis,
      };
    }
  );

  registerAppTool(
    server,
    "render_claim_workspace",
    {
      title: "Render OCCIE workspace",
      description:
        "Use this after analyze_claim to render the full ClaimGPT OCCIE workspace with executive status, traceable medical synthesis, anomalies, and next actions.",
      inputSchema: claimAnalysisSchema.shape,
      outputSchema: claimAnalysisSchema.shape,
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        openWorldHint: false,
        idempotentHint: true,
      },
      _meta: {
        ui: { resourceUri: WIDGET_URI },
        "openai/outputTemplate": WIDGET_URI,
        "openai/toolInvocation/invoking": "Opening claim workspace",
        "openai/toolInvocation/invoked": "Claim workspace ready",
      },
    },
    async (analysis) => ({
      content: [
        {
          type: "text" as const,
          text: `Rendered OCCIE workspace for a ${titleCase(analysis.claimType)} claim.`,
        },
      ],
      structuredContent: analysis,
      _meta: {
        claimScoreBand: analysis.executiveStatus.severityBand,
        route: analysis.executiveStatus.route,
      },
    })
  );

  return server;
}

const port = Number(process.env.PORT ?? "8787");
const MCP_PATH = "/mcp";

function createHttpServer() {
  return createServer(async (req, res) => {
  if (!req.url) {
    res.writeHead(400).end("Missing URL");
    return;
  }

  const url = new URL(req.url, "http://" + (req.headers.host ?? "localhost"));
  const isMcpRoute = url.pathname === MCP_PATH || url.pathname.startsWith(MCP_PATH + "/");

  if (req.method === "GET" && url.pathname === "/privacy") {
    res.writeHead(200, { "content-type": "text/html; charset=utf-8" }).end(
      readFileSync(path.join(PUBLIC_DIR, "privacy.html"), "utf8")
    );
    return;
  }

  if (req.method === "GET" && url.pathname === "/support") {
    res.writeHead(200, { "content-type": "text/html; charset=utf-8" }).end(
      readFileSync(path.join(PUBLIC_DIR, "support.html"), "utf8")
    );
    return;
  }

  if (req.method === "GET" && url.pathname === "/enterprise") {
    res.writeHead(200, { "content-type": "text/html; charset=utf-8" }).end(ENTERPRISE_HTML);
    return;
  }

  const staticPublicFile = STATIC_PUBLIC_FILES.get(url.pathname);
  if (req.method === "GET" && staticPublicFile) {
    res.writeHead(200, { "content-type": staticPublicFile.contentType }).end(
      readFileSync(path.join(PUBLIC_DIR, staticPublicFile.fileName), "utf8")
    );
    return;
  }

  if (req.method === "GET" && url.pathname === "/status") {
    res.writeHead(200, { "content-type": "application/json; charset=utf-8" }).end(
      JSON.stringify(
        {
          name: "ClaimGPT",
          status: "ok",
          mode: "OCCIE casualty intelligence",
          mcpPath: MCP_PATH,
          appDomain: APP_DOMAIN,
          supportEmail: SUPPORT_EMAIL,
          privacyUrl: PRIVACY_URL,
          supportUrl: SUPPORT_URL,
        },
        null,
        2
      )
    );
    return;
  }

  if (req.method === "GET" && url.pathname === "/robots.txt") {
    res.writeHead(200, { "content-type": "text/plain; charset=utf-8" }).end(ROBOTS_TXT);
    return;
  }

  if (req.method === "GET" && url.pathname === "/sitemap.xml") {
    res.writeHead(200, { "content-type": "application/xml; charset=utf-8" }).end(SITEMAP_XML);
    return;
  }

  if (req.method === "GET" && url.pathname === "/security.txt") {
    res.writeHead(200, { "content-type": "text/plain; charset=utf-8" }).end(SECURITY_TXT);
    return;
  }

  if (req.method === "GET" && url.pathname === "/.well-known/security.txt") {
    res.writeHead(200, { "content-type": "text/plain; charset=utf-8" }).end(SECURITY_TXT);
    return;
  }

  if (req.method === "GET" && url.pathname === "/.well-known/openai-apps-challenge") {
    res.writeHead(200, { "content-type": "text/plain; charset=utf-8" }).end(
      OPENAI_APPS_CHALLENGE_TOKEN
    );
    return;
  }

  if (req.method === "OPTIONS" && isMcpRoute) {
    res.writeHead(204, {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "POST, GET, DELETE, OPTIONS",
      "Access-Control-Allow-Headers": "content-type, mcp-session-id",
      "Access-Control-Expose-Headers": "Mcp-Session-Id",
    });
    res.end();
    return;
  }

  if (req.method === "GET" && url.pathname === "/") {
    res.writeHead(200, { "content-type": "text/html; charset=utf-8" }).end(LANDING_HTML);
    return;
  }

  if (req.method === "GET" && url.pathname === "/healthz") {
    res.writeHead(200, { "content-type": "application/json; charset=utf-8" }).end(
      JSON.stringify({ status: "ok" })
    );
    return;
  }

  const transportMethods = new Set(["GET", "POST", "DELETE"]);
  if (isMcpRoute && req.method && transportMethods.has(req.method)) {
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("Access-Control-Expose-Headers", "Mcp-Session-Id");

    const server = createAppServer();
    const transport = new StreamableHTTPServerTransport({
      sessionIdGenerator: undefined,
      enableJsonResponse: true,
    });

    res.on("close", () => {
      transport.close();
      server.close();
    });

    try {
      await server.connect(transport);
      await transport.handleRequest(req, res);
    } catch (error) {
      console.error("Failed to handle MCP request:", error);
      if (!res.headersSent) {
        res.writeHead(500).end("Internal server error");
      }
    }
    return;
  }

  res.writeHead(404).end("Not Found");
  });
}

if (import.meta.main) {
  createHttpServer().listen(port, () => {
    console.log("ClaimGPT MCP server listening on http://localhost:" + port + MCP_PATH);
  });
}
