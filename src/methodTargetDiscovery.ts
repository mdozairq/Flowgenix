import * as vscode from "vscode";
import * as ts from "typescript";
import { detectNestComponent } from "./contextExtractor";
import type { GenerateCommandArgs } from "./generateArgs";
import { HTTP_VERBS, decoratorName, isPublicMethod, routeLabelForMethod } from "./nestTsDecorators";
import { getOrCreateSourceFile } from "./sourceFileCache";

function methodLensStart(
  method: ts.MethodDeclaration,
  sourceFile: ts.SourceFile
): number {
  const decs = ts.getDecorators(method) ?? [];
  if (decs.length > 0) {
    return decs[0].getStart(sourceFile);
  }
  return method.name.getStart(sourceFile);
}

function exportClassCharIndex(fullText: string, className: string): number {
  for (const prefix of [
    `export class ${className}`,
    `export abstract class ${className}`,
    `export default class ${className}`,
  ]) {
    const idx = fullText.indexOf(prefix);
    if (idx >= 0) {
      return idx;
    }
  }
  return -1;
}

/**
 * One generate target per HTTP handler (controller) or public method (service).
 */
export function listMethodGenerateTargets(
  document: vscode.TextDocument
): GenerateCommandArgs[] {
  if (document.languageId !== "typescript") {
    return [];
  }
  const fullText = document.getText();
  const filePath = document.uri.fsPath;
  const sf = getOrCreateSourceFile(filePath, fullText, document.version);
  const out: GenerateCommandArgs[] = [];

  const visit = (node: ts.Node): void => {
    if (ts.isClassDeclaration(node) && node.name) {
      const className = node.name.text;
      const exportIdx = exportClassCharIndex(fullText, className);
      if (exportIdx >= 0) {
        const kind = detectNestComponent(
          fullText,
          exportIdx,
          className,
          filePath
        );
        if (kind === "controller") {
          for (const member of node.members) {
            if (!ts.isMethodDeclaration(member) || !ts.isIdentifier(member.name)) {
              continue;
            }
            const hasHttp = (ts.getDecorators(member) ?? []).some((d) => {
              const n = decoratorName(d);
              return n !== undefined && HTTP_VERBS.has(n);
            });
            if (!hasHttp) {
              continue;
            }
            const methodName = member.name.text;
            out.push({
              className,
              kind,
              classStartOffset: exportIdx,
              methodName,
              methodStartOffset: methodLensStart(member, sf),
              routeLabel: routeLabelForMethod(node, member, sf),
            });
          }
        } else if (kind === "service") {
          for (const member of node.members) {
            if (!isPublicMethod(member) || !ts.isIdentifier(member.name)) {
              continue;
            }
            const methodName = member.name.text;
            if (methodName.startsWith("_")) {
              continue;
            }
            out.push({
              className,
              kind,
              classStartOffset: exportIdx,
              methodName,
              methodStartOffset: methodLensStart(member, sf),
              routeLabel: `${methodName}()`,
            });
          }
        }
      }
    }
    ts.forEachChild(node, visit);
  };

  visit(sf);
  return out;
}
