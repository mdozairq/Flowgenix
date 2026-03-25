# Flowgenix (Cursor / VS Code)

Extension manifest **`icon`**: `flowgenix-logo.png` (128×128 PNG for the Marketplace). A higher-res copy is kept as `flowgenix-logo@1024.png` if you need it for marketing or the README.

CodeLens on Nest **controllers** and **services** builds a **structured prompt** (Jest + Markdown + Mermaid) and sends it via **chat / clipboard / LM** (see settings). Output sections are enforced in the prompt: `### TEST`, `### DOCS`, `### DIAGRAM`.

**Implementation deep-dive (architecture, UML, references):** see `docs/IMPLEMENTATION.md` in the repository (no relative URL in README avoids `vsce package` link-rewrite errors when `repository` is unset).

## How others can use it

### Option A — Install a `.vsix` (simplest for teammates)

1. Maintainer runs `npm install` and **`npm run package`** (or **`npm run vsce:package`**) in this repo — **not** bare `vsce package`, which omits required flags. Produces `Flowgenix-<version>.vsix` (or whatever `name` is in `package.json`).
2. Share the `.vsix` (Slack, Drive, GitHub Releases).
3. Recipient: **Extensions** → **⋯** → **Install from VSIX…** → pick the file.
4. Reload the window if prompted.

Works in **VS Code** and **Cursor** (both support VSIX installs).

### Option B — Open VSX / marketplace (wider distribution)

- Publish to the [Open VSX Registry](https://open-vsx.org/) or the [Visual Studio Marketplace](https://marketplace.visualstudio.com/).
- You need a real **`publisher`** id in `package.json` (replace `"local"`), plus publisher accounts and tokens. Use `npx @vscode/vsce publish` (Marketplace) or `npx ovsx publish` (Open VSX).

### Option C — Run from source (contributors)

1. Clone the repo and `npm install`.
2. Open the folder in VS Code / Cursor.
3. **Run and Debug** → **Run Extension** (F5) to launch an Extension Development Host with the extension loaded.

## Using the extension

1. Open a Nest TypeScript file (saved on disk).
2. Ensure **Editor: Code Lens** is enabled.
3. Find a CodeLens **above each API**:
   - **Controllers:** one lens per method that has an HTTP decorator (`@Get`, `@Post`, …). Title looks like **`Generate: GET /cats`**.
   - **Services:** one lens per **public** method (same `*Service` / `*.service.ts` / `@Injectable` rules as before). Title looks like **`Generate: UsersService.findOne`**.
4. Click a lens → by default the extension tries to **focus Cursor chat, paste the prompt, and optionally auto-submit** (see settings below). The prompt stays on the **clipboard** as a fallback.
5. When the model answers, **paste the full reply** into an editor tab (or select only the reply), then run **NestJS Generator: Save artifacts from chat response** (`nestjs.saveArtifacts`). If the active editor is empty, the command uses the **clipboard** instead.

**What gets written (in your Nest workspace root)**

| Output | Path pattern | Behavior |
|--------|----------------|----------|
| Docs | `{artifactsDocsDir}/{Class}.{method}.md` | New file per handler (default dir: `docs/`). |
| Flow | `{artifactsFlowDir}/{Class}.{method}.md` | Markdown wrapping a **Mermaid** diagram (default dir: `flow/`). |
| Tests | Next to source: `same-basename.spec.ts` | If the spec file **already exists**, new `### TEST` code is **appended** after a `// --- nestjs-generator:append:Class.method ---` banner (no wholesale replace). If missing, a new spec file is created. |

The prompt tells the model to output **append-only** tests when the spec already exists, and deeper docs/diagrams with **unique Mermaid ids** (`NG_Class_method_…`).

**Command palette:** run **NestJS Generator: Generate Tests + Docs + Diagram** with the file focused. If there is **one** handler/method, it is used automatically; if **several**, a **Quick Pick** lists `ClassName › GET /path` or `ClassName › methodName()`.

### Settings

| Setting | Default | Meaning |
|--------|---------|--------|
| `nestjs-generator.maxSourceCharacters` | `0` | Cap how much source is **embedded** in the prompt (snippet centered on the **handler / method**). `0` = full file. AST/context extraction still uses the **entire** document. |
| `nestjs-generator.promptDelivery` | `openChat` | `openChat` = focus chat + paste + optional submit (best effort). `clipboard` = copy only. `languageModel` = `vscode.lm` → new editor (if your host exposes models). |
| `nestjs-generator.chatFocusCommands` | `["aichat.newchataction"]` | Command IDs run before paste. Cursor changes these over time — use **Keyboard Shortcuts**, find **Open Chat** / **New Chat**, right‑click → **Copy Command ID**, and paste into this array. |
| `nestjs-generator.chatPasteCommand` | `editor.action.clipboardPasteAction` | Paste after focus (chat input must be focused). |
| `nestjs-generator.chatSubmitCommand` | _(empty)_ | If set, run after paste (e.g. try `workbench.action.chat.stopListeningAndSubmit` when listed). If empty, press **Enter** yourself. |
| `nestjs-generator.chatPasteDelayMs` / `chatSubmitDelayMs` | `350` / `120` | Timing between steps; increase if paste hits the wrong panel. |
| `nestjs-generator.artifactsDocsDir` | `docs` | Folder for generated Markdown docs. |
| `nestjs-generator.artifactsFlowDir` | `flow` | Folder for generated flow Markdown (Mermaid inside). |

## What changed in v0.2

- **Hybrid context**: [TypeScript Compiler API](https://github.com/microsoft/TypeScript/wiki/Using-the-Compiler-API) extracts routes (including `@Controller` prefix + method paths), constructor dependencies, parameter decorators (`@Body` / `@Query` / `@Param` / `@Headers`), and public methods. If the class cannot be resolved in the AST, the extension falls back to the earlier regex heuristics.

## What changed in v0.3

- **Quick Pick** when using the command from the palette and the file has multiple Nest targets.
- **`nestjs-generator.maxSourceCharacters`** to limit embedded source size for huge files (full file still used for extraction).

## What changed in v0.4

- CodeLens is **per HTTP handler** on controllers and **per public method** on services (not one lens for the whole class).
- Prompts include a **SCOPE** block so the model targets **only** that route or method; context lists (routes, DTO hints, methods) are **scoped** accordingly when the TypeScript AST is used.

## What changed in v0.5

- Default flow **opens/focuses AI chat, pastes the prompt, and optionally runs a submit command** (configurable). Cursor does not publish a stable extension API for chat; tune **`chatFocusCommands`** / **`chatSubmitCommand`** if your build behaves differently.
- Optional **`promptDelivery`: `languageModel`** uses **`vscode.lm`** and opens the model reply in a new Markdown tab (when the editor exposes chat models).

## What changed in v0.6

- **Save artifacts** command: writes docs + flow files under configurable **`docs/`** and **`flow/`**, and **merges** `### TEST` into the existing `*.spec.ts` when present.
- Prompts refined for **append-only** Jest output, **deeper** documentation, and **richer** Mermaid (child dependencies, unique diagram ids).

## Roadmap (from PRD)

- **Done**: Phase 1 (clipboard + Cursor), Phase 2 (AST-backed context), palette + source cap (v0.3), per-handler lenses (v0.4), chat delivery (v0.5), save-to-workspace + merge prompts (v0.6).
- **Next**: optional backend + LLM API, smarter AST merge of tests, test runner / CI hooks.

## Packaging locally

```bash
npm install
npm run compile
npm run package
```

This produces `<name>-<version>.vsix` from `package.json` (~4–5 MB because **`typescript` is bundled**). Scripts **`npm run package`** and **`npm run vsce:package`** pass: secret-scan workaround, **`--no-rewrite-relative-links`**, and **`--allow-missing-repository`**. Plain **`vsce package`** skips those and often fails on README links. `package.json` includes **`repository`**, **`bugs`**, and **`homepage`** for the Marketplace and `vsce` (update the GitHub URLs if your repo name or org is different from `mdozairq/Flowgenix`).

To run `vsce` yourself (it is not on your global `PATH`), use **`npx vsce …`** from this folder, or **`npm run vsce -- …`** (example: `npm run vsce -- ls --tree`).

Install the generated `.vsix` as in Option A. Add `*.vsix` to `.gitignore` if you do not want binaries in git; use **GitHub Releases** (or similar) to share builds.
