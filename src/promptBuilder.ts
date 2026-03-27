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

/**
 * Diagram size scales with constructor dependencies from CONTEXT (AST when available, else regex).
 * Caps keep charts from exploding; min ensures room for entry + method + each injectable.
 */
function diagramSizeBudget(ctx: ExtractedContext): {
  depCount: number;
  nodeMin: number;
  nodeMax: number;
  edgeMax: number;
} {
  const d = Math.max(0, ctx.dependencies.length);
  const nodeMin = Math.max(5, 3 + d);
  const nodeMax = Math.min(
    72,
    Math.max(10, 8 + d * 3 + Math.min(12, d))
  );
  const edgeMax = Math.min(96, Math.ceil(nodeMax * 1.6) + d + 4);
  return { depCount: d, nodeMin, nodeMax, edgeMax };
}

function diagramBudgetSummary(ctx: ExtractedContext): string {
  const { depCount, nodeMin, nodeMax, edgeMax } = diagramSizeBudget(ctx);
  return `target ~${nodeMin}-${nodeMax} nodes, at most ${edgeMax} edges (scaled from ${depCount} constructor dependencies in CONTEXT)`;
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
  want: Set<PromptSection>,
  ctx: ExtractedContext
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
      `- **Unique Mermaid diagram id:** \`${h.mermaidDiagramId}\` (prefix every node id with this to avoid collisions)`
    );
    lines.push(
      "- **Diagram scope:** One **compact** flowchart for **this method only** — full **business logic path** (happy path + real branches in code). Include **every** constructor dependency listed below as a **named node**; add **only** extra nodes for **direct** callees inside the method body. **No** unrelated endpoints, decorative layers, or speculative infra (cache/queue/external API) unless clearly present in the snippet."
    );
    lines.push(
      `- **Diagram size budget:** ${diagramBudgetSummary(ctx)}. Stay within this range while still covering **all** listed dependencies and the real control flow in the snippet.`
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
      `${n++}. Flow Diagram (Mermaid) — **focused** business flow + **all** injected dependencies from CONTEXT`
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
    items.push(
      `${n++}. Mermaid flow — **focused** business logic + **all** injected dependencies from CONTEXT`
    );
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
    return `Constructor / injected dependencies (mock in tests; diagram: **one node per** line below):\n${deps}`;
  }
  if (hasT) {
    return `Constructor / injected dependencies (mock these in tests):\n${deps}`;
  }
  if (hasD) {
    return `Constructor / injected dependencies (diagram: **one node per line below** — use exact type names; no omitted injectables):\n${deps}`;
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
  const art = artifactInstructionsPartial(h, want, ctx);
  const intro = controllerTaskIntro(want);
  const headers = strictHeaderList(want);
  const diagramBudget = want.has("diagram") ? diagramBudgetSummary(ctx) : "";

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
      `  %% ${h.mermaidDiagramId} — ${diagramBudget}`,
      "  %% Order: HTTP entry → this handler method → each DI from CONTEXT → internal steps/branches/return",
      "  %% No empty subgraphs; no speculative DB/cache/queue unless in code",
      `  ${h.mermaidDiagramId}_entry["${ctx.focusedRoute ?? "HTTP request"}"]`,
      `  ${h.mermaidDiagramId}_method["${ctx.className}.${ctx.focusedMethod ?? "handler"}()"]`,
      "  %% link entry --> method, then method --> each injected service/repo (by type name from CONTEXT)",
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
      `* **Unique** node ids: prefix every id with \`${h.mermaidDiagramId}_\``,
      "* **Coverage:** Map **only** the execution path for **this** handler. Start from the HTTP entry (use the focused route if known), then **this method**, then **every** constructor dependency from CONTEXT as its **own** labeled node (use the **injected type** from the list, not generic “Service”).",
      "* **Business logic:** Inside the method, show **real** steps: validation, calls to those deps, conditional branches, throws/returns that appear in the **shown code**. Merge trivial linear steps into one node if it keeps the chart readable.",
      "* **Extra nodes:** Add a node only for a **direct** callee in the method body that is **not** already listed as a constructor dependency (e.g. static util) — keep such extras minimal.",
      `* **Size:** Aim for ${diagramBudget}. **Do not** add unrelated modules, other routes, or speculative external systems unless they are **explicitly** used in the snippet.`,
      "* **No clutter:** No duplicate nodes for the same type; no empty subgraphs; no decorative “client layer” unless it carries a real branch.",
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
  const art = artifactInstructionsPartial(h, want, ctx);
  const intro = serviceTaskIntro(want);
  const headers = strictHeaderList(want);
  const diagramBudget = want.has("diagram") ? diagramBudgetSummary(ctx) : "";

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
      `  %% ${h.mermaidDiagramId} — ${diagramBudget}`,
      "  %% Caller/context (one node) → this method → each DI from CONTEXT → logic branches",
      `  ${h.mermaidDiagramId}_entry["Caller → ${ctx.className}.${ctx.focusedMethod ?? "method"}()"]`,
      "  %% expand: one node per constructor dependency from CONTEXT; then method-body flow",
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
      `* Diagram: prefix all node ids with \`${h.mermaidDiagramId}_\`. **One node per** constructor dependency from CONTEXT (named by **injected type**). Show **this method's** business flow only — branches/returns from the **shown code**. Aim for ${diagramBudget}. **No** speculative DB/HTTP/bus nodes unless clearly present in the snippet.`,
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
