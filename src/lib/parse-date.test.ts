import { describe, it, expect } from "vitest";
import { parseDate } from "./parse-date.js";

describe("parseDate", () => {
  it("parses an ISO 8601 date string", () => {
    const result = parseDate("2026-03-01");
    expect(result).toBeInstanceOf(Date);
    expect(result!.toISOString()).toMatch(/^2026-03-01/);
  });

  it("parses an ISO 8601 datetime string", () => {
    const result = parseDate("2026-03-01T12:00:00.000Z");
    expect(result).toBeInstanceOf(Date);
    expect(result!.toISOString()).toBe("2026-03-01T12:00:00.000Z");
  });

  it("parses 'yesterday' as a date before today", () => {
    const result = parseDate("yesterday");
    const now = new Date();
    expect(result).toBeInstanceOf(Date);
    expect(result!.getTime()).toBeLessThan(now.getTime());
  });

  it("parses '1 week ago' as a date ~7 days in the past", () => {
    const result = parseDate("1 week ago");
    const sevenDaysAgo = Date.now() - 7 * 24 * 60 * 60 * 1000;
    const oneDayMs = 24 * 60 * 60 * 1000;
    expect(result).toBeInstanceOf(Date);
    expect(Math.abs(result!.getTime() - sevenDaysAgo)).toBeLessThan(oneDayMs);
  });

  it("parses '1 month ago' as a date roughly 30 days in the past", () => {
    const result = parseDate("1 month ago");
    const thirtyDaysAgo = Date.now() - 30 * 24 * 60 * 60 * 1000;
    const threeDaysMs = 3 * 24 * 60 * 60 * 1000;
    expect(result).toBeInstanceOf(Date);
    expect(Math.abs(result!.getTime() - thirtyDaysAgo)).toBeLessThan(threeDaysMs);
  });

  it("parses 'today' as a date within the current day", () => {
    const result = parseDate("today");
    const now = new Date();
    expect(result).toBeInstanceOf(Date);
    expect(result!.toDateString()).toBe(now.toDateString());
  });

  it("returns null for a completely invalid input", () => {
    const result = parseDate("not-a-date-at-all-xyz");
    expect(result).toBeNull();
  });
});
