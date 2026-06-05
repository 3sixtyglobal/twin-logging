// Copyright 2024 IOTA Stiftung.
// SPDX-License-Identifier: Apache-2.0.
import { MemoryEntityStorageConnector } from "@twin.org/entity-storage-connector-memory";
import { EntityStorageConnectorFactory } from "@twin.org/entity-storage-models";
import { LogLevel } from "@twin.org/logging-models";
import { nameof } from "@twin.org/nameof";
import type { LogEntry } from "../src/entities/logEntry.js";
import { EntityStorageLoggingConnector } from "../src/entityStorageLoggingConnector.js";
import { initSchema } from "../src/schema.js";

describe("EntityStorageLoggingConnector", () => {
	let storage: MemoryEntityStorageConnector<LogEntry>;

	beforeAll(() => {
		initSchema();
	});

	beforeEach(() => {
		storage = new MemoryEntityStorageConnector<LogEntry>({
			entitySchema: nameof<LogEntry>()
		});
		EntityStorageConnectorFactory.register("log-entry", () => storage);
	});

	test("can construct", async () => {
		const logging = new EntityStorageLoggingConnector();
		expect(logging).toBeDefined();
	});

	describe("immediate writes", () => {
		test("writes an entry directly to storage when batching is disabled", async () => {
			const logging = new EntityStorageLoggingConnector({
				config: { batchSize: 0, batchIntervalMs: 0 }
			});
			await logging.log({ level: LogLevel.Info, source: "test", message: "hello" });
			const result = await storage.query(undefined, undefined, undefined, undefined, 100);
			expect(result.entities).toHaveLength(1);
			expect(result.entities[0].message).toBe("hello");
		});

		test("filters entries by configured log level", async () => {
			const logging = new EntityStorageLoggingConnector({
				config: { batchSize: 0, batchIntervalMs: 0, levels: [LogLevel.Error] }
			});
			await logging.log({ level: LogLevel.Info, source: "test", message: "filtered" });
			await logging.log({ level: LogLevel.Error, source: "test", message: "kept" });
			const result = await storage.query(undefined, undefined, undefined, undefined, 100);
			expect(result.entities).toHaveLength(1);
			expect(result.entities[0].message).toBe("kept");
		});
	});

	describe("size-based batching", () => {
		test("holds entries in cache until batch size threshold is reached", async () => {
			const logging = new EntityStorageLoggingConnector({
				config: { batchSize: 3, batchIntervalMs: 0 }
			});
			await logging.log({ level: LogLevel.Info, source: "test", message: "one" });
			await logging.log({ level: LogLevel.Info, source: "test", message: "two" });

			const before = await storage.query(undefined, undefined, undefined, undefined, 100);
			expect(before.entities).toHaveLength(0);

			await logging.log({ level: LogLevel.Info, source: "test", message: "three" });

			const after = await storage.query(undefined, undefined, undefined, undefined, 100);
			expect(after.entities).toHaveLength(3);
		});

		test("refills cache and flushes again after each threshold is reached", async () => {
			const logging = new EntityStorageLoggingConnector({
				config: { batchSize: 2, batchIntervalMs: 0 }
			});
			await logging.log({ level: LogLevel.Info, source: "test", message: "one" });
			await logging.log({ level: LogLevel.Info, source: "test", message: "two" });
			await logging.log({ level: LogLevel.Info, source: "test", message: "three" });
			await logging.log({ level: LogLevel.Info, source: "test", message: "four" });

			const result = await storage.query(undefined, undefined, undefined, undefined, 100);
			expect(result.entities).toHaveLength(4);
		});
	});

	describe("stop", () => {
		test("flushes remaining cached entries on stop", async () => {
			const logging = new EntityStorageLoggingConnector({
				config: { batchSize: 100, batchIntervalMs: 0 }
			});
			await logging.log({ level: LogLevel.Info, source: "test", message: "one" });
			await logging.log({ level: LogLevel.Info, source: "test", message: "two" });

			await logging.stop();

			const result = await storage.query(undefined, undefined, undefined, undefined, 100);
			expect(result.entities).toHaveLength(2);
		});

		test("stop with empty cache completes without error", async () => {
			const logging = new EntityStorageLoggingConnector({
				config: { batchSize: 100, batchIntervalMs: 0 }
			});
			await expect(logging.stop()).resolves.toBeUndefined();
		});
	});

	describe("query", () => {
		test("flushes cache before returning results", async () => {
			const logging = new EntityStorageLoggingConnector({
				config: { batchSize: 100, batchIntervalMs: 0 }
			});
			await logging.log({ level: LogLevel.Info, source: "test", message: "buffered" });

			const result = await logging.query();
			expect(result.entities).toHaveLength(1);
			expect(result.entities[0].message).toBe("buffered");
		});
	});

	describe("timer-based batching", () => {
		beforeEach(() => {
			vi.useFakeTimers();
		});

		afterEach(() => {
			vi.useRealTimers();
		});

		test("flushes cache after the configured interval elapses", async () => {
			const logging = new EntityStorageLoggingConnector({
				config: { batchSize: 0, batchIntervalMs: 1000 }
			});
			await logging.start();
			await logging.log({ level: LogLevel.Info, source: "test", message: "timed" });

			const before = await storage.query(undefined, undefined, undefined, undefined, 100);
			expect(before.entities).toHaveLength(0);

			await vi.advanceTimersByTimeAsync(1000);

			const after = await storage.query(undefined, undefined, undefined, undefined, 100);
			expect(after.entities).toHaveLength(1);

			await logging.stop();
		});

		test("re-queues entries and keeps timer running after a write exception", async () => {
			const logging = new EntityStorageLoggingConnector({
				config: { batchSize: 0, batchIntervalMs: 1000 }
			});
			await logging.start();

			vi.spyOn(storage, "setBatch").mockRejectedValueOnce(new Error("Storage unavailable"));
			await logging.log({ level: LogLevel.Info, source: "test", message: "fail" });
			await vi.advanceTimersByTimeAsync(1000);

			// "fail" entry was re-queued; "ok" is added after the failed flush
			await logging.log({ level: LogLevel.Info, source: "test", message: "ok" });
			await vi.advanceTimersByTimeAsync(1000);

			const result = await storage.query(undefined, undefined, undefined, undefined, 100);
			// Both entries written on the second flush (re-queued "fail" + "ok")
			expect(result.entities).toHaveLength(2);

			await logging.stop();
		});

		test("starts timer lazily on first log call without explicit start", async () => {
			const logging = new EntityStorageLoggingConnector({
				config: { batchSize: 0, batchIntervalMs: 1000 }
			});
			// Deliberately skip start()
			await logging.log({ level: LogLevel.Info, source: "test", message: "lazy" });

			const before = await storage.query(undefined, undefined, undefined, undefined, 100);
			expect(before.entities).toHaveLength(0);

			await vi.advanceTimersByTimeAsync(1000);

			const after = await storage.query(undefined, undefined, undefined, undefined, 100);
			expect(after.entities).toHaveLength(1);

			await logging.stop();
		});

		test("trims oldest re-queued entries to maxCacheSize after flush failure", async () => {
			const logging = new EntityStorageLoggingConnector({
				config: { batchSize: 0, batchIntervalMs: 1000, maxCacheSize: 2 }
			});
			await logging.start();

			vi.spyOn(storage, "setBatch").mockRejectedValueOnce(new Error("Storage unavailable"));
			for (let i = 0; i < 5; i++) {
				await logging.log({ level: LogLevel.Info, source: "test", message: `entry-${i}` });
			}
			// First flush fails: 5 entries re-queued then trimmed to 2 (the newest)
			await vi.advanceTimersByTimeAsync(1000);

			// Second flush succeeds: only the 2 surviving entries reach storage
			await vi.advanceTimersByTimeAsync(1000);

			const result = await storage.query(undefined, undefined, undefined, undefined, 100);
			expect(result.entities).toHaveLength(2);

			await logging.stop();
		});

		test("stop clears the timer so no further flushes occur", async () => {
			const logging = new EntityStorageLoggingConnector({
				config: { batchSize: 0, batchIntervalMs: 1000 }
			});
			await logging.start();
			await logging.log({ level: LogLevel.Info, source: "test", message: "one" });
			await logging.stop();

			const afterStop = await storage.query(undefined, undefined, undefined, undefined, 100);
			expect(afterStop.entities).toHaveLength(1);

			await vi.advanceTimersByTimeAsync(5000);

			const afterAdvance = await storage.query(undefined, undefined, undefined, undefined, 100);
			expect(afterAdvance.entities).toHaveLength(1);
		});
	});
});
