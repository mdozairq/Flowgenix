/**
 * Shared TypeScript decorator helpers for Nest-style metadata.
 */

import * as ts from "typescript";

export const HTTP_VERBS = new Set([
  "Get",
  "Post",
  "Put",
  "Patch",
  "Delete",
  "Options",
  "Head",
  "All",
]);

export function decoratorName(dec: ts.Decorator): string | undefined {
  const expr = dec.expression;
  if (ts.isCallExpression(expr)) {
    const callee = expr.expression;
    if (ts.isIdentifier(callee)) {
      return callee.text;
    }
    if (
      ts.isPropertyAccessExpression(callee) &&
      ts.isIdentifier(callee.name)
    ) {
      return callee.name.text;
    }
  } else if (ts.isIdentifier(expr)) {
    return expr.text;
  }
  return undefined;
}

export function firstStringArg(dec: ts.Decorator): string | undefined {
  if (!ts.isCallExpression(dec.expression)) {
    return undefined;
  }
  const arg0 = dec.expression.arguments[0];
  if (!arg0) {
    return undefined;
  }
  if (ts.isStringLiteral(arg0) || ts.isNoSubstitutionTemplateLiteral(arg0)) {
    return arg0.text;
  }
  return undefined;
}

export function getClassDecorators(
  node: ts.ClassDeclaration
): readonly ts.Decorator[] {
  return ts.getDecorators(node) ?? [];
}

export function controllerBasePath(node: ts.ClassDeclaration): string {
  for (const dec of getClassDecorators(node)) {
    if (decoratorName(dec) === "Controller") {
      return firstStringArg(dec) ?? "";
    }
  }
  return "";
}

export function joinNestRoute(prefix: string, segment: string): string {
  const a = prefix.replace(/^\/+/u, "").replace(/\/+$/u, "");
  const b = segment.replace(/^\/+/u, "").replace(/\/+$/u, "");
  if (!a && !b) {
    return "/";
  }
  if (!a) {
    return "/" + b;
  }
  if (!b) {
    return "/" + a;
  }
  return "/" + a + "/" + b;
}

export function routeLabelForMethod(
  classNode: ts.ClassDeclaration,
  method: ts.MethodDeclaration,
  sourceFile: ts.SourceFile
): string {
  const base = controllerBasePath(classNode);
  const decs = ts.getDecorators(method) ?? [];
  for (const dec of decs) {
    const name = decoratorName(dec);
    if (!name || !HTTP_VERBS.has(name)) {
      continue;
    }
    const pathArg = firstStringArg(dec) ?? "";
    const full = joinNestRoute(base, pathArg);
    return `${name.toUpperCase()} ${full}`;
  }
  return method.name.getText(sourceFile);
}
