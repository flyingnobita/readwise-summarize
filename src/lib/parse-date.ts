import * as chrono from "chrono-node";

export function parseDate(input: string): Date | null {
  const chronoParsed = chrono.parseDate(input);
  if (chronoParsed) return chronoParsed;
  const fallback = new Date(input);
  return isNaN(fallback.getTime()) ? null : fallback;
}
