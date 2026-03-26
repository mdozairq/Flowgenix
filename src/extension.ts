import * as fs from "fs/promises";
import * as path from "path";
import * as vscode from "vscode";
import {
  componentKey,
  docsArtifactRelative,
  flowArtifactRelative,
  sanitizeFilePart,
  specPathInSourceTestDir,
  toWorkspaceRelative,
} from "./artifactPaths";
import { parseArtifactResponse } from "./artifactParser";
import { writeParsedArtifacts } from "./artifactWriter";
import { NestCodeLensProvider } from "./codeLensProvider";
import type { GenerateCommandArgs } from "./generateArgs";
import { listMethodGenerateTargets } from "./methodTargetDiscovery";
import { buildExtractedContext } from "./contextExtractor";
import { buildPrompt } from "./promptBuilder";
import { pickPromptSections } from "./promptSections";
import { truncateSourceAroundFocus } from "./sourceCap";
import {
  deliverPrompt,
  type PromptDeliveryMode,
} from "./promptDelivery";

const CONFIG_SECTION = "nestjs-generator";
const MAX_SOURCE_KEY = "maxSourceCharacters";
const DELIVERY_KEY = "promptDelivery";
const DOCS_DIR_KEY = "artifactsDocsDir";
const FLOW_DIR_KEY = "artifactsFlowDir";
const LAST_ARTIFACT_KEY = "nestjs.lastArtifact";

interface LastArtifactPayload {
  sourceFilePath: string;
  className: string;
  methodName: string;
}

function isCompleteArgs(a?: GenerateCommandArgs): a is GenerateCommandArgs {
  return (
    !!a?.className &&
    a.classStartOffset !== undefined &&
    !!a.kind &&
    !!a.methodName &&
    a.methodStartOffset !== undefined
  );
}

async function resolveGenerateArgs(
  document: vscode.TextDocument,
  fromCodeLens?: GenerateCommandArgs
): Promise<GenerateCommandArgs | undefined> {
  if (isCompleteArgs(fromCodeLens)) {
    return fromCodeLens;
  }

  const targets = listMethodGenerateTargets(document);
  if (targets.length === 0) {
    await vscode.window.showWarningMessage(
      "No Nest HTTP handlers or public service methods found in this file."
    );
    return undefined;
  }
  if (targets.length === 1) {
    return targets[0];
  }

  const picked = await vscode.window.showQuickPick(
    targets.map((t) => ({
      label: `${t.className} › ${t.routeLabel ?? t.methodName}`,
      description:
        t.kind === "controller"
          ? "$(globe) Controller handler"
          : "$(server) Service method",
      args: t,
    })),
    {
      title: "NestJS Generator: choose handler / method",
      placeHolder: "Select an API route or service method",
    }
  );
  return picked?.args;
}

async function specFileExistsAt(abs: string): Promise<boolean> {
  try {
    await fs.access(abs);
    return true;
  } catch {
    return false;
  }
}

export function activate(context: vscode.ExtensionContext): void {
  context.subscriptions.push(
    vscode.languages.registerCodeLensProvider(
      { language: "typescript", scheme: "file" },
      new NestCodeLensProvider()
    )
  );

  context.subscriptions.push(
    vscode.commands.registerCommand(
      "nestjs.generate",
      async (args?: GenerateCommandArgs) => {
        const editor = vscode.window.activeTextEditor;
        if (!editor || editor.document.languageId !== "typescript") {
          await vscode.window.showWarningMessage(
            "Open a TypeScript file to generate a NestJS prompt."
          );
          return;
        }

        const resolved = await resolveGenerateArgs(editor.document, args);
        if (!resolved) {
          return;
        }

        const sections = await pickPromptSections();
        if (!sections?.length) {
          return;
        }

        const wf = vscode.workspace.getWorkspaceFolder(editor.document.uri);
        if (!wf) {
          await vscode.window.showWarningMessage(
            "Open a folder/workspace so docs/, flow/, and spec paths can be resolved."
          );
          return;
        }

        const cfg = vscode.workspace.getConfiguration(CONFIG_SECTION);
        const docsDir = cfg.get<string>(DOCS_DIR_KEY, "docs");
        const flowDir = cfg.get<string>(FLOW_DIR_KEY, "flow");

        const sourceFsPath = editor.document.uri.fsPath;
        const specAbs = specPathInSourceTestDir(sourceFsPath);
        const specExists = await specFileExistsAt(specAbs);

        const docsRel = docsArtifactRelative(
          docsDir,
          resolved.className,
          resolved.methodName
        );
        const flowRel = flowArtifactRelative(
          flowDir,
          resolved.className,
          resolved.methodName
        );
        const specRel = toWorkspaceRelative(wf.uri.fsPath, specAbs);

        const mermaidId = `NG_${sanitizeFilePart(resolved.className)}_${sanitizeFilePart(resolved.methodName)}`;

        await context.workspaceState.update(LAST_ARTIFACT_KEY, {
          sourceFilePath: sourceFsPath,
          className: resolved.className,
          methodName: resolved.methodName,
        } satisfies LastArtifactPayload);

        const fullCode = editor.document.getText();
        const ctx = buildExtractedContext(
          fullCode,
          editor.document.uri.fsPath,
          resolved.className,
          resolved.classStartOffset,
          resolved.kind,
          resolved.methodName
        );

        const maxChars = cfg.get<number>(MAX_SOURCE_KEY, 0);
        const embeddedCode = truncateSourceAroundFocus(
          fullCode,
          resolved.methodStartOffset,
          maxChars ?? 0
        );

        const prompt = buildPrompt(
          embeddedCode,
          ctx,
          {
            componentKey: componentKey(resolved.className, resolved.methodName),
            mermaidDiagramId: mermaidId,
            docsRelativePath: docsRel,
            flowRelativePath: flowRel,
            specRelativePath: specRel,
            specFileExists: specExists,
          },
          sections
        );

        const delivery = cfg.get<PromptDeliveryMode>(DELIVERY_KEY, "openChat");

        await deliverPrompt(prompt, delivery ?? "openChat");

        await vscode.window.showInformationMessage(
          "When the model replies, paste the full message into an editor (or select it), then run **NestJS Generator: Save artifacts from chat response** (or use clipboard if the editor is empty)."
        );
      }
    )
  );

  context.subscriptions.push(
    vscode.commands.registerCommand("nestjs.saveArtifacts", async () => {
      const editor = vscode.window.activeTextEditor;
      let text = "";
      if (editor) {
        text = editor.selection.isEmpty
          ? editor.document.getText()
          : editor.document.getText(editor.selection);
      }
      if (!text.trim()) {
        text = await vscode.env.clipboard.readText();
      }
      if (
        !text.includes("### TEST") &&
        !text.includes("### DOCS") &&
        !text.includes("### DIAGRAM")
      ) {
        await vscode.window.showErrorMessage(
          "No artifact content found. Paste the model reply (with ### TEST, ### DOCS, and/or ### DIAGRAM) into the active editor, select it, or copy to clipboard and retry."
        );
        return;
      }

      const last = context.workspaceState.get<LastArtifactPayload | undefined>(
        LAST_ARTIFACT_KEY
      );
      if (!last?.sourceFilePath) {
        await vscode.window.showErrorMessage(
          "No prior generation context. Run **NestJS Generator: Generate** on a handler first."
        );
        return;
      }

      const srcUri = vscode.Uri.file(last.sourceFilePath);
      const wf = vscode.workspace.getWorkspaceFolder(srcUri);
      if (!wf) {
        await vscode.window.showErrorMessage(
          "Could not resolve workspace folder for the last generated source file."
        );
        return;
      }

      const cfg = vscode.workspace.getConfiguration(CONFIG_SECTION);
      const docsDir = cfg.get<string>(DOCS_DIR_KEY, "docs");
      const flowDir = cfg.get<string>(FLOW_DIR_KEY, "flow");

      const specAbs = specPathInSourceTestDir(last.sourceFilePath);
      const docsRel = docsArtifactRelative(
        docsDir,
        last.className,
        last.methodName
      );
      const flowRel = flowArtifactRelative(
        flowDir,
        last.className,
        last.methodName
      );

      const parsed = parseArtifactResponse(text);
      try {
        const { written, warnings } = await writeParsedArtifacts(parsed, {
          workspaceRoot: wf.uri.fsPath,
          docsRelativePath: docsRel,
          flowRelativePath: flowRel,
          specAbsolutePath: specAbs,
          className: last.className,
          methodName: last.methodName,
        });

        const msg =
          written.length > 0
            ? `Wrote ${written.length} file(s): ${written.map((p) => path.basename(p)).join(", ")}`
            : "Nothing written.";
        if (warnings.length > 0) {
          await vscode.window.showWarningMessage(
            `${msg} — ${warnings.join(" ")}`
          );
        } else {
          await vscode.window.showInformationMessage(msg);
        }

        if (written.length > 0) {
          const openPath =
            written.find((p) => p.endsWith(".spec.ts")) ?? written[0];
          const doc = await vscode.workspace.openTextDocument(
            vscode.Uri.file(openPath)
          );
          await vscode.window.showTextDocument(doc, { preview: true });
        }
      } catch (e) {
        const err = e instanceof Error ? e.message : String(e);
        await vscode.window.showErrorMessage(`Save artifacts failed: ${err}`);
      }
    })
  );
}

export function deactivate(): void {}
