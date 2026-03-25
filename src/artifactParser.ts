export interface ParsedArtifacts {
  testSnippet: string | null;
  docsMarkdown: string | null;
  diagramMermaid: string | null;
}

/**
 * Extract fenced content after a markdown header (e.g. ### TEST).
 * First ``` fence after the header wins.
 */
function extractAfterHeader(
  full: string,
  header: string
): string | null {
  const idx = full.indexOf(header);
  if (idx < 0) {
    return null;
  }
  const after = full.slice(idx + header.length);
  const startFence = after.indexOf("```");
  if (startFence < 0) {
    return null;
  }
  const afterOpen = after.slice(startFence + 3);
  const nl = afterOpen.indexOf("\n");
  if (nl < 0) {
    return null;
  }
  const bodyStart = nl + 1;
  const endFence = afterOpen.indexOf("```", bodyStart);
  if (endFence < 0) {
    return null;
  }
  return afterOpen.slice(bodyStart, endFence).trim();
}

export function parseArtifactResponse(full: string): ParsedArtifacts {
  return {
    testSnippet: extractAfterHeader(full, "### TEST"),
    docsMarkdown: extractAfterHeader(full, "### DOCS"),
    diagramMermaid: extractAfterHeader(full, "### DIAGRAM"),
  };
}
