import type { ExtractedContext } from "./contextExtractor";

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

function focusBlock(ctx: ExtractedContext): string {
  if (!ctx.focusedMethod) {
    return "";
  }
  const route =
    ctx.kind === "controller" && ctx.focusedRoute
      ? `\nPrimary route: ${ctx.focusedRoute}`
      : "";
  return `
=====================================
SCOPE (strict)

Generate tests, documentation, and diagram **only** for:

- Class: ${ctx.className}
- Method: ${ctx.focusedMethod}${route}

Do not generate coverage for other handlers or methods in this file.
`;
}

function artifactInstructions(h: PromptArtifactHints): string {
  const merge = h.specFileExists
    ? `The spec file **already exists** at \`${h.specRelativePath}\`. Output **append-only** Jest code: one or more nested \`describe(...)\` blocks for this handler/method only. Do **not** output another full file, duplicate top-level \`describe('${h.componentKey.split(".")[0]}')\`, imports, or \`Test.createTestingModule\` unless this block is fully self-contained inside a new inner \`describe\`. Prefer adding a **new** \`describe('${h.componentKey} — …')\` with its own \`beforeEach\` mocks if needed. Never delete or replace existing tests.`
    : `No spec file exists yet at \`${h.specRelativePath}\`. Output a **complete** minimal \`.spec.ts\` for this class (imports + TestingModule + the tests for **this** method/handler). Subsequent runs will use append mode.`;

  return `
=====================================
ARTIFACT TARGETS (use these exact paths in prose; the user will save via editor command)

- **Documentation file (Markdown):** \`${h.docsRelativePath}\`
- **Flow diagram file (Markdown wrapping Mermaid):** \`${h.flowRelativePath}\`
- **Jest spec file:** \`${h.specRelativePath}\`
- **Unique component key:** \`${h.componentKey}\`
- **Unique Mermaid diagram id:** \`${h.mermaidDiagramId}\` (use as the main flowchart id / subgraph prefix to avoid collisions)

${merge}
`;
}

function buildControllerPrompt(
  code: string,
  ctx: ExtractedContext,
  h: PromptArtifactHints
): string {
  const deps = formatList(ctx.dependencies, "(none detected — infer from code)");
  const routes = formatList(ctx.routes, "(none detected — infer from @Get/@Post etc.)");
  const dtos = formatList(ctx.dtos, "(none detected)");
  const methods = formatList(ctx.publicMethods, "(see code)");
  const scope = focusBlock(ctx);
  const art = artifactInstructions(h);

  return `You are a senior NestJS backend engineer.

Your task is to generate 3 outputs:

1. Unit Tests (Jest) — **merge-aware** (see ARTIFACT TARGETS)
2. Documentation (Markdown) — **in-depth**, unique to this component key
3. Flow Diagram (Mermaid) — **deep**, all major child components

STRICT RULES:
- Follow exact output format (### TEST / ### DOCS / ### DIAGRAM only; no extra sections)
- Do not skip any section
${scope}
${art}
=====================================
CONTEXT

Controller Name: ${ctx.className}

Code:
${code}

Constructor / injected dependencies (mock these in tests; show each in diagram):
${deps}

Routes (scoped):
${routes}

DTOs / parameter hints:
${dtos}

Methods (scoped):
${methods}

=====================================
OUTPUT FORMAT

### TEST
\`\`\`ts
${h.specFileExists ? `// APPEND ONLY — nested describe/it for ${h.componentKey} only` : `// FULL .spec.ts if file missing`}
\`\`\`

### DOCS
\`\`\`md
# ${h.componentKey} — API handler

> Saved to: ${h.docsRelativePath}

## Overview
...

## Route & HTTP
...

## Request / response
...

## Validation & DTOs
...

## Auth / guards / interceptors (infer from code or note if unknown)
...

## Child components & call graph
Document each injected dependency (${deps}) and how this handler uses it. Name **concrete** Nest/provider class names.

## Error & edge cases
...

## Related modules (infer)
...

## Manual testing tips
...
\`\`\`

### DIAGRAM
\`\`\`mermaid
flowchart TB
  %% Use diagram id: ${h.mermaidDiagramId}
  %% Unique node ids prefixed: ${h.mermaidDiagramId}_
  subgraph ${h.mermaidDiagramId}_client["Client / API consumer"]
  end
  subgraph ${h.mermaidDiagramId}_http["HTTP / Nest"]
  end
  subgraph ${h.mermaidDiagramId}_app["${ctx.className}"]
  end
  subgraph ${h.mermaidDiagramId}_deps["Injected services & data"]
  end
  %% Connect: client --> HTTP --> controller method --> each dependency --> DB/cache/events as applicable
\`\`\`

=====================================
TEST REQUIREMENTS:

* Use @nestjs/testing where a module is needed; follow merge rules above
* Mock **all** constructor dependencies listed in CONTEXT
* Cover **this** route: success, 4xx validation, 5xx / service failure, auth if applicable

DOC REQUIREMENTS:

* Deep, technical; use **${h.componentKey}** in the title
* Explicitly walk **child** services/repos/guards (from dependencies list and code)
* Mention file path \`${h.docsRelativePath}\` once in an HTML comment or blockquote at top if desired

DIAGRAM REQUIREMENTS:

* **Unique** node/subgraph ids prefixed with \`${h.mermaidDiagramId}_\`
* Include: client → transport → \`${ctx.className}.${ctx.focusedMethod ?? "handler"}\` → **each** injected dependency as its own node → external systems (DB, cache, queue, third-party API) when inferable
* No generic single arrow "Controller --> Service"; name **types** from code
`;
}

function buildServicePrompt(
  code: string,
  ctx: ExtractedContext,
  h: PromptArtifactHints
): string {
  const deps = formatList(ctx.dependencies, "(none detected — infer from code)");
  const methods = formatList(ctx.publicMethods, "(see code)");
  const dtos = formatList(ctx.dtos, "(none detected)");
  const scope = focusBlock(ctx);
  const art = artifactInstructions(h);

  return `You are a senior NestJS backend engineer.

Generate:

1. Jest tests — **merge-aware** (see ARTIFACT TARGETS)
2. Documentation — **in-depth**
3. Mermaid flow — **deep** dependency chain

STRICT RULES:
- Follow exact output format
- Do not add explanations outside sections
- Do not skip any section
${scope}
${art}
=====================================
CONTEXT

Service Name: ${ctx.className}

Code:
${code}

Constructor / injected dependencies:
${deps}

Public methods (scoped):
${methods}

DTO / type hints:
${dtos}

=====================================
OUTPUT FORMAT

### TEST
\`\`\`ts
${h.specFileExists ? `// APPEND ONLY — nested describe/it for ${h.componentKey} only` : `// FULL .spec.ts if file missing`}
\`\`\`

### DOCS
\`\`\`md
# ${h.componentKey} — service method

> Saved to: ${h.docsRelativePath}

## Overview
...

## Public API — ${ctx.focusedMethod ?? "method"}
...

## Dependencies & collaborators
For each: ${deps}

## Data flow & side effects
...

## Error handling & edge cases
...

## How controllers/guards typically call this (infer)
...
\`\`\`

### DIAGRAM
\`\`\`mermaid
flowchart TB
  %% id: ${h.mermaidDiagramId}
  subgraph ${h.mermaidDiagramId}_caller["Callers"]
  end
  subgraph ${h.mermaidDiagramId}_svc["${ctx.className}"]
  end
  subgraph ${h.mermaidDiagramId}_deps["Downstream dependencies"]
  end
\`\`\`

=====================================
Requirements:

* Tests: follow merge rules; mock **all** injected dependencies
* Docs: name all **child** components from constructor and method body
* Diagram: unique \`${h.mermaidDiagramId}_*\` ids; show **each** dependency and external I/O (DB, HTTP client, bus)
`;
}

export function buildPrompt(
  code: string,
  ctx: ExtractedContext,
  hints: PromptArtifactHints
): string {
  return ctx.kind === "controller"
    ? buildControllerPrompt(code, ctx, hints)
    : buildServicePrompt(code, ctx, hints);
}
