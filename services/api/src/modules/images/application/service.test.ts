import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { ImageService } from "./service.js";
import { MockImageProvider } from "../infra/mock-provider.js";

describe("ImageService", () => {
  it("searchByLocation appends travel query and getLocationThumbnail", async () => {
    const provider = new MockImageProvider();
    const service = new ImageService(provider);

    const images = await service.searchByLocation("Osaka", { perPage: 1 });
    assert.equal(images.length, 1);
    assert.match(images[0]!.description ?? "", /Osaka/);

    const thumb = await service.getLocationThumbnail("Kyoto");
    assert.ok(thumb);
    assert.match(thumb!, /picsum/);
  });
});
