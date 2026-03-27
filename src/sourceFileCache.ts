import * as ts from "typescript";

interface CacheEntry {
  version: number;
  sourceFile: ts.SourceFile;
}

const cache = new Map<string, CacheEntry>();

/**
 * Returns a cached SourceFile if the version matches, otherwise parses and caches.
 * `version` should be `document.version` for VS Code documents, or -1 for raw strings.
 */
export function getOrCreateSourceFile(
  filePath: string,
  text: string,
  version: number
): ts.SourceFile {
  const entry = cache.get(filePath);
  if (entry && entry.version === version) {
    return entry.sourceFile;
  }
  const sf = ts.createSourceFile(
    filePath,
    text,
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TS
  );
  cache.set(filePath, { version, sourceFile: sf });
  return sf;
}

export function invalidateSourceFile(filePath: string): void {
  cache.delete(filePath);
}
