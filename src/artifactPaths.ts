import * as path from "path";

/** Safe single segment for filenames (class or method). */
export function sanitizeFilePart(s: string): string {
  const t = s.replace(/[^\w.-]+/gu, "_").replace(/^_+|_+$/gu, "");
  return t.length > 0 ? t : "component";
}

export function componentKey(className: string, methodName: string): string {
  return `${className}.${methodName}`;
}

/** e.g. docs/CatsController.findAll.md */
export function docsArtifactRelative(
  docsDir: string,
  className: string,
  methodName: string
): string {
  const key = `${sanitizeFilePart(className)}.${sanitizeFilePart(methodName)}`;
  return path.join(docsDir, `${key}.md`);
}

/** e.g. flow/CatsController.findAll.md (markdown wrapping mermaid) */
export function flowArtifactRelative(
  flowDir: string,
  className: string,
  methodName: string
): string {
  const key = `${sanitizeFilePart(className)}.${sanitizeFilePart(methodName)}`;
  return path.join(flowDir, `${key}.md`);
}

/**
 * Spec file next to the source file, under a sibling `test/` directory
 * (e.g. `src/cats/cats.controller.ts` → `src/cats/test/cats.controller.spec.ts`).
 */
export function specPathInSourceTestDir(sourceTsPath: string): string {
  const dir = path.dirname(sourceTsPath);
  const base = path.basename(sourceTsPath, ".ts");
  return path.join(dir, "test", `${base}.spec.ts`);
}

/** Paths relative to workspace folder root (POSIX-style for display in prompts). */
export function toWorkspaceRelative(
  workspaceRoot: string,
  absolutePath: string
): string {
  const rel = path.relative(workspaceRoot, absolutePath);
  return rel.split(path.sep).join("/");
}
