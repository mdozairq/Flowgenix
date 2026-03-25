import * as vscode from "vscode";

const SECTION = "nestjs-generator";

export type PromptDeliveryMode = "openChat" | "clipboard" | "languageModel";

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function runCommandsSafe(ids: string[]): Promise<void> {
  for (const id of ids) {
    const trimmed = id.trim();
    if (!trimmed) {
      continue;
    }
    try {
      await vscode.commands.executeCommand(trimmed);
    } catch {
      // Cursor/VS Code command IDs differ by version; continue sequence
    }
  }
}

/**
 * Best-effort: focus Cursor/VS Code AI chat, paste prompt from clipboard, optionally submit.
 * Not officially documented — tune `nestjs-generator.chatFocusCommands` / `chatSubmitCommand` if needed.
 */
async function deliverViaOpenChat(prompt: string): Promise<void> {
  const cfg = vscode.workspace.getConfiguration(SECTION);
  const focusCommands = cfg.get<string[]>("chatFocusCommands", [
    "aichat.newchataction",
  ]);
  const delayMs = cfg.get<number>("chatPasteDelayMs", 350);
  const pasteCommand = cfg.get<string>(
    "chatPasteCommand",
    "editor.action.clipboardPasteAction"
  );
  const submitCommand = (cfg.get<string>("chatSubmitCommand", "") ?? "").trim();

  await vscode.env.clipboard.writeText(prompt);
  await runCommandsSafe(focusCommands);
  await sleep(Math.max(0, delayMs));

  if (pasteCommand.trim()) {
    try {
      await vscode.commands.executeCommand(pasteCommand.trim());
    } catch {
      // Paste often targets the active editor; chat may not be focused yet
    }
  }

  await sleep(Math.max(0, cfg.get<number>("chatSubmitDelayMs", 120)));

  if (submitCommand) {
    try {
      await vscode.commands.executeCommand(submitCommand);
    } catch {
      // e.g. workbench.action.chat.submit missing in some Cursor builds — user can submit manually
    }
  }
}

async function deliverViaLanguageModel(prompt: string): Promise<boolean> {
  try {
    const models = await vscode.lm.selectChatModels();
    if (models.length === 0) {
      return false;
    }
    const model = models[0];
    const response = await model.sendRequest(
      [vscode.LanguageModelChatMessage.User(prompt)],
      {},
      undefined
    );

    let body = "";
    for await (const chunk of response.text) {
      body += chunk;
    }

    const doc = await vscode.workspace.openTextDocument({
      content: body || "(empty model response)",
      language: "markdown",
    });
    await vscode.window.showTextDocument(doc, { preview: false });
    return true;
  } catch {
    return false;
  }
}

export async function deliverPrompt(
  prompt: string,
  mode: PromptDeliveryMode
): Promise<void> {
  if (mode === "clipboard") {
    await vscode.env.clipboard.writeText(prompt);
    await vscode.window.showInformationMessage(
      "NestJS prompt copied to clipboard (this handler / method)."
    );
    return;
  }

  if (mode === "languageModel") {
    const ok = await vscode.window.withProgress(
      {
        location: vscode.ProgressLocation.Notification,
        title: "NestJS Generator: running language model…",
        cancellable: false,
      },
      async () => {
        return deliverViaLanguageModel(prompt);
      }
    );
    if (!ok) {
      await vscode.env.clipboard.writeText(prompt);
      await vscode.window.showWarningMessage(
        "No registered chat model (vscode.lm). Prompt copied to clipboard instead."
      );
    } else {
      await vscode.window.showInformationMessage(
        "NestJS Generator: model response opened in a new editor."
      );
    }
    return;
  }

  // openChat
  await deliverViaOpenChat(prompt);
  await vscode.window.showInformationMessage(
    "NestJS Generator: opened chat (best effort), pasted prompt. Submit manually if it did not send."
  );
}
