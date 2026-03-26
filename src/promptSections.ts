import * as vscode from "vscode";

export type PromptSection = "test" | "docs" | "diagram";

export const ALL_PROMPT_SECTIONS: readonly PromptSection[] = [
  "test",
  "docs",
  "diagram",
];

type SectionPickItem = vscode.QuickPickItem & { section: PromptSection };

/**
 * Multi-select which artifacts to generate (Space to toggle; Enter to confirm).
 */
export async function pickPromptSections(): Promise<
  PromptSection[] | undefined
> {
  const picked = await vscode.window.showQuickPick<SectionPickItem>(
    [
      {
        label: "$(beaker) Tests",
        description: "### TEST",
        section: "test",
      },
      {
        label: "$(book) Documentation",
        description: "### DOCS",
        section: "docs",
      },
      {
        label: "$(graph) Flow diagram",
        description: "### DIAGRAM",
        section: "diagram",
      },
    ],
    {
      title: "Flowgenix: select sections (multi-select)",
      placeHolder: "Space to toggle — at least one",
      canPickMany: true,
    }
  );

  if (!picked?.length) {
    return undefined;
  }
  return picked.map((p) => p.section);
}
