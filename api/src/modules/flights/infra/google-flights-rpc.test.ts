import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  buildRpcPayload,
  buildRpcUrl,
  parseHtmlShoppingResponse,
  parseRpcShoppingResponse,
  toLocalIso,
} from "./google-flights-rpc.js";

function wrapPayload(payload: unknown): string {
  const inner = JSON.stringify(payload);
  const outer = JSON.stringify([["wrb.fr", null, inner]]);
  return `)]}'\n${outer}`;
}

describe("google-flights-rpc", () => {
  it("builds RPC payload for one-way and round-trip", () => {
    const oneWay = decodeURIComponent(buildRpcPayload({
      origin: "cgk",
      destination: "kix",
      departureDate: "2026-11-15",
      adults: 2,
      cabinClass: "business",
    }).replace(/^f\.req=/, ""));
    const oneWayParsed = JSON.parse(oneWay) as [null, string];
    const oneWayFilters = JSON.parse(oneWayParsed[1]!) as unknown[];
    const oneWayInner = oneWayFilters[1] as unknown[];
    assert.equal(oneWayInner[2], 2); // one-way trip
    assert.equal(oneWayInner[5], 3); // business seat
    assert.deepEqual(oneWayInner[6], [2, 0, 0, 0]);
    assert.equal((oneWayInner[13] as unknown[]).length, 1);

    const round = decodeURIComponent(buildRpcPayload({
      origin: "CGK",
      destination: "KIX",
      departureDate: "2026-11-15",
      returnDate: "2026-11-25",
    }).replace(/^f\.req=/, ""));
    const roundFilters = JSON.parse((JSON.parse(round) as [null, string])[1]!) as unknown[];
    const roundInner = roundFilters[1] as unknown[];
    assert.equal(roundInner[2], 1); // round-trip
    assert.equal((roundInner[13] as unknown[]).length, 2);
  });

  it("builds RPC url with currency and language", () => {
    assert.equal(buildRpcUrl(), buildRpcUrl());
    assert.match(buildRpcUrl("idr", "id"), /curr=IDR/);
    assert.match(buildRpcUrl("USD", "en"), /hl=en/);
  });

  it("parses shopping results from RPC envelope", () => {
    const payload = [
      null,
      null,
      [
        [
          [
            [
              "Nonstop",
              ["Garuda Indonesia"],
              [
                [
                  null,
                  null,
                  null,
                  "CGK",
                  "Soekarno-Hatta",
                  "Kansai International",
                  "KIX",
                  null,
                  [8, 30],
                  null,
                  [18, 45],
                  435,
                  null,
                  null,
                  null,
                  null,
                  null,
                  "Boeing 777",
                  null,
                  null,
                  [2026, 11, 15],
                  [2026, 11, 15],
                  ["GA", "Garuda Indonesia"],
                  null,
                  "GA882",
                ],
              ],
            ],
            [[null, 425], "CjRI-ga-token"],
          ],
        ],
      ],
      [
        [
          [
            [
              "1 stop",
              ["Japan Airlines"],
              [
                [
                  null,
                  null,
                  null,
                  "CGK",
                  "Jakarta",
                  "NRT",
                  "Narita",
                  null,
                  [22, 0],
                  null,
                  [7, 10],
                  370,
                  null,
                  null,
                  null,
                  null,
                  null,
                  "Boeing 787",
                  null,
                  null,
                  [2026, 11, 15],
                  [2026, 11, 16],
                  ["JL"],
                  null,
                  "JL726",
                ],
                [
                  null,
                  null,
                  null,
                  "NRT",
                  "Narita",
                  "Osaka",
                  "ITM",
                  null,
                  [10, 0],
                  null,
                  [11, 30],
                  90,
                  null,
                  null,
                  null,
                  null,
                  null,
                  "Embraer",
                  null,
                  null,
                  [2026, 11, 16],
                  [2026, 11, 16],
                  ["JL"],
                  null,
                  "JL221",
                ],
              ],
            ],
            [[null, 510], "CjRI-jl-token"],
          ],
        ],
      ],
      null,
      null,
      null,
      [
        null,
        [
          [],
          [
            ["GA", "Garuda Indonesia"],
            ["JL", "Japan Airlines"],
          ],
        ],
      ],
    ];

    const result = parseRpcShoppingResponse(wrapPayload(payload), "USD");
    assert.equal(result.itineraries.length, 2);
    assert.equal(result.itineraries[0]?.price, 425);
    assert.equal(result.itineraries[0]?.bookingToken, "CjRI-ga-token");
    assert.equal(result.itineraries[0]?.segments[0]?.flightNumber, "GA882");
    assert.equal(result.itineraries[0]?.segments[0]?.from.code, "CGK");
    assert.equal(result.itineraries[0]?.segments[0]?.to.code, "KIX");
    assert.equal(result.itineraries[0]?.segments[0]?.departureAt, "2026-11-15T08:30:00");
    assert.equal(result.itineraries[1]?.segments.length, 2);
    assert.equal(result.itineraries[1]?.segments[1]?.to.code, "ITM");
    assert.equal(result.airlines.length, 2);
  });

  it("formats local iso timestamps", () => {
    assert.equal(toLocalIso([2026, 1, 2], [3, 4]), "2026-01-02T03:04:00");
  });

  it("parses HTML ds:1 embed and modern carrier blob", () => {
    const payload = [
      null,
      null,
      [
        [
          [
            [
              "TR",
              ["Scoot"],
              [
                [
                  null,
                  null,
                  null,
                  "CGK",
                  "Soekarno",
                  "Changi",
                  "SIN",
                  null,
                  [9, 35],
                  null,
                  [12, 25],
                  110,
                  null,
                  null,
                  null,
                  null,
                  null,
                  "A320",
                  null,
                  null,
                  [2026, 12, 4],
                  [2026, 12, 4],
                  ["TR", "275", null, "Scoot"],
                  null,
                  null,
                ],
              ],
            ],
            [[null, 173], "CjRI-tr-token"],
          ],
        ],
      ],
    ];
    const html = `<html><script class="ds:1">AF_initDataCallback({key: 'ds:1', data:${JSON.stringify(payload)}, sideChannel: {}});</script></html>`;
    const result = parseHtmlShoppingResponse(html, "USD");
    assert.equal(result.itineraries.length, 1);
    assert.equal(result.itineraries[0]?.price, 173);
    assert.equal(result.itineraries[0]?.bookingToken, "CjRI-tr-token");
    assert.equal(result.itineraries[0]?.segments[0]?.airlineCode, "TR");
    assert.equal(result.itineraries[0]?.segments[0]?.airlineName, "Scoot");
    assert.equal(result.itineraries[0]?.segments[0]?.flightNumber, "TR275");
  });

  it("throws on empty / captcha-like empty parse", () => {
    assert.throws(() => parseRpcShoppingResponse(")]}'\n", "USD"), /empty response/);
  });
});
