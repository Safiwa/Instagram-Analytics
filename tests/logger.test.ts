import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { log } from "../src/core/logging/logger";

const flush = () => new Promise<void>((resolve) => setImmediate(resolve));

describe("safe logger", () => {
  beforeEach(() => {
    vi.spyOn(console, "info").mockImplementation(() => undefined);
    vi.spyOn(console, "warn").mockImplementation(() => undefined);
    vi.spyOn(console, "error").mockImplementation(() => undefined);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("enqueues synchronously, returns void, and flushes asynchronously", async () => {
    const result = log.info("sync-check", { handle: "nora.style" });

    expect(result).toBeUndefined();
    expect(console.info).not.toHaveBeenCalled();

    await flush();

    expect(console.info).toHaveBeenCalledTimes(1);
    expect(console.info).toHaveBeenCalledWith(expect.stringContaining("INFO sync-check"));
  });

  it("routes each level to its matching console method", async () => {
    log.info("info-line");
    log.warn("warn-line");
    log.error("error-line");

    await flush();

    expect(console.info).toHaveBeenCalledWith(expect.stringContaining("INFO info-line"));
    expect(console.warn).toHaveBeenCalledWith(expect.stringContaining("WARN warn-line"));
    expect(console.error).toHaveBeenCalledWith(expect.stringContaining("ERROR error-line"));
  });

  it("caps the queue at 200 entries and warns once on overflow", async () => {
    for (let index = 0; index < 205; index += 1) {
      log.info(`entry-${index}`);
    }

    await flush();

    expect(console.info).toHaveBeenCalledTimes(199);
    expect(console.warn).toHaveBeenCalledTimes(1);
    expect(console.warn).toHaveBeenCalledWith(expect.stringContaining("queue overflow"));
  });
});
