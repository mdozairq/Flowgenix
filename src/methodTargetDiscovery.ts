import * as vscode from "vscode";
import * as ts from "typescript";
import { detectNestComponent } from "./contextExtractor";
import type { GenerateCommandArgs } from "./generateArgs";
import { HTTP_VERBS, decoratorName, routeLabelForMethod } from "./nestTsDecorators";

function isPublicMethod(
  member: ts.ClassElement
): member is ts.MethodDeclaration {
  if (!ts.isMethodDeclaration(member)) {
    return false;
  }
  if (!member.name || !ts.isIdentifier(member.name)) {
    return false;
  }
  if (member.name.text === "constructor") {
    return false;
  }
  const mods = ts.canHaveModifiers(member)
    ? ts.getModifiers(member)
    : undefined;
  if (mods?.some((m) => m.kind === ts.SyntaxKind.PrivateKeyword)) {
    return false;
  }
  return true;
}

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
  const standard = fullText.indexOf(`export class ${className}`);
  if (standard >= 0) {
    return standard;
  }
  return fullText.indexOf(`export abstract class ${className}`);
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
  const sf = ts.createSourceFile(
    filePath,
    fullText,
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TS
  );
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
