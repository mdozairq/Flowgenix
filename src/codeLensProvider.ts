import * as vscode from "vscode";
import { listMethodGenerateTargets } from "./methodTargetDiscovery";

export class NestCodeLensProvider implements vscode.CodeLensProvider {
  provideCodeLenses(
    document: vscode.TextDocument
  ): vscode.ProviderResult<vscode.CodeLens[]> {
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
            "Copy a structured Cursor prompt for this handler / method (### TEST / ### DOCS / ### DIAGRAM)",
          command: "nestjs.generate",
          arguments: [t],
        })
      );
    }

    return lenses;
  }
}
