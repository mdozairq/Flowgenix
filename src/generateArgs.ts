import type { NestComponentKind } from "./contextExtractor";

export interface GenerateCommandArgs {
  className: string;
  kind: NestComponentKind;
  /** Offset of `export class` (UTF-16) */
  classStartOffset: number;
  /** Handler / service method this prompt targets */
  methodName: string;
  /** Where to place CodeLens and center source cap (UTF-16) */
  methodStartOffset: number;
  /** Short label for UI (e.g. `GET /cats` or `findOne()`) */
  routeLabel?: string;
}
