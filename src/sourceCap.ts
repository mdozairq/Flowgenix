/**
 * Truncate source embedded in the prompt while keeping the target class in view.
 * Extraction still uses the full file elsewhere.
 */
export function truncateSourceAroundFocus(
  fullSource: string,
  focusOffset: number,
  maxChars: number
): string {
  if (maxChars <= 0 || fullSource.length <= maxChars) {
    return fullSource;
  }

  const safeFocus = Math.max(0, Math.min(focusOffset, fullSource.length));
  let start = Math.max(0, safeFocus - Math.floor(maxChars / 2));
  let end = Math.min(fullSource.length, start + maxChars);
  if (end - start < maxChars) {
    start = Math.max(0, end - maxChars);
  }

  const omittedBefore = start;
  const omittedAfter = fullSource.length - end;
  const prefix =
    omittedBefore > 0
      ? `// … ${omittedBefore} characters omitted before this snippet …\n`
      : "";
  const suffix =
    omittedAfter > 0
      ? `\n// … ${omittedAfter} characters omitted after this snippet …`
      : "";

  return prefix + fullSource.slice(start, end) + suffix;
}
