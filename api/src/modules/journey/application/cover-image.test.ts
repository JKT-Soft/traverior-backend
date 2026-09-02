import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { coverImageUrlFromNodes, coverLocationFromTrip, imageUrlFromContent } from "./cover-image.js";

describe("coverImageUrlFromNodes", () => {
  it("prefers stay checkpoint thumbnail over origin", () => {
    const url = coverImageUrlFromNodes([
      {
        type: "CHECKPOINT",
        checkpointKind: "ORIGIN",
        content: { thumbnailUrl: "https://example.com/jakarta.jpg" },
      },
      {
        type: "CHECKPOINT",
        checkpointKind: "STAY",
        content: { thumbnailUrl: "https://example.com/singapore.jpg" },
      },
    ]);
    assert.equal(url, "https://example.com/singapore.jpg");
  });

  it("returns null when no image urls exist", () => {
    assert.equal(coverImageUrlFromNodes([{ type: "CHECKPOINT", content: { city: "Singapore" } }]), null);
    assert.equal(imageUrlFromContent(null), null);
  });
});

describe("coverLocationFromTrip", () => {
  it("uses stay city then destination summary", () => {
    assert.equal(
      coverLocationFromTrip({
        title: "liburan ke singapore",
        destinationSummary: "Singapore",
        nodes: [{ type: "CHECKPOINT", checkpointKind: "STAY", title: "Singapore" }],
      }),
      "Singapore",
    );
  });
});
