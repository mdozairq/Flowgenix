import type { ExtractedContext } from "./contextExtractor";
import {
  ALL_PROMPT_SECTIONS,
  type PromptSection,
} from "./promptSections";

function formatList(items: string[], empty: string): string {
  if (items.length === 0) {
    return empty;
  }
  return items.map((s) => `- ${s}`).join("\n");
}

/** Injected into prompts so the model names files and merge strategy correctly. */
export interface PromptArtifactHints {
  componentKey: string;
  /** Mermaid-safe id, e.g. CatsController_findAll */
  mermaidDiagramId: string;
  docsRelativePath: string;
  flowRelativePath: string;
  specRelativePath: string;
  specFileExists: boolean;
}

function toWantSet(sections?: readonly PromptSection[]): Set<PromptSection> {
  if (sections === undefined || sections.length === 0) {
    return new Set(ALL_PROMPT_SECTIONS);
  }
  return new Set(sections);
}

function strictHeaderList(want: Set<PromptSection>): string {
  return [
    want.has("test") && "### TEST",
    want.has("docs") && "### DOCS",
    want.has("diagram") && "### DIAGRAM",
  ]
    .filter(Boolean)
    .join(", ");
}

function focusBlock(ctx: ExtractedContext, want: Set<PromptSection>): string {
  if (!ctx.focusedMethod) {
    return "";
  }
  const route =
    ctx.kind === "controller" && ctx.focusedRoute
      ? `\nPrimary route: ${ctx.focusedRoute}`
      : "";
  const labels: string[] = [];
  if (want.has("test")) {
    labels.push("tests");
  }
  if (want.has("docs")) {
    labels.push("documentation");
  }
  if (want.has("diagram")) {
    labels.push("flow diagram");
  }
  const what = labels.join(", ");
  return `
=====================================
SCOPE (strict)

Generate ${what} **only** for:

- Class: ${ctx.className}
- Method: ${ctx.focusedMethod}${route}

Do not generate coverage for other handlers or methods in this file.
`;
}

function artifactInstructionsPartial(
  h: PromptArtifactHints,
  want: Set<PromptSection>
): string {
  const lines: string[] = [
    "=====================================",
    "ARTIFACT TARGETS (use these exact paths in prose; the user will save via editor command)",
    "",
  ];

  if (want.has("docs")) {
    lines.push(`- **Documentation file (Markdown):** \`${h.docsRelativePath}\``);
  }
  if (want.has("diagram")) {
    lines.push(
      `- **Flow diagram file (Markdown wrapping Mermaid):** \`${h.flowRelativePath}\``
    );
  }
  if (want.has("test")) {
    lines.push(`- **Jest spec file:** \`${h.specRelativePath}\``);
  }
  lines.push(`- **Unique component key:** \`${h.componentKey}\``);
  if (want.has("diagram")) {
    lines.push(
      `- **Unique Mermaid diagram id:** \`${h.mermaidDiagramId}\` (use as the main flowchart id / subgraph prefix to avoid collisions)`
    );
  }

  if (want.has("test")) {
    const merge = h.specFileExists
      ? `The spec file **already exists** at \`${h.specRelativePath}\`. Output **append-only** Jest code: one or more nested \`describe(...)\` blocks for this handler/method only. Do **not** output another full file, duplicate top-level \`describe('${h.componentKey.split(".")[0]}')\`, imports, or \`Test.createTestingModule\` unless this block is fully self-contained inside a new inner \`describe\`. Prefer adding a **new** \`describe('${h.componentKey} — …')\` with its own \`beforeEach\` mocks if needed. Never delete or replace existing tests.`
      : `No spec file exists yet at \`${h.specRelativePath}\`. Output a **complete** minimal \`.spec.ts\` for this class (imports + TestingModule + the tests for **this** method/handler). Subsequent runs will use append mode.`;
    lines.push("", merge);
  }

  lines.push("");
  return lines.join("\n");
}

function controllerTaskIntro(want: Set<PromptSection>): string {
  const items: string[] = [];
  let n = 1;
  if (want.has("test")) {
    items.push(
      `${n++}. Unit Tests (Jest) — **merge-aware** (see ARTIFACT TARGETS)`
    );
  }
  if (want.has("docs")) {
    items.push(
      `${n++}. Documentation (Markdown) — **in-depth**, unique to this component key`
    );
  }
  if (want.has("diagram")) {
    items.push(
      `${n++}. Flow Diagram (Mermaid) — **deep**, all major child components`
    );
  }
  const count = items.length;
  return `Your task is to generate ${count} output${count === 1 ? "" : "s"}:\n\n${items.join("\n")}`;
}

function serviceTaskIntro(want: Set<PromptSection>): string {
  const items: string[] = [];
  let n = 1;
  if (want.has("test")) {
    items.push(`${n++}. Jest tests — **merge-aware** (see ARTIFACT TARGETS)`);
  }
  if (want.has("docs")) {
    items.push(`${n++}. Documentation — **in-depth**`);
  }
  if (want.has("diagram")) {
    items.push(`${n++}. Mermaid flow — **deep** dependency chain`);
  }
  const count = items.length;
  return `Generate ${count} output${count === 1 ? "" : "s"}:\n\n${items.join("\n")}`;
}

function dependencyContextLine(
  deps: string,
  want: Set<PromptSection>
): string {
  const hasT = want.has("test");
  const hasD = want.has("diagram");
  if (hasT && hasD) {
    return `Constructor / injected dependencies (mock these in tests; show each in diagram):\n${deps}`;
  }
  if (hasT) {
    return `Constructor / injected dependencies (mock these in tests):\n${deps}`;
  }
  if (hasD) {
    return `Constructor / injected dependencies (include in the diagram):\n${deps}`;
  }
  return `Constructor / injected dependencies:\n${deps}`;
}

function buildControllerPrompt(
  code: string,
  ctx: ExtractedContext,
  h: PromptArtifactHints,
  want: Set<PromptSection>
): string {
  const deps = formatList(ctx.dependencies, "(none detected — infer from code)");
  const routes = formatList(ctx.routes, "(none detected — infer from @Get/@Post etc.)");
  const dtos = formatList(ctx.dtos, "(none detected)");
  const methods = formatList(ctx.publicMethods, "(see code)");
  const scope = focusBlock(ctx, want);
  const art = artifactInstructionsPartial(h, want);
  const intro = controllerTaskIntro(want);
  const headers = strictHeaderList(want);

  const outFmt: string[] = ["=====================================", "OUTPUT FORMAT", ""];

  if (want.has("test")) {
    outFmt.push(
      "### TEST",
      "```ts",
      h.specFileExists
        ? `// APPEND ONLY — nested describe/it for ${h.componentKey} only`
        : "// FULL .spec.ts if file missing",
      "```",
      ""
    );
  }
  if (want.has("docs")) {
    outFmt.push(
      "### DOCS",
      "```md",
      `# ${h.componentKey} — API handler`,
      "",
      `> Saved to: ${h.docsRelativePath}`,
      "",
      "## Overview",
      "...",
      "",
      "## Route & HTTP",
      "...",
      "",
      "## Request / response",
      "...",
      "",
      "## Validation & DTOs",
      "...",
      "",
      "## Auth / guards / interceptors (infer from code or note if unknown)",
      "...",
      "",
      "## Child components & call graph",
      `Document each injected dependency (${deps}) and how this handler uses it. Name **concrete** Nest/provider class names.`,
      "",
      "## Error & edge cases",
      "...",
      "",
      "## Related modules (infer)",
      "...",
      "",
      "## Manual testing tips",
      "...",
      "```",
      ""
    );
  }
  if (want.has("diagram")) {
    outFmt.push(
      "### DIAGRAM",
      "```mermaid",
      "flowchart TB",
      `  %% Use diagram id: ${h.mermaidDiagramId}`,
      `  %% Unique node ids prefixed: ${h.mermaidDiagramId}_`,
      `  subgraph ${h.mermaidDiagramId}_client["Client / API consumer"]`,
      "  end",
      `  subgraph ${h.mermaidDiagramId}_http["HTTP / Nest"]`,
      "  end",
      `  subgraph ${h.mermaidDiagramId}_app["${ctx.className}"]`,
      "  end",
      `  subgraph ${h.mermaidDiagramId}_deps["Injected services & data"]`,
      "  end",
      "  %% Connect: client --> HTTP --> controller method --> each dependency --> DB/cache/events as applicable",
      "```",
      ""
    );
  }

  const req: string[] = ["====================================="];
  if (want.has("test")) {
    req.push(
      "TEST REQUIREMENTS:",
      "",
      "* Use @nestjs/testing where a module is needed; follow merge rules above",
      "* Mock **all** constructor dependencies listed in CONTEXT",
      "* Cover **this** route: success, 4xx validation, 5xx / service failure, auth if applicable",
      ""
    );
  }
  if (want.has("docs")) {
    req.push(
      "DOC REQUIREMENTS:",
      "",
      `* Deep, technical; use **${h.componentKey}** in the title`,
      "* Explicitly walk **child** services/repos/guards (from dependencies list and code)",
      `* Mention file path \`${h.docsRelativePath}\` once in an HTML comment or blockquote at top if desired`,
      ""
    );
  }
  if (want.has("diagram")) {
    req.push(
      "DIAGRAM REQUIREMENTS:",
      "",
      `* **Unique** node/subgraph ids prefixed with \`${h.mermaidDiagramId}_\``,
      `* Include: client → transport → \`${ctx.className}.${ctx.focusedMethod ?? "handler"}\` → **each** injected dependency as its own node → external systems (DB, cache, queue, third-party API) when inferable`,
      '* No generic single arrow "Controller --> Service"; name **types** from code',
      ""
    );
  }

  return `You are a senior NestJS backend engineer.

${intro}

STRICT RULES:
- Follow exact output format (${headers} only; no extra sections)
- Do not add explanations outside those sections
- Include every section listed above — do not omit any
${scope}
${art}
=====================================
CONTEXT

Controller Name: ${ctx.className}

Code:
${code}

${dependencyContextLine(deps, want)}

Routes (scoped):
${routes}

DTOs / parameter hints:
${dtos}

Methods (scoped):
${methods}

${outFmt.join("\n")}
${req.join("\n")}
`;
}

function buildServicePrompt(
  code: string,
  ctx: ExtractedContext,
  h: PromptArtifactHints,
  want: Set<PromptSection>
): string {
  const deps = formatList(ctx.dependencies, "(none detected — infer from code)");
  const methods = formatList(ctx.publicMethods, "(see code)");
  const dtos = formatList(ctx.dtos, "(none detected)");
  const scope = focusBlock(ctx, want);
  const art = artifactInstructionsPartial(h, want);
  const intro = serviceTaskIntro(want);
  const headers = strictHeaderList(want);

  const outFmt: string[] = ["=====================================", "OUTPUT FORMAT", ""];

  if (want.has("test")) {
    outFmt.push(
      "### TEST",
      "```ts",
      h.specFileExists
        ? `// APPEND ONLY — nested describe/it for ${h.componentKey} only`
        : "// FULL .spec.ts if file missing",
      "```",
      ""
    );
  }
  if (want.has("docs")) {
    outFmt.push(
      "### DOCS",
      "```md",
      `# ${h.componentKey} — service method`,
      "",
      `> Saved to: ${h.docsRelativePath}`,
      "",
      "## Overview",
      "...",
      "",
      `## Public API — ${ctx.focusedMethod ?? "method"}`,
      "...",
      "",
      "## Dependencies & collaborators",
      `For each: ${deps}`,
      "",
      "## Data flow & side effects",
      "...",
      "",
      "## Error handling & edge cases",
      "...",
      "",
      "## How controllers/guards typically call this (infer)",
      "...",
      "```",
      ""
    );
  }
  if (want.has("diagram")) {
    outFmt.push(
      "### DIAGRAM",
      "```mermaid",
      "flowchart TB",
      `  %% id: ${h.mermaidDiagramId}`,
      `  subgraph ${h.mermaidDiagramId}_caller["Callers"]`,
      "  end",
      `  subgraph ${h.mermaidDiagramId}_svc["${ctx.className}"]`,
      "  end",
      `  subgraph ${h.mermaidDiagramId}_deps["Downstream dependencies"]`,
      "  end",
      "```",
      ""
    );
  }

  const req: string[] = ["=====================================", "Requirements:", ""];
  if (want.has("test")) {
    req.push("* Tests: follow merge rules; mock **all** injected dependencies", "");
  }
  if (want.has("docs")) {
    req.push(
      "* Docs: name all **child** components from constructor and method body",
      ""
    );
  }
  if (want.has("diagram")) {
    req.push(
      `* Diagram: unique \`${h.mermaidDiagramId}_*\` ids; show **each** dependency and external I/O (DB, HTTP client, bus)`,
      ""
    );
  }

  return `You are a senior NestJS backend engineer.

${intro}

STRICT RULES:
- Follow exact output format (${headers} only; no extra sections)
- Do not add explanations outside those sections
- Include every section listed above — do not omit any
${scope}
${art}
=====================================
CONTEXT

Service Name: ${ctx.className}

Code:
${code}

${dependencyContextLine(deps, want)}

Public methods (scoped):
${methods}

DTO / type hints:
${dtos}

${outFmt.join("\n")}
${req.join("\n")}
`;
}

export function buildPrompt(
  code: string,
  ctx: ExtractedContext,
  hints: PromptArtifactHints,
  sections?: readonly PromptSection[]
): string {
  const want = toWantSet(sections);
  return ctx.kind === "controller"
    ? buildControllerPrompt(code, ctx, hints, want)
    : buildServicePrompt(code, ctx, hints, want);
}
