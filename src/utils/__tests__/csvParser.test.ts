import { describe, it, expect } from "vitest";
import { isHeaderRow, inferColumnTypes, parseCSVLine } from "../csvParser";

describe("isHeaderRow", () => {
  it("returns true for typical header row", () => {
    expect(isHeaderRow(["name", "email", "company"])).toBe(true);
  });

  it("returns true for mixed case headers", () => {
    expect(isHeaderRow(["Name", "Email", "Company", "Title"])).toBe(true);
  });

  it("returns false when a cell contains @", () => {
    expect(isHeaderRow(["John Smith", "john@example.com", "Acme Corp"])).toBe(false);
  });

  it("returns false for typical data row", () => {
    expect(
      isHeaderRow([
        "Kiersten jenson",
        "Sales Representative",
        "Digikey",
        "",
        "kierstin.jenson@digikey.com",
      ]),
    ).toBe(false);
  });

  it("returns true with some empty cells in header", () => {
    expect(isHeaderRow(["name", "", "email", "company"])).toBe(true);
  });
});

describe("inferColumnTypes - Dataset A (Monetary Outreach)", () => {
  const rows = [
    "Kiersten jenson\tSales Representative\tDigikey\t\tkirstin.jenson@digikey.com\t\tMonetary Outreach\t\t\tOwen",
    "Cameron Cloyd\tEmail Marketing Associate\tDigikey\t\tcameron.cloyd@digikey.com\t\tMonetary Outreach\t\t\tOwen",
    "Ashley Menezes\tBusiness Development Representative\tZayo Group\t\tashley.menezes@zayo.com\t\tMonetary Outreach, Donated to CU\t\t\tOwen",
    "James Huang\tDirector, Sales\tQorvo, Inc.\t\tjames.huang@qorvo.com\t\tMonetary Outreach, Donated to CU\t\t\tAlex",
    "David Fullwood\tSenior Vice President of Sales and Marketing\tQorvo, Inc.\t\tdavid.fullwood@qorvo.com\t\tMonetary Outreach, Donated to CU\t\t\tAlex",
  ].map((line) => parseCSVLine(line, "\t"));

  it("detects email column", () => {
    const result = inferColumnTypes(rows);
    const emailCol = result.find((c) => c.inferredType === "email");
    expect(emailCol).toBeDefined();
    expect(emailCol!.index).toBe(4);
  });

  it("detects name column", () => {
    const result = inferColumnTypes(rows);
    const nameCol = result.find((c) => c.inferredType === "name");
    expect(nameCol).toBeDefined();
    expect(nameCol!.index).toBe(0);
  });

  it("detects company column", () => {
    const result = inferColumnTypes(rows);
    const companyCol = result.find((c) => c.inferredType === "company");
    expect(companyCol).toBeDefined();
    expect(companyCol!.index).toBe(2);
  });

  it("detects title column", () => {
    const result = inferColumnTypes(rows);
    const titleCol = result.find((c) => c.inferredType === "title");
    expect(titleCol).toBeDefined();
    expect(titleCol!.index).toBe(1);
  });

  it("detects member column", () => {
    const result = inferColumnTypes(rows);
    const memberCol = result.find((c) => c.inferredType === "member");
    expect(memberCol).toBeDefined();
    expect(memberCol!.index).toBe(9);
  });

  it("detects campaign column with outreach keywords", () => {
    const result = inferColumnTypes(rows);
    const campaignCol = result.find((c) => c.inferredType === "campaign");
    expect(campaignCol).toBeDefined();
    expect(campaignCol!.index).toBe(6);
  });

  it("skips blank columns", () => {
    const result = inferColumnTypes(rows);
    const blankCols = result.filter((c) => c.inferredType === "blank");
    expect(blankCols.length).toBeGreaterThanOrEqual(2);
  });
});

describe("inferColumnTypes - Dataset B (In-Kind / Equipment)", () => {
  const rows = [
    "Hanif Balolia\tPresident\tBusy-Bee Tools\tBusy Bee Tools | Woodworking, Metalworking, Hand Tools, Power Tools\th.balolia@busybeetools.com\t\tDrill press\t\t8-Dec\t\t\tOwen",
    "Sabina Kolodziej\tMarketing Supervisor\tKBC Tools\tKBC Tools & Machinery\tsabina@kbctools.com\t\tDrill press\tgood lead\t10-Dec\t\t\tOwen",
    "Abraham Augstin\tExecutive Assistant\tCisco systems\t\tabagusti@cisco.com\t\tNetwork switch\t\t2/3/2026\t\t\tOwen",
    "Omar Cruz\tMobility Sales specialist\tCisco systems\t\tomar@cisco.com\t\tNetwork switch\tBad email\t2/3/2026\t\t\tOwen",
    "Greg Smith\tSales Manager\tKBC Tools\tKBC Tools & Machinery\tgreg@kbctools.com\t\tDrill press\t\t10-Dec\t\t\tOwen",
  ].map((line) => parseCSVLine(line, "\t"));

  it("detects email column", () => {
    const result = inferColumnTypes(rows);
    const emailCol = result.find((c) => c.inferredType === "email");
    expect(emailCol).toBeDefined();
    expect(emailCol!.index).toBe(4);
  });

  it("detects name column", () => {
    const result = inferColumnTypes(rows);
    const nameCol = result.find((c) => c.inferredType === "name");
    expect(nameCol).toBeDefined();
    expect(nameCol!.index).toBe(0);
  });

  it("detects company column", () => {
    const result = inferColumnTypes(rows);
    const companyCol = result.find((c) => c.inferredType === "company");
    expect(companyCol).toBeDefined();
    expect(companyCol!.index).toBe(2);
  });

  it("detects date column", () => {
    const result = inferColumnTypes(rows);
    const dateCol = result.find((c) => c.inferredType === "date");
    expect(dateCol).toBeDefined();
    expect(dateCol!.index).toBe(8);
  });

  it("detects member column", () => {
    const result = inferColumnTypes(rows);
    const memberCol = result.find((c) => c.inferredType === "member");
    expect(memberCol).toBeDefined();
    expect(memberCol!.index).toBe(11);
  });

  it("detects item column (non-outreach repeated phrases)", () => {
    const result = inferColumnTypes(rows);
    const itemCol = result.find((c) => c.inferredType === "item");
    expect(itemCol).toBeDefined();
    expect(itemCol!.index).toBe(6);
  });
});

describe("inferColumnTypes - Dataset C (with template symbols and doc links)", () => {
  const rows = [
    "Neil Touati\tMarketing Manager\tShell\t\tneil.touati@shell.com\t\tMonetary Outreach, Donated to CU\t\t\tOwen\tMonetary Outreach Templates - Google Docs\tGO",
    "Jackie Rybacki\tBusiness Development Executive\tRaytheon\t\tjackie.rybacki@rtx.com\t\tMonetary Outreach, Donated to CU\t\t\tOwen\tMonetary Outreach Templates - Google Docs\tGD",
    "Stephen Hamilton\tBusiness Development\tRaytheon\t\tstephen.hamilton@rtx.com\t\tMonetary Outreach, Donated to CU\t\t\tOwen\tMonetary Outreach Templates - Google Docs\tGD",
    "Ashley Menezes\tBusiness Development Representative\tZayo Group\t\tashley.menezes@zayo.com\t\tMonetary Outreach, Donated to CU\t\t\tOwen\tMonetary Outreach Templates - Google Docs\tZayo",
    "Matthew McLean\tSenior Marketing Operations Strategist\tZayo Group\t\tmatthew.mclean@zayo.com\t\tMonetary Outreach, Donated to CU\t\t\tOwen\tMonetary Outreach Templates - Google Docs\tZayo",
  ].map((line) => parseCSVLine(line, "\t"));

  it("detects template symbol column (GO, GD, Zayo)", () => {
    const result = inferColumnTypes(rows);
    const symbolCol = result.find((c) => c.inferredType === "templateSymbol");
    expect(symbolCol).toBeDefined();
    expect(symbolCol!.index).toBe(11);
    expect(symbolCol!.suggestedHeader).toBe("template");
  });

  it("detects doc link column and skips it", () => {
    const result = inferColumnTypes(rows);
    const docCol = result.find((c) => c.inferredType === "docLink");
    expect(docCol).toBeDefined();
    expect(docCol!.index).toBe(10);
  });

  it("detects campaign column separately from template symbol", () => {
    const result = inferColumnTypes(rows);
    const campaignCol = result.find((c) => c.inferredType === "campaign");
    expect(campaignCol).toBeDefined();
    expect(campaignCol!.index).toBe(6);
  });

  it("detects company column correctly (not as item)", () => {
    const result = inferColumnTypes(rows);
    const companyCol = result.find((c) => c.inferredType === "company");
    expect(companyCol).toBeDefined();
    expect(companyCol!.index).toBe(2);
  });
});

describe("parseCSVLine", () => {
  it("splits tab-separated values", () => {
    const result = parseCSVLine("John\tDoe\tjohn@test.com", "\t");
    expect(result).toEqual(["John", "Doe", "john@test.com"]);
  });

  it("handles empty cells", () => {
    const result = parseCSVLine("John\t\tjohn@test.com", "\t");
    expect(result).toEqual(["John", "", "john@test.com"]);
  });

  it("handles quoted commas in CSV", () => {
    const result = parseCSVLine('"Smith, John",john@test.com,Acme', ",");
    expect(result).toEqual(["Smith, John", "john@test.com", "Acme"]);
  });
});

describe("edge cases", () => {
  it("handles single row data", () => {
    const rows = [["John Smith", "Sales Rep", "Acme", "john@acme.com"]];
    const result = inferColumnTypes(rows);
    expect(result.find((c) => c.inferredType === "email")).toBeDefined();
  });

  it("handles all blank columns", () => {
    const rows = [
      ["", "", ""],
      ["", "", ""],
    ];
    const result = inferColumnTypes(rows);
    expect(result.every((c) => c.inferredType === "blank")).toBe(true);
  });

  it("handles rows with varying column counts", () => {
    const rows = [
      ["John", "john@test.com"],
      ["Jane", "jane@test.com", "Acme"],
    ];
    const result = inferColumnTypes(rows);
    expect(result).toHaveLength(3); // Max column count
  });
});
