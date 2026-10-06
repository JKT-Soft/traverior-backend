import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { coverImageUrlFromStops, coverLocationFromTrip, imageUrlFromContent } from "./cover-image.js";

describe("coverImageUrlFromStops", () => {
  it("prefers stay cover over origin", () => {
    const url = coverImageUrlFromStops([
      {
        kind: "hub",
        medias: [{ role: "cover", thumbnailUrl: "https://example.com/jakarta.jpg" }],
      },
      {
        kind: "stay",
        medias: [{ role: "cover", thumbnailUrl: "https://example.com/singapore.jpg" }],
      },
    ]);
    assert.equal(url, "https://example.com/singapore.jpg");
    assert.equal(imageUrlFromContent(null), null);
  });

  it("returns null when no image urls exist", () => {
    assert.equal(coverImageUrlFromStops([{ kind: "stay", medias: [] }]), null);
  });
});

describe("coverLocationFromTrip", () => {
  it("uses stay city then destination summary", () => {
    assert.equal(
      coverLocationFromTrip({
        title: "liburan ke singapore",
        destinationSummary: "Singapore",
        journey: { stops: [{ kind: "stay", name: "Singapore", city: "Singapore" }] },
      }),
      "Singapore",
    );
  });
});
