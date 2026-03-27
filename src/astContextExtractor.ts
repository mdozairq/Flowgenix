/**
 * Structured extraction via TypeScript Compiler API (Phase 2 — hybrid).
 * Falls back to regex-based extraction when parse yields no class match.
 */

import * as ts from "typescript";
import {
  HTTP_VERBS,
  controllerBasePath,
  decoratorName,
  firstStringArg,
  isPublicMethod,
  joinNestRoute,
} from "./nestTsDecorators";
import { getOrCreateSourceFile } from "./sourceFileCache";
import type { ExtractedContext, NestComponentKind } from "./contextExtractor";

function extractRoutesAst(
  classNode: ts.ClassDeclaration,
  sourceFile: ts.SourceFile
): string[] {
  const base = controllerBasePath(classNode);
  const routes: string[] = [];

  for (const member of classNode.members) {
    if (!ts.isMethodDeclaration(member)) {
      continue;
    }
    const decs = ts.getDecorators(member) ?? [];
    for (const dec of decs) {
      const name = decoratorName(dec);
      if (!name || !HTTP_VERBS.has(name)) {
        continue;
      }
      const pathArg = firstStringArg(dec) ?? "";
      const full = joinNestRoute(base, pathArg);
      routes.push(`${name.toUpperCase()} ${full}`);
    }
  }
  return [...new Set(routes)];
}

function extractRoutesForMethodAst(
  classNode: ts.ClassDeclaration,
  methodName: string,
  sourceFile: ts.SourceFile
): string[] {
  const base = controllerBasePath(classNode);
  const out: string[] = [];
  for (const member of classNode.members) {
    if (!ts.isMethodDeclaration(member) || !ts.isIdentifier(member.name)) {
      continue;
    }
    if (member.name.text !== methodName) {
      continue;
    }
    for (const dec of ts.getDecorators(member) ?? []) {
      const name = decoratorName(dec);
      if (!name || !HTTP_VERBS.has(name)) {
        continue;
      }
      const pathArg = firstStringArg(dec) ?? "";
      out.push(`${name.toUpperCase()} ${joinNestRoute(base, pathArg)}`);
    }
  }
  return [...new Set(out)];
}

function typeToString(
  t: ts.TypeNode | undefined,
  sourceFile: ts.SourceFile
): string {
  if (!t) {
    return "unknown";
  }
  return t.getText(sourceFile).replace(/\s+/gu, " ").trim();
}

function extractDependenciesAst(
  classNode: ts.ClassDeclaration,
  sourceFile: ts.SourceFile
): string[] {
  const ctor = classNode.members.find(ts.isConstructorDeclaration);
  if (!ctor) {
    return [];
  }
  const deps: string[] = [];
  const primitives =
    /^(string|number|boolean|bigint|symbol|void|any|unknown|null|undefined)$/iu;

  for (const param of ctor.parameters) {
    if (!ts.isIdentifier(param.name)) {
      continue;
    }
    const paramName = param.name.text;
    const typeStr = typeToString(param.type, sourceFile);
    if (primitives.test(typeStr)) {
      continue;
    }
    deps.push(`${paramName}: ${typeStr}`);
  }
  return [...new Set(deps)];
}


function extractPublicMethodsAst(
  classNode: ts.ClassDeclaration,
  sourceFile: ts.SourceFile
): string[] {
  const out: string[] = [];
  for (const member of classNode.members) {
    if (!isPublicMethod(member)) {
      continue;
    }
    const name = (member.name as ts.Identifier).text;
    if (name.startsWith("_")) {
      continue;
    }
    const ret = member.type
      ? typeToString(member.type, sourceFile)
      : "implicit";
    out.push(`${name}(): ${ret}`);
  }
  return [...new Set(out)];
}

function extractPublicMethodSingleAst(
  classNode: ts.ClassDeclaration,
  methodName: string,
  sourceFile: ts.SourceFile
): string[] {
  for (const member of classNode.members) {
    if (!isPublicMethod(member)) {
      continue;
    }
    const name = (member.name as ts.Identifier).text;
    if (name !== methodName) {
      continue;
    }
    const ret = member.type
      ? typeToString(member.type, sourceFile)
      : "implicit";
    return [`${name}(): ${ret}`];
  }
  return [];
}

const PARAM_DECO = new Set(["Body", "Query", "Param", "Headers"]);

function extractDtoHintsAst(
  classNode: ts.ClassDeclaration,
  sourceFile: ts.SourceFile
): string[] {
  const hints: string[] = [];

  for (const member of classNode.members) {
    if (!ts.isMethodDeclaration(member)) {
      continue;
    }
    for (const param of member.parameters) {
      if (!ts.isIdentifier(param.name)) {
        continue;
      }
      const pName = param.name.text;
      const pType = typeToString(param.type, sourceFile);
      const decs = ts.getDecorators(param) ?? [];
      for (const dec of decs) {
        const dname = decoratorName(dec);
        if (dname && PARAM_DECO.has(dname)) {
          hints.push(`${dname} ${pName}: ${pType}`);
        }
      }
    }
  }
  return [...new Set(hints)];
}

function extractDtoHintsForMethodAst(
  classNode: ts.ClassDeclaration,
  methodName: string,
  sourceFile: ts.SourceFile
): string[] {
  const hints: string[] = [];
  for (const member of classNode.members) {
    if (!ts.isMethodDeclaration(member) || !ts.isIdentifier(member.name)) {
      continue;
    }
    if (member.name.text !== methodName) {
      continue;
    }
    for (const param of member.parameters) {
      if (!ts.isIdentifier(param.name)) {
        continue;
      }
      const pName = param.name.text;
      const pType = typeToString(param.type, sourceFile);
      for (const dec of ts.getDecorators(param) ?? []) {
        const dname = decoratorName(dec);
        if (dname && PARAM_DECO.has(dname)) {
          hints.push(`${dname} ${pName}: ${pType}`);
        }
      }
    }
  }
  return [...new Set(hints)];
}

function findClassDeclaration(
  sourceFile: ts.SourceFile,
  className: string,
  charIndex: number
): ts.ClassDeclaration | undefined {
  let best: ts.ClassDeclaration | undefined;
  let fallback: ts.ClassDeclaration | undefined;

  const visit = (node: ts.Node): void => {
    if (ts.isClassDeclaration(node) && node.name?.text === className) {
      fallback = node;
      const start = node.getStart(sourceFile, false);
      const end = node.getEnd();
      if (charIndex >= start && charIndex < end) {
        best = node;
      }
    }
    ts.forEachChild(node, visit);
  };

  visit(sourceFile);
  return best ?? fallback;
}

export function tryBuildExtractedContextFromAst(
  fullText: string,
  filePath: string,
  className: string,
  exportClassIndex: number,
  kind: NestComponentKind,
  focusMethod?: string
): ExtractedContext | null {
  const sourceFile = getOrCreateSourceFile(filePath, fullText, -1);

  const classNode = findClassDeclaration(
    sourceFile,
    className,
    exportClassIndex
  );
  if (!classNode) {
    return null;
  }

  const dependencies = extractDependenciesAst(classNode, sourceFile);

  let routes: string[];
  let dtos: string[];
  let publicMethods: string[];

  if (focusMethod) {
    routes =
      kind === "controller"
        ? extractRoutesForMethodAst(classNode, focusMethod, sourceFile)
        : [];
    dtos = extractDtoHintsForMethodAst(classNode, focusMethod, sourceFile);
    publicMethods = extractPublicMethodSingleAst(
      classNode,
      focusMethod,
      sourceFile
    );
  } else {
    routes = kind === "controller" ? extractRoutesAst(classNode, sourceFile) : [];
    dtos = extractDtoHintsAst(classNode, sourceFile);
    publicMethods = extractPublicMethodsAst(classNode, sourceFile);
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
