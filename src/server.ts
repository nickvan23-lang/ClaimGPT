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
const WIDGET_URI = "ui://widget/claim-workspace-v1.html";
const WIDGET_HTML = readFileSync(
  path.join(ROOT_DIR, "public", "widget.html"),
  "utf8"
);
const LANDING_HTML = readFileSync(
  path.join(ROOT_DIR, "public", "index.html"),
  "utf8"
);
const APP_DOMAIN = process.env.CLAIMGPT_PUBLIC_DOMAIN ?? "https://claim-gpt.com";
const SUPPORT_EMAIL = process.env.CLAIMGPT_SUPPORT_EMAIL ?? "support@claim-gpt.com";
const SUPPORT_URL = process.env.CLAIMGPT_SUPPORT_URL ?? `${APP_DOMAIN}/support`;
const PRIVACY_URL = process.env.CLAIMGPT_PRIVACY_URL ?? `${APP_DOMAIN}/privacy`;
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

const severityEnum = z.enum(["low", "moderate", "high"]);
const statusEnum = z.enum(["new", "triage", "awaiting-docs", "ready-for-adjuster"]);

const claimAnalysisSchema = z.object({
  claimType: z.string(),
  severity: severityEnum,
  status: statusEnum,
  summary: z.string(),
  recommendedActions: z.array(z.string()),
  missingInformation: z.array(z.string()),
  fraudSignals: z.array(z.string()),
  confidence: z.number(),
});

type ClaimAnalysis = z.infer<typeof claimAnalysisSchema>;

function analyzeClaimNarrative(
  claimType: string,
  narrative: string,
  evidenceCount: number
): ClaimAnalysis {
  const text = narrative.toLowerCase();
  const fraudSignals: string[] = [];
  const missingInformation: string[] = [];
  const recommendedActions: string[] = [];

  if (text.includes("stolen") || text.includes("theft")) {
    recommendedActions.push("Confirm police report details and loss timeline.");
  }

  if (text.includes("injury") || text.includes("hospital") || text.includes("ambulance")) {
    recommendedActions.push("Route to bodily injury review and reserve planning.");
  }

  if (text.includes("water") || text.includes("flood") || text.includes("leak")) {
    recommendedActions.push("Verify mitigation steps and date of first damage.");
  }

  if (text.includes("cash only") || text.includes("urgent payout")) {
    fraudSignals.push("Pressure for rapid payout before file validation.");
  }

  if (text.includes("changed story") || text.includes("different story")) {
    fraudSignals.push("Narrative inconsistency detected in claimant description.");
  }

  if (narrative.trim().length < 120) {
    missingInformation.push("Detailed incident narrative.");
  }

  if (evidenceCount === 0) {
    missingInformation.push("Supporting evidence such as photos, invoices, or reports.");
  }

  if (!text.match(/\b(january|february|march|april|may|june|july|august|september|october|november|december|\d{1,2}\/\d{1,2}\/\d{2,4})\b/)) {
    missingInformation.push("Exact incident date.");
  }

  const severity: ClaimAnalysis["severity"] =
    text.includes("injury") || text.includes("fire") || text.includes("total loss")
      ? "high"
      : evidenceCount >= 3
        ? "moderate"
        : "low";

  const status: ClaimAnalysis["status"] =
    missingInformation.length > 1
      ? "awaiting-docs"
      : severity === "high"
        ? "ready-for-adjuster"
        : "triage";

  if (recommendedActions.length === 0) {
    recommendedActions.push("Run standard policy coverage and deductible validation.");
  }

  if (missingInformation.length === 0) {
    recommendedActions.push("Prepare file for adjuster assignment.");
  }

  const confidence = Math.max(0.52, Math.min(0.94, 0.66 + evidenceCount * 0.06 - fraudSignals.length * 0.04));

  return {
    claimType,
    severity,
    status,
    summary:
      severity === "high"
        ? "High-touch claim. Escalate quickly and verify coverage, injuries, and reserve assumptions."
        : missingInformation.length > 0
          ? "Claim can be triaged automatically, but the file is incomplete and needs more documentation."
          : "Claim appears suitable for streamlined intake and adjuster-ready packaging.",
    recommendedActions,
    missingInformation,
    fraudSignals,
    confidence: Number(confidence.toFixed(2)),
  };
}

function createAppServer(): McpServer {
  const server = new McpServer(
    { name: "claimgpt", version: "0.1.0" },
    {
      instructions:
        `ClaimGPT helps triage insurance claims. Call analyze_claim before render_claim_workspace so the widget receives structured claim analysis. For support, direct users to ${SUPPORT_URL} or ${SUPPORT_EMAIL}.`,
    }
  );

  registerAppResource(
    server,
    "claim-workspace-widget",
    WIDGET_URI,
    {},
    async () => ({
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
              "Interactive ClaimGPT workspace for claim triage, missing-document review, and next-step recommendations.",
            "openai/widgetDomain": APP_DOMAIN,
            "openai/widgetCSP": {
              connect_domains: [],
              resource_domains: [],
            },
          },
        },
      ],
    })
  );

  registerAppTool(
    server,
    "analyze_claim",
    {
      title: "Analyze claim",
      description:
        "Use this when you need a structured AI triage of an insurance claim narrative before deciding what to do next.",
      inputSchema: {
        claimType: z.string().describe("Type of claim, such as auto, property, or workers comp."),
        narrative: z.string().describe("Claim intake narrative or adjuster summary."),
        evidenceCount: z
          .number()
          .int()
          .min(0)
          .max(25)
          .default(0)
          .describe("Number of supporting artifacts already attached to the file."),
      },
      outputSchema: claimAnalysisSchema.shape,
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        openWorldHint: false,
        idempotentHint: true,
      },
      _meta: {
        "openai/toolInvocation/invoking": "Reviewing claim",
        "openai/toolInvocation/invoked": "Claim review complete",
      },
    },
    async ({ claimType, narrative, evidenceCount }) => {
      const analysis = analyzeClaimNarrative(claimType, narrative, evidenceCount);

      return {
        content: [
          {
            type: "text" as const,
            text: `Claim triage complete. Severity: ${analysis.severity}. Status: ${analysis.status}.`,
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
      title: "Render claim workspace",
      description:
        "Use this when you want to display ClaimGPT's claim triage workspace. Call analyze_claim first, then pass its structured results into this tool.",
      inputSchema: claimAnalysisSchema.shape,
      outputSchema: {
        headline: z.string(),
        subhead: z.string(),
        claimType: z.string(),
        severity: severityEnum,
        status: statusEnum,
        summary: z.string(),
        confidence: z.number(),
        recommendedActions: z.array(z.string()),
        missingInformation: z.array(z.string()),
        fraudSignals: z.array(z.string()),
      },
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        openWorldHint: false,
        idempotentHint: true,
      },
      _meta: {
        ui: { resourceUri: WIDGET_URI },
        "openai/outputTemplate": WIDGET_URI,
        "openai/toolInvocation/invoking": "Opening ClaimGPT",
        "openai/toolInvocation/invoked": "ClaimGPT ready",
      },
    },
    async (analysis) => ({
      content: [
        {
          type: "text" as const,
          text: `Rendered ClaimGPT workspace for a ${analysis.claimType} claim.`,
        },
      ],
      structuredContent: {
        headline: "ClaimGPT",
        subhead: "AI-assisted claim triage workspace",
        ...analysis,
      },
      _meta: {
        claimScoreBand:
          analysis.severity === "high"
            ? "Escalate"
            : analysis.missingInformation.length > 0
              ? "Collect docs"
              : "Ready",
      },
    })
  );

  return server;
}

const port = Number(process.env.PORT ?? "8787");
const MCP_PATH = "/mcp";

createServer(async (req, res) => {
  if (!req.url) {
    res.writeHead(400).end("Missing URL");
    return;
  }

  const url = new URL(req.url, "http://" + (req.headers.host ?? "localhost"));
  const isMcpRoute = url.pathname === MCP_PATH || url.pathname.startsWith(MCP_PATH + "/");

  if (req.method === "GET" && url.pathname === "/privacy") {
    res.writeHead(200, { "content-type": "text/html; charset=utf-8" }).end(
      readFileSync(path.join(ROOT_DIR, "public", "privacy.html"), "utf8")
    );
    return;
  }

  if (req.method === "GET" && url.pathname === "/support") {
    res.writeHead(200, { "content-type": "text/html; charset=utf-8" }).end(
      readFileSync(path.join(ROOT_DIR, "public", "support.html"), "utf8")
    );
    return;
  }

  if (req.method === "GET" && url.pathname === "/status") {
    res.writeHead(200, { "content-type": "application/json; charset=utf-8" }).end(
      JSON.stringify(
        {
          name: "ClaimGPT",
          status: "ok",
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
}).listen(port, () => {
  console.log("ClaimGPT MCP server listening on http://localhost:" + port + MCP_PATH);
});
