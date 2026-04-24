import { describe, it, expect } from "vitest";
import { parseCcInput } from "../SendOptionsPanel";

describe("parseCcInput", () => {
  it("returns only valid emails", () => {
    expect(parseCcInput("a@b.com, c@d.com")).toEqual(["a@b.com", "c@d.com"]);
  });

  it("drops tokens without an @", () => {
    expect(parseCcInput("a@b.com, badcolorado.edu, c@d.com")).toEqual(["a@b.com", "c@d.com"]);
  });

  it("drops tokens without a domain dot", () => {
    expect(parseCcInput("a@b")).toEqual([]);
  });

  it("accepts semicolon and whitespace separators", () => {
    expect(parseCcInput("a@b.com ; c@d.com\t e@f.com")).toEqual(["a@b.com", "c@d.com", "e@f.com"]);
  });

  it("returns empty array for empty input", () => {
    expect(parseCcInput("")).toEqual([]);
    expect(parseCcInput("   ")).toEqual([]);
  });

  it("trims whitespace from tokens", () => {
    expect(parseCcInput("  a@b.com  ,   c@d.com ")).toEqual(["a@b.com", "c@d.com"]);
  });
});
