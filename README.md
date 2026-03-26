# Flowgenix

**Flowgenix** is a **Cursor** and **VS Code** extension for **NestJS** backends. It adds a **CodeLens** on each HTTP handler (controllers) and each **public** method (services). One click builds a **structured prompt** for your AI assistant: **Jest tests**, **Markdown documentation**, and a **Mermaid** flow diagram—scoped to that single route or method, not the whole file.

---

## Why it exists

Nest projects accumulate controllers and services fast. Writing and maintaining **tests**, **docs**, and **diagrams** for every endpoint and service method is repetitive, easy to defer, and often drifts out of sync with the code. Generic “generate tests for this file” prompts are noisy: they lack route context, DI hints, and a clear boundary, so models hallucinate or overwrite good work.

Flowgenix is built for the case where you already use **AI in the editor** but want **repeatable, scoped** output that matches how Nest is structured (decorators, modules, providers).

---

## How it helps

- **Per-target focus** — Each lens targets **one** handler or **one** service method. Prompts include scoped context (routes, dependencies, DTO-style hints when the TypeScript AST can resolve them) so the model stays on that unit of behavior.

- **Predictable output shape** — Prompts ask for fixed sections (`### TEST`, `### DOCS`, `### DIAGRAM`) so answers are easier to skim, compare, and **parse** into your repo.

- **Fits real workflows** — You can send the prompt through **chat**, **clipboard**, or (where supported) **`vscode.lm`**. After you get a reply, a **save artifacts** command can write **Markdown** under configurable folders (e.g. `docs/`, `flow/`) and **merge** generated tests into `test/<name>.spec.ts` next to that controller or service file (the `test/` folder is created if needed).

- **Works where you already code** — Same extension host as your Nest repo; no separate doc tool or diagram editor required for the initial pass.

In short: **less boilerplate thinking**, **clearer prompts**, and **artifacts that land in your tree** in a way that matches how teams actually maintain Nest services over time.

---

## Reviews & stars

If Flowgenix saves you time, a quick **rating or review** on the registry helps others find it, and a **star** on GitHub helps signal that the project is useful.

- **Open VSX** (Cursor / many VS Code–based editors): [Flowgenix — rate & review](https://open-vsx.org/extension/mdozairq/Flowgenix)
- **GitHub**: [Star the repository](https://github.com/mdozairq/Flowgenix)
