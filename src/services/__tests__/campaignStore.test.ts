import { describe, it, expect } from "vitest";
import { getCampaignKind } from "../campaignStore";

describe("getCampaignKind", () => {
  it("defaults to outreach when kind is missing", () => {
    expect(getCampaignKind({ kind: undefined })).toBe("outreach");
    expect(getCampaignKind({})).toBe("outreach");
  });

  it("defaults to outreach for null or unknown input", () => {
    expect(getCampaignKind(null)).toBe("outreach");
    expect(getCampaignKind(undefined)).toBe("outreach");
    expect(getCampaignKind({ kind: "garbage" as any })).toBe("outreach");
  });

  it("preserves explicit outreach", () => {
    expect(getCampaignKind({ kind: "outreach" })).toBe("outreach");
  });

  it("preserves follow_up", () => {
    expect(getCampaignKind({ kind: "follow_up" })).toBe("follow_up");
  });

  it("preserves announcement", () => {
    expect(getCampaignKind({ kind: "announcement" })).toBe("announcement");
  });
});
