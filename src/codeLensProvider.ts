import * as vscode from "vscode";
import { listMethodGenerateTargets } from "./methodTargetDiscovery";

interface LensCache {
  version: number;
  lenses: vscode.CodeLens[];
}

export class NestCodeLensProvider implements vscode.CodeLensProvider {
  private cache = new Map<string, LensCache>();

  provideCodeLenses(
    document: vscode.TextDocument
  ): vscode.ProviderResult<vscode.CodeLens[]> {
    const key = document.uri.toString();
    const cached = this.cache.get(key);
    if (cached && cached.version === document.version) {
      return cached.lenses;
    }

    const targets = listMethodGenerateTargets(document);
    const lenses: vscode.CodeLens[] = [];

    for (const t of targets) {
      const pos = document.positionAt(t.methodStartOffset);
      const range = new vscode.Range(pos, pos);

      const title =
        t.kind === "controller" && t.routeLabel
          ? `$(wand) Generate: ${t.routeLabel}`
          : `$(wand) Generate: ${t.className}.${t.methodName}`;

      lenses.push(
        new vscode.CodeLens(range, {
          title,
          tooltip:
            "Build a Flowgenix prompt — choose all three or only tests, docs, or diagram",
          command: "nestjs.generate",
          arguments: [t],
        })
      );
    }

    this.cache.set(key, { version: document.version, lenses });
    return lenses;
  }
}
