import { describe, expect, it } from "vitest";

import { csvCell, toCsv } from "@/lib/analytics/csv";
import { parseRange } from "@/lib/analytics/range";

describe("csv", () => {
  it("quotes separators, quotes and newlines", () => {
    expect(csvCell("plain")).toBe("plain");
    expect(csvCell("a,b")).toBe('"a,b"');
    expect(csvCell('say "hi"')).toBe('"say ""hi"""');
    expect(csvCell("line\nbreak")).toBe('"line\nbreak"');
    expect(csvCell(null)).toBe("");
    expect(csvCell(4)).toBe("4");
    expect(csvCell(new Date("2026-10-14T12:00:00Z"))).toBe("2026-10-14T12:00:00.000Z");
  });

  it("neutralizes spreadsheet formulas in text", () => {
    expect(csvCell("=HYPERLINK(\"x\")")).toBe(`"'=HYPERLINK(""x"")"`);
    expect(csvCell("+1")).toBe("'+1");
    expect(csvCell("@cmd")).toBe("'@cmd");
    // Numbers are not text and stay numeric.
    expect(csvCell(-3)).toBe("-3");
  });

  it("builds a document with CRLF line endings", () => {
    expect(toCsv(["a", "b"], [[1, "x"]])).toBe("a,b\r\n1,x\r\n");
  });
});

describe("parseRange", () => {
  it("accepts only supported windows", () => {
    expect(parseRange("7")).toBe(7);
    expect(parseRange("90")).toBe(90);
    expect(parseRange("365")).toBe(30);
    expect(parseRange(undefined)).toBe(30);
    expect(parseRange(["7", "30"])).toBe(7);
  });
});
