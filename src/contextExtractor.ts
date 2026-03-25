/**
 * Nest context: TypeScript AST when possible, regex fallback.
 */

import { tryBuildExtractedContextFromAst } from "./astContextExtractor";

export type NestComponentKind = "controller" | "service";

export interface ExtractedContext {
  className: string;
  kind: NestComponentKind;
  dependencies: string[];
  routes: string[];
  dtos: string[];
  publicMethods: string[];
  /** When set, prompts target this handler / method only */
  focusedMethod?: string;
  /** Controller: primary route line e.g. GET /api/cats */
  focusedRoute?: string;
}

const DECORATOR_LOOKBACK = 3500;

function textBeforeIndex(fullText: string, classStartIndex: number): string {
  const start = Math.max(0, classStartIndex - DECORATOR_LOOKBACK);
  return fullText.slice(start, classStartIndex);
}

export function detectNestComponent(
  fullText: string,
  classStartIndex: number,
  className: string,
  filePath: string
): NestComponentKind | null {
  const before = textBeforeIndex(fullText, classStartIndex);
  const isController = /@Controller\s*(?:\(|$)/m.test(before);
  if (isController) {
    return "controller";
  }
  const isInjectable = /@Injectable\s*(?:\(|$)/m.test(before);
  const looksLikeService =
    /Service$/u.test(className) || /\.service\.ts$/iu.test(filePath);
  if (isInjectable && looksLikeService) {
    return "service";
  }
  return null;
}

/** Constructor / field injection: `constructor(private readonly x: Foo)` */
export function extractDependencies(classBody: string): string[] {
  const ctorMatch = classBody.match(/constructor\s*\(([\s\S]*?)\)\s*\{/);
  if (!ctorMatch) {
    return [];
  }
  const params = ctorMatch[1];
  const deps: string[] = [];
  const paramRegex =
    /(?:private|public|protected|readonly)\s+(?:readonly\s+)?(\w+)\s*:\s*([^,)]+)/g;
  let m: RegExpExecArray | null;
  while ((m = paramRegex.exec(params)) !== null) {
    const typeName = m[2].trim().replace(/\s*=\s*.*$/u, "").trim();
    if (typeName && !/^(string|number|boolean|void|any|unknown)$/iu.test(typeName)) {
      deps.push(`${m[1].trim()}: ${typeName}`);
    }
  }
  return [...new Set(deps)];
}

/** HTTP routes from decorators on methods inside the class block */
export function extractRoutes(classBlock: string): string[] {
  const routes: string[] = [];
  const methodDecorators =
    /@(Get|Post|Put|Patch|Delete|Options|Head|All)\s*\(\s*(?:['`]([^'`]*)['`])?\s*\)/giu;
  let m: RegExpExecArray | null;
  while ((m = methodDecorators.exec(classBlock)) !== null) {
    const verb = m[1].toUpperCase();
    const path = (m[2] ?? "").trim() || "/";
    routes.push(`${verb} ${path}`);
  }
  return [...new Set(routes)];
}

/** DTO-like types from @Body / @Query / @Param */
export function extractDtoHints(classBlock: string): string[] {
  const hints: string[] = [];
  const decRegex =
    /@(Body|Query|Param)(\([^)]*\))?\s+(\w+)\s*:\s*([\w.<>\[\]|,\s]+?)(?=\s*[,)=])/giu;
  let m: RegExpExecArray | null;
  while ((m = decRegex.exec(classBlock)) !== null) {
    const deco = m[1];
    const param = m[3];
    const typeName = m[4].replace(/\s+/gu, " ").trim();
    if (typeName) {
      hints.push(`${deco} ${param}: ${typeName}`);
    }
  }
  return [...new Set(hints)];
}

export function extractPublicMethods(classBlock: string): string[] {
  const methods: string[] = [];
  const re =
    /^\s*(?:async\s+)?(\w+)\s*\([^)]*\)\s*(?::\s*([^{]+))?\s*\{/gmu;
  let m: RegExpExecArray | null;
  while ((m = re.exec(classBlock)) !== null) {
    const name = m[1];
    if (
      name === "constructor" ||
      name.startsWith("_") ||
      /^(if|for|while|switch|catch)$/u.test(name)
    ) {
      continue;
    }
    const ret = m[2]?.trim();
    methods.push(ret ? `${name}(): ${ret}` : `${name}()`);
  }
  return [...new Set(methods)];
}

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&");
}

/** Last HTTP route decorator segment before `methodName(` in class body (regex fallback). */
function extractRoutesForMethodRegex(
  classBlock: string,
  methodName: string
): string[] {
  const reMethod = new RegExp(
    `(?:async\\s+)?${escapeRegExp(methodName)}\\s*\\(`,
    "mu"
  );
  const idx = classBlock.search(reMethod);
  if (idx < 0) {
    return [];
  }
  const before = classBlock.slice(0, idx);
  const last: string[] = [];
  const decRe =
    /@(Get|Post|Put|Patch|Delete|Options|Head|All)\s*\(\s*(?:['`]([^'`]*)['`])?\s*\)/giu;
  let m: RegExpExecArray | null;
  while ((m = decRe.exec(before)) !== null) {
    const verb = m[1].toUpperCase();
    const path = (m[2] ?? "").trim() || "/";
    last.push(`${verb} ${path}`);
  }
  return last.length > 0 ? [last[last.length - 1]!] : [];
}

function extractClassBlock(fullText: string, exportClassIndex: number): string | null {
  const braceStart = fullText.indexOf("{", exportClassIndex);
  if (braceStart < 0) {
    return null;
  }
  let depth = 0;
  for (let i = braceStart; i < fullText.length; i++) {
    const c = fullText[i];
    if (c === "{") {
      depth++;
    } else if (c === "}") {
      depth--;
      if (depth === 0) {
        return fullText.slice(braceStart, i + 1);
      }
    }
  }
  return null;
}

function buildExtractedContextFromRegex(
  fullText: string,
  _filePath: string,
  className: string,
  exportClassIndex: number,
  kind: NestComponentKind,
  focusMethod?: string
): ExtractedContext {
  const classBlock = extractClassBlock(fullText, exportClassIndex) ?? "";
  const dependencies = extractDependencies(classBlock);
  let routes =
    kind === "controller" ? extractRoutes(classBlock) : [];
  let dtos = extractDtoHints(classBlock);
  let publicMethods = extractPublicMethods(classBlock);

  if (focusMethod) {
    publicMethods = publicMethods.filter(
      (line) =>
        line.startsWith(`${focusMethod}(`) || line.startsWith(`${focusMethod}():`)
    );
    if (kind === "controller") {
      const one = extractRoutesForMethodRegex(classBlock, focusMethod);
      routes = one.length > 0 ? one : routes;
    }
  }

  const focusedRoute =
    kind === "controller" && focusMethod && routes.length > 0
      ? routes[0]
      : undefined;

  return {
    className,
    kind,
    dependencies,
    routes,
    dtos,
    publicMethods,
    focusedMethod: focusMethod,
    focusedRoute,
  };
}

export function buildExtractedContext(
  fullText: string,
  filePath: string,
  className: string,
  exportClassIndex: number,
  kind: NestComponentKind,
  focusMethod?: string
): ExtractedContext {
  const fromAst = tryBuildExtractedContextFromAst(
    fullText,
    filePath,
    className,
    exportClassIndex,
    kind,
    focusMethod
  );
  if (fromAst) {
    return fromAst;
  }
  return buildExtractedContextFromRegex(
    fullText,
    filePath,
    className,
    exportClassIndex,
    kind,
    focusMethod
  );
}
