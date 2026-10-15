import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { DisruptionMonitorService } from "./application/service.js";
import { createDisruptionModule } from "./index.js";

describe("createDisruptionModule", () => {
  it("wires service and routes without starting worker when startWorker is false", () => {
    const mod = createDisruptionModule({
      db: {} as never,
      startWorker: false,
    });

    assert.ok(mod.service instanceof DisruptionMonitorService);
    assert.equal(typeof mod.routes, "function");
    assert.equal(mod.worker, undefined);
  });

  it("starts worker when startWorker is true", () => {
    const mod = createDisruptionModule({
      db: {} as never,
      startWorker: true,
      workerOptions: { intervalMs: 60_000 },
    });

    assert.ok(mod.service instanceof DisruptionMonitorService);
    assert.ok(mod.worker);
    assert.equal(mod.worker?.isRunning(), true);
    mod.worker?.stop();
    assert.equal(mod.worker?.isRunning(), false);
  });
});
