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
  const diagramBudget = want.has("diagram") ? diagramBudgetSummary(ctx) : "";

  const brief: string[] = [];
  if (want.has("test")) {
    brief.push(
      h.specFileExists
        ? `- **### TEST** — append-only Jest block for \`${h.componentKey}\` (mock all deps, cover success/4xx/5xx)`
        : `- **### TEST** — full \`.spec.ts\` for \`${h.componentKey}\` (mock all deps, cover success/4xx/5xx)`
    );
  }
  if (want.has("docs")) {
    brief.push(
      `- **### DOCS** — Markdown doc for \`${h.componentKey}\` (overview, route, request/response, deps, errors)`
    );
  }
  if (want.has("diagram")) {
    brief.push(
      `- **### DIAGRAM** — compact Mermaid flowchart (prefix ids with \`${h.mermaidDiagramId}_\`, ${diagramBudget})`
    );
  }

  return `You are a senior NestJS backend engineer.

${intro}
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

${brief.join("\n")}
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
  const diagramBudget = want.has("diagram") ? diagramBudgetSummary(ctx) : "";

  const brief: string[] = [];
  if (want.has("test")) {
    brief.push(
      h.specFileExists
        ? `- **### TEST** — append-only Jest block for \`${h.componentKey}\` (mock all deps)`
        : `- **### TEST** — full \`.spec.ts\` for \`${h.componentKey}\` (mock all deps)`
    );
  }
  if (want.has("docs")) {
    brief.push(
      `- **### DOCS** — Markdown doc for \`${h.componentKey}\` (overview, public API, deps, data flow, errors)`
    );
  }
  if (want.has("diagram")) {
    brief.push(
      `- **### DIAGRAM** — compact Mermaid flowchart (prefix ids with \`${h.mermaidDiagramId}_\`, ${diagramBudget})`
    );
  }

  return `You are a senior NestJS backend engineer.

${intro}
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

${brief.join("\n")}
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
