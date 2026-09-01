import assert from "node:assert/strict";
import { afterEach, describe, it } from "node:test";
import { loadEnv } from "../../../config/env.js";
import { baseEnv, stubFetch } from "../../../test/helpers.js";
import {
  createUnsplashImageProvider,
  UnsplashImageProvider,
} from "./unsplash-provider.js";
import { MockImageProvider } from "./mock-provider.js";

let restoreFetch: (() => void) | undefined;

afterEach(() => {
  restoreFetch?.();
  restoreFetch = undefined;
});

describe("UnsplashImageProvider", () => {
  it("createUnsplashImageProvider requires key", () => {
    assert.throws(
      () => createUnsplashImageProvider(loadEnv(baseEnv({ PROVIDER_IMAGES: "unsplash" }))),
      /UNSPLASH/,
    );
    assert.equal(
      createUnsplashImageProvider(
        loadEnv(baseEnv({ PROVIDER_IMAGES: "unsplash", UNSPLASH_ACCESS_KEY: "k" })),
      ).name,
      "unsplash",
    );
  });

  it("maps search results and handles errors", async () => {
    const p = new UnsplashImageProvider("k");

    restoreFetch = stubFetch(
      async () => ({ ok: false, status: 401, text: async () => "bad key" }) as Response,
    );
    await assert.rejects(() => p.searchImages({ query: "osaka" }), /Unsplash/);

    restoreFetch();
    restoreFetch = stubFetch(async (input) => {
      const url = String(input);
      assert.match(url, /search\/photos/);
      assert.match(url, /query=osaka/);
      return {
        ok: true,
        json: async () => ({
          results: [
            {
              id: "photo-1",
              description: "Osaka castle",
              alt_description: "castle",
              width: 4000,
              height: 3000,
              color: "#112233",
              urls: {
                regular: "https://images.unsplash.com/regular",
                small: "https://images.unsplash.com/small",
                full: "https://images.unsplash.com/full",
              },
              links: {
                html: "https://unsplash.com/photos/photo-1",
                download_location: "https://api.unsplash.com/photos/photo-1/download",
              },
              user: {
                name: "Ada",
                links: { html: "https://unsplash.com/@ada" },
              },
            },
          ],
        }),
      } as Response;
    });

    const images = await p.searchImages({ query: "osaka", perPage: 3, orientation: "landscape" });
    assert.equal(images.length, 1);
    assert.equal(images[0]?.photoId, "photo-1");
    assert.equal(images[0]?.imageUrl, "https://images.unsplash.com/regular");
    assert.equal(images[0]?.thumbUrl, "https://images.unsplash.com/small");
    assert.equal(images[0]?.photographerName, "Ada");

    restoreFetch();
    restoreFetch = stubFetch(
      async () => ({ ok: true, json: async () => ({ results: [] }) }) as Response,
    );
    assert.deepEqual(await p.searchImages({ query: "nowhere" }), []);
  });
});

describe("MockImageProvider", () => {
  it("returns picsum urls", async () => {
    const images = await new MockImageProvider().searchImages({ query: "Tokyo", perPage: 2 });
    assert.equal(images.length, 2);
    assert.match(images[0]!.imageUrl, /picsum/);
  });
});
