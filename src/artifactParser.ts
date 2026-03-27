export interface ParsedArtifacts {
  testSnippet: string | null;
  docsMarkdown: string | null;
  diagramMermaid: string | null;
}

/**
 * Find the index of `header` that appears **outside** any code fence.
 * This prevents matching a header inside a previous section's code block.
 */
function findHeaderOutsideFence(full: string, header: string): number {
  const lines = full.split("\n");
  let inFence = false;
  let offset = 0;
  for (const line of lines) {
    if (/^```/.test(line.trimStart())) {
      inFence = !inFence;
    }
    if (!inFence) {
      const col = line.indexOf(header);
      if (col >= 0) {
        return offset + col;
      }
    }
    offset += line.length + 1;
  }
  return -1;
}

/**
 * Extract fenced content after a markdown header (e.g. ### TEST).
 * Handles nested fences by tracking fence depth (backtick count).
 */
function extractAfterHeader(
  full: string,
  header: string
): string | null {
  const idx = findHeaderOutsideFence(full, header);
  if (idx < 0) {
    return null;
  }
  const after = full.slice(idx + header.length);
  const openMatch = after.match(/(`{3,})/);
  if (!openMatch) {
    return null;
  }
  const openLen = openMatch[1].length;
  const fenceStart = openMatch.index!;
  const afterOpen = after.slice(fenceStart + openLen);
  const nl = afterOpen.indexOf("\n");
  if (nl < 0) {
    return null;
  }
  const body = afterOpen.slice(nl + 1);
  const closePattern = new RegExp(`^(\`{${openLen},})\\s*$`, "m");
  const closeMatch = body.match(closePattern);
  if (!closeMatch) {
    return null;
  }
  return body.slice(0, closeMatch.index!).trim();
}

export function parseArtifactResponse(full: string): ParsedArtifacts {
  return {
    testSnippet: extractAfterHeader(full, "### TEST"),
    docsMarkdown: extractAfterHeader(full, "### DOCS"),
    diagramMermaid: extractAfterHeader(full, "### DIAGRAM"),
  };
}
