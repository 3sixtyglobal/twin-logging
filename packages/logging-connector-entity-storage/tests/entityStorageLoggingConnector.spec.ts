// Copyright 2024 IOTA Stiftung.
// SPDX-License-Identifier: Apache-2.0.
import type { IPlatformComponent } from "@twin.org/api-models";
import { ContextIdKeys, ContextIdStore } from "@twin.org/context";
import { ComponentFactory, Is } from "@twin.org/core";
import { MemoryEntityStorageConnector } from "@twin.org/entity-storage-connector-memory";
import { EntityStorageConnectorFactory } from "@twin.org/entity-storage-models";
import { type ILogEntry, LogLevel } from "@twin.org/logging-models";
import { nameof } from "@twin.org/nameof";
import type { LogEntry } from "../src/entities/logEntry.js";
import { EntityStorageLoggingConnector } from "../src/entityStorageLoggingConnector.js";
import { initSchema } from "../src/schema.js";

function makePlatformComponent(multiTenant: boolean): IPlatformComponent {
	return {
		className: () => "MockPlatformComponent",
		isMultiTenant: () => multiTenant,
		execute: async (method: () => Promise<void>) => {
			if (multiTenant) {
				await ContextIdStore.run({ [ContextIdKeys.Tenant]: "test-tenant" }, method);
			} else {
				await method();
			}
		},
		getLocalOriginContext: async () => undefined
	};
}

describe("EntityStorageLoggingConnector", () => {
	let storage: MemoryEntityStorageConnector<LogEntry>;

	beforeAll(() => {
		initSchema();
	});

	beforeEach(() => {
		storage = new MemoryEntityStorageConnector<LogEntry>({
			entitySchema: nameof<LogEntry>(),
			config: { storageKey: "log-entry" }
		});
		EntityStorageConnectorFactory.register("log-entry", () => storage);
	});

	afterEach(async () => {
		await storage.teardown();
	});

	test("can construct", async () => {
		ComponentFactory.register("platform", () => makePlatformComponent(false));
		const logging = new EntityStorageLoggingConnector();
		expect(logging).toBeDefined();
	});

	/**
	 * All behavioural tests are run three times:
	 * 1. single-tenant            – isMultiTenant()=false, no tenant context
	 * 2. multi-tenant, tenant set – isMultiTenant()=true, tenant ID present in context
	 * 3. multi-tenant, no tenant  – isMultiTenant()=true, no tenant ID in context
	 * Scenarios 1 & 2 route batched flushes through ContextIdStore.run(contextIds, …).
	 * Scenario 3 routes batched flushes through platformComponent.execute(…) so the real
	 * component can broadcast the write across all tenants.
	 */
	describe.each([
		{ label: "single-tenant", multiTenant: false, inTenantContext: false },
		{ label: "multi-tenant (tenant context set)", multiTenant: true, inTenantContext: true },
		{ label: "multi-tenant (no tenant context)", multiTenant: true, inTenantContext: false }
	])("$label", ({ multiTenant, inTenantContext }) => {
		let platformComponent: IPlatformComponent;
		let executeSpy: ReturnType<typeof vi.spyOn>;

		beforeEach(() => {
			platformComponent = makePlatformComponent(multiTenant);
			executeSpy = vi.spyOn(platformComponent, "execute");
			ComponentFactory.register("platform", () => platformComponent);
		});

		async function logInContext(
			logging: EntityStorageLoggingConnector,
			entry: ILogEntry
		): Promise<void> {
			if (inTenantContext) {
				await ContextIdStore.run({ [ContextIdKeys.Tenant]: "test-tenant" }, async () =>
					logging.log(entry)
				);
			} else {
				await logging.log(entry);
			}
		}

		describe("immediate writes", () => {
			test("writes an entry directly to storage when batching is disabled", async () => {
				const logging = new EntityStorageLoggingConnector({
					config: { batchSize: 0, batchIntervalMs: 0 }
				});
				await logInContext(logging, { level: LogLevel.Info, source: "test", message: "hello" });
				const result = await storage.query(undefined, undefined, undefined, undefined, 100);
				expect(result.entities).toHaveLength(1);
				expect(result.entities[0].message).toBe("hello");
			});

			test("routes immediate writes through platformComponent.execute", async () => {
				const logging = new EntityStorageLoggingConnector({
					config: { batchSize: 0, batchIntervalMs: 0 }
				});
				await logInContext(logging, { level: LogLevel.Info, source: "test", message: "hello" });
				expect(executeSpy).toHaveBeenCalledTimes(1);
			});

			test("filters entries by configured log level", async () => {
				const logging = new EntityStorageLoggingConnector({
					config: { batchSize: 0, batchIntervalMs: 0, levels: [LogLevel.Error] }
				});
				await logInContext(logging, { level: LogLevel.Info, source: "test", message: "filtered" });
				await logInContext(logging, { level: LogLevel.Error, source: "test", message: "kept" });
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
				await logInContext(logging, { level: LogLevel.Info, source: "test", message: "one" });
				await logInContext(logging, { level: LogLevel.Info, source: "test", message: "two" });

				const before = await storage.query(undefined, undefined, undefined, undefined, 100);
				expect(before.entities).toHaveLength(0);

				await logInContext(logging, { level: LogLevel.Info, source: "test", message: "three" });

				// The threshold flush is detached, so the write lands shortly after log() resolves.
				await vi.waitFor(async () => {
					const after = await storage.query(undefined, undefined, undefined, undefined, 100);
					expect(after.entities).toHaveLength(3);
				});
			});

			test("refills cache and flushes again after each threshold is reached", async () => {
				const logging = new EntityStorageLoggingConnector({
					config: { batchSize: 2, batchIntervalMs: 0 }
				});
				await logInContext(logging, { level: LogLevel.Info, source: "test", message: "one" });
				await logInContext(logging, { level: LogLevel.Info, source: "test", message: "two" });
				await logInContext(logging, { level: LogLevel.Info, source: "test", message: "three" });
				await logInContext(logging, { level: LogLevel.Info, source: "test", message: "four" });

				await vi.waitFor(async () => {
					const result = await storage.query(undefined, undefined, undefined, undefined, 100);
					expect(result.entities).toHaveLength(4);
				});
			});

			test("does not block the caller that fills the batch on the storage write", async () => {
				const logging = new EntityStorageLoggingConnector({
					config: { batchSize: 2, batchIntervalMs: 0 }
				});

				const setBatch = storage.setBatch.bind(storage);
				vi.spyOn(storage, "setBatch").mockImplementation(async entities => {
					await new Promise(resolve => setTimeout(resolve, 300));
					await setBatch(entities);
				});

				await logInContext(logging, { level: LogLevel.Info, source: "test", message: "one" });

				const start = Date.now();
				await logInContext(logging, { level: LogLevel.Info, source: "test", message: "two" });
				expect(Date.now() - start).toBeLessThan(150);

				// stop still waits for the detached write, so nothing is lost.
				await logging.stop();
				const result = await storage.query(undefined, undefined, undefined, undefined, 100);
				expect(result.entities).toHaveLength(2);
			});

			test("enqueues a concurrent log call while a write is in progress", async () => {
				const logging = new EntityStorageLoggingConnector({
					config: { batchSize: 2, batchIntervalMs: 0 }
				});

				const setBatch = storage.setBatch.bind(storage);
				vi.spyOn(storage, "setBatch").mockImplementation(async entities => {
					await new Promise(resolve => setTimeout(resolve, 300));
					await setBatch(entities);
				});

				await logInContext(logging, { level: LogLevel.Info, source: "test", message: "one" });
				await logInContext(logging, { level: LogLevel.Info, source: "test", message: "two" });

				// The threshold write is in flight and in flight, but the entry must
				// still be accepted rather than rejected with a mutex lock timeout.
				await expect(
					logInContext(logging, { level: LogLevel.Info, source: "test", message: "three" })
				).resolves.toBeUndefined();

				await logging.stop();
				const result = await storage.query(undefined, undefined, undefined, undefined, 100);
				expect(result.entities).toHaveLength(3);
			});

			test("flush resolves while entries keep arriving during the write", async () => {
				const logging = new EntityStorageLoggingConnector({
					config: { batchSize: 2, batchIntervalMs: 0 }
				});

				const setBatch = storage.setBatch.bind(storage);
				vi.spyOn(storage, "setBatch").mockImplementation(async entities => {
					await new Promise(resolve => setTimeout(resolve, 50));
					await setBatch(entities);
				});

				await logInContext(logging, { level: LogLevel.Info, source: "test", message: "seed-1" });
				await logInContext(logging, { level: LogLevel.Info, source: "test", message: "seed-2" });

				// Keep logging faster than the writes complete, for far longer than the flush
				// should need. A flush that drained until the cache emptied would be held here
				// for the whole 400ms rather than writing only the entries it took.
				const producerStart = Date.now();
				const producer = (async () => {
					for (let elapsed = 0; elapsed < 400; elapsed = Date.now() - producerStart) {
						await logInContext(logging, {
							level: LogLevel.Info,
							source: "test",
							message: `extra-${elapsed}`
						});
						await new Promise(resolve => setTimeout(resolve, 1));
					}
				})();

				const start = Date.now();
				await logging.flush();
				expect(Date.now() - start).toBeLessThan(200);

				await producer;
				await logging.stop();
			});

			// In multi-tenant mode without a tenant context the perTenant flag is set on each
			// batch entry, so flush drains the perTenant bucket via platformComponent.execute().
			// In single-tenant mode or when a tenant IS already set in context, perTenant is
			// false and flush replays each entry's captured contextIds directly - execute() is
			// never called.
			test("routes batched flush through platformComponent.execute only when no tenant context", async () => {
				const logging = new EntityStorageLoggingConnector({
					config: { batchSize: 3, batchIntervalMs: 0 }
				});
				await logInContext(logging, { level: LogLevel.Info, source: "test", message: "one" });
				await logInContext(logging, { level: LogLevel.Info, source: "test", message: "two" });
				await logInContext(logging, { level: LogLevel.Info, source: "test", message: "three" });

				// Wait for the detached threshold flush to finish before inspecting the routing.
				await logging.flush();

				if (multiTenant && !inTenantContext) {
					expect(executeSpy).toHaveBeenCalledTimes(1);
				} else {
					expect(executeSpy).not.toHaveBeenCalled();
				}
			});
		});

		describe("overload", () => {
			let originalSetBatch: (entities: LogEntry[]) => Promise<void>;

			beforeEach(() => {
				originalSetBatch = storage.setBatch.bind(storage);
			});

			// Replace setBatch with an instrumented version so the tests can assert on what
			// reached storage, how many writes overlapped, and how entries were batched.
			function instrumentWrites(
				delayMs: number,
				failures = 0
			): {
				writtenIds: string[];
				maxConcurrent: number;
				calls: number;
				batchSizes: number[];
			} {
				const stats = {
					writtenIds: [] as string[],
					maxConcurrent: 0,
					calls: 0,
					batchSizes: [] as number[]
				};
				let concurrent = 0;
				let remainingFailures = failures;

				vi.spyOn(storage, "setBatch").mockImplementation(async (entities: LogEntry[]) => {
					concurrent++;
					stats.maxConcurrent = Math.max(stats.maxConcurrent, concurrent);
					stats.calls++;
					stats.batchSizes.push(entities.length);
					try {
						if (delayMs > 0) {
							await new Promise(resolve => setTimeout(resolve, delayMs));
						}
						if (remainingFailures > 0) {
							remainingFailures--;
							throw new Error("write failed");
						}
						await originalSetBatch(entities);
						for (const entity of entities) {
							stats.writtenIds.push(entity.id);
						}
					} finally {
						concurrent--;
					}
				});

				return stats;
			}

			// Yield to the macrotask queue so a threshold flush scheduled on a zero delay timer
			// actually starts. Without this the test stays in an unbroken chain of microtasks and
			// the write never begins, so nothing is ever in flight.
			async function startPendingFlush(): Promise<void> {
				await new Promise(resolve => setTimeout(resolve, 0));
			}

			async function storedCount(): Promise<number> {
				let total = 0;
				let cursor: string | undefined;
				do {
					const page = await storage.query(undefined, undefined, ["id"], cursor, 1000);
					total += page.entities.length;
					cursor = page.cursor;
				} while (!Is.empty(cursor));
				return total;
			}

			// Log count entries, optionally yielding to the macrotask queue every yieldEvery
			// entries so the threshold flushes actually start and writes overlap the logging,
			// as they would in an application rather than in one unbroken await chain.
			async function logMany(
				logging: EntityStorageLoggingConnector,
				count: number,
				prefix: string,
				yieldEvery = 0
			): Promise<void> {
				for (let i = 0; i < count; i++) {
					await logInContext(logging, {
						level: LogLevel.Info,
						source: "test",
						message: `${prefix}-${i}`
					});
					if (yieldEvery > 0 && (i + 1) % yieldEvery === 0) {
						await startPendingFlush();
					}
				}
			}

			test("stores every entry when logging far outpaces the storage writes", async () => {
				const stats = instrumentWrites(5);
				const logging = new EntityStorageLoggingConnector({
					config: { batchSize: 10, batchIntervalMs: 0 }
				});

				await logMany(logging, 200, "burst", 5);
				await logging.stop();

				expect(await storedCount()).toBe(200);
				expect(new Set(stats.writtenIds).size).toBe(stats.writtenIds.length);
			});

			test("writes each entry exactly once under many concurrent flushes", async () => {
				const stats = instrumentWrites(10);
				const logging = new EntityStorageLoggingConnector({
					config: { batchSize: 5, batchIntervalMs: 0 }
				});

				await logMany(logging, 60, "concurrent", 4);
				await Promise.all(Array.from({ length: 12 }, async () => logging.flush()));
				await logging.stop();

				expect(stats.writtenIds).toHaveLength(60);
				expect(new Set(stats.writtenIds).size).toBe(60);
				expect(await storedCount()).toBe(60);
			});

			test("never runs two storage writes at the same time", async () => {
				const stats = instrumentWrites(15);
				const logging = new EntityStorageLoggingConnector({
					config: { batchSize: 4, batchIntervalMs: 0 }
				});

				await logMany(logging, 40, "serial", 4);
				await Promise.all(Array.from({ length: 8 }, async () => logging.flush()));
				await logging.stop();

				expect(stats.calls).toBeGreaterThan(1);
				expect(stats.maxConcurrent).toBe(1);
			});

			test("resolves a crowd of flush calls waiting on one slow write", async () => {
				const stats = instrumentWrites(80);
				const logging = new EntityStorageLoggingConnector({
					config: { batchSize: 2, batchIntervalMs: 0 }
				});

				await logMany(logging, 2, "slow");
				await startPendingFlush();

				const start = Date.now();
				await Promise.all(Array.from({ length: 25 }, async () => logging.flush()));

				// Every waiter shares the same passes, so this is bounded by a couple of writes
				// rather than by the number of callers.
				expect(Date.now() - start).toBeLessThan(500);

				await logging.stop();
				expect(await storedCount()).toBe(2);
				expect(stats.maxConcurrent).toBe(1);
			});

			test("keeps log calls fast while the storage writes are slow", async () => {
				instrumentWrites(50);
				const logging = new EntityStorageLoggingConnector({
					config: { batchSize: 5, batchIntervalMs: 0 }
				});

				let slowest = 0;
				for (let i = 0; i < 60; i++) {
					const start = Date.now();
					await logInContext(logging, {
						level: LogLevel.Info,
						source: "test",
						message: `fast-${i}`
					});
					slowest = Math.max(slowest, Date.now() - start);
					// Let the threshold write start, so most of these calls are made while a
					// 50ms write is in flight.
					await startPendingFlush();
				}

				expect(slowest).toBeLessThan(50);

				await logging.stop();
				expect(await storedCount()).toBe(60);
			});

			test("loses nothing when logs, flushes and queries interleave", async () => {
				const stats = instrumentWrites(3);
				const logging = new EntityStorageLoggingConnector({
					config: { batchSize: 7, batchIntervalMs: 0 }
				});

				const work: Promise<unknown>[] = [];
				for (let i = 0; i < 120; i++) {
					work.push(
						logInContext(logging, {
							level: LogLevel.Info,
							source: "test",
							message: `mixed-${i}`
						})
					);
					if (i % 10 === 0) {
						work.push(logging.flush());
					}
					if (i % 25 === 0) {
						work.push(logging.query());
					}
				}
				await Promise.all(work);
				await logging.stop();

				expect(await storedCount()).toBe(120);
				expect(new Set(stats.writtenIds).size).toBe(stats.writtenIds.length);
				expect(stats.maxConcurrent).toBe(1);
			});

			test("handles a burst of concurrent log calls far larger than the batch size", async () => {
				const stats = instrumentWrites(2);
				const logging = new EntityStorageLoggingConnector({
					config: { batchSize: 10, batchIntervalMs: 0 }
				});

				await Promise.all(
					Array.from({ length: 500 }, async (value, i) =>
						logInContext(logging, {
							level: LogLevel.Info,
							source: "test",
							message: `flood-${i}`
						})
					)
				);
				await logging.stop();

				expect(await storedCount()).toBe(500);
				expect(new Set(stats.writtenIds).size).toBe(500);
			});

			test("stop stores everything logged before it was called", async () => {
				instrumentWrites(40);
				const logging = new EntityStorageLoggingConnector({
					config: { batchSize: 5, batchIntervalMs: 0 }
				});

				await logMany(logging, 5, "pre");
				await startPendingFlush();
				// The threshold write is now in flight; these land while it runs.
				await logMany(logging, 4, "during");

				await logging.stop();

				expect(await storedCount()).toBe(9);
			});

			test("flush writes entries logged while an earlier write was in flight", async () => {
				const stats = instrumentWrites(60);
				const logging = new EntityStorageLoggingConnector({
					config: { batchSize: 2, batchIntervalMs: 0 }
				});

				await logMany(logging, 2, "first");
				await startPendingFlush();

				// Cached while the first write is still running, so the flush below has to wait
				// for that write and then run a pass of its own to cover these.
				await logMany(logging, 3, "second");

				await logging.flush();

				expect(await storedCount()).toBe(5);
				expect(stats.maxConcurrent).toBe(1);
			});

			test("retries and stores everything after repeated write failures", async () => {
				instrumentWrites(0, 2);
				const logging = new EntityStorageLoggingConnector({
					config: { batchSize: 100, batchIntervalMs: 0 }
				});

				await logMany(logging, 10, "retry");

				await logging.flush();
				expect(await storedCount()).toBe(0);

				await logging.flush();
				expect(await storedCount()).toBe(0);

				await logging.flush();
				expect(await storedCount()).toBe(10);
			});

			test("caps the cache at maxCacheSize when logging outruns the flushes", async () => {
				instrumentWrites(0);
				// Nothing drains the cache on its own, so every entry beyond the limit has to be
				// dropped as it is logged rather than accumulating.
				const logging = new EntityStorageLoggingConnector({
					config: { batchSize: 1000, batchIntervalMs: 0, maxCacheSize: 25 }
				});

				await logMany(logging, 300, "capped");
				await logging.flush();

				expect(await storedCount()).toBe(25);
			});

			test("caps the cache at maxCacheSize while every write fails", async () => {
				instrumentWrites(0, Number.MAX_SAFE_INTEGER);
				const logging = new EntityStorageLoggingConnector({
					config: { batchSize: 10, batchIntervalMs: 0, maxCacheSize: 25 }
				});

				await logMany(logging, 300, "failing");
				await logging.flush();

				// Let the writes succeed again. Only what survived the trim can be written, which
				// shows the cache did not grow with all 300 entries.
				instrumentWrites(0);
				await logging.flush();

				const stored = await storedCount();
				expect(stored).toBeGreaterThan(0);
				expect(stored).toBeLessThanOrEqual(25);
			});

			test("survives flush, query and stop being called concurrently", async () => {
				const stats = instrumentWrites(20);
				const logging = new EntityStorageLoggingConnector({
					config: { batchSize: 8, batchIntervalMs: 0 }
				});

				await logMany(logging, 40, "race", 6);
				await startPendingFlush();

				await Promise.all([logging.flush(), logging.stop(), logging.flush(), logging.query()]);

				expect(await storedCount()).toBe(40);
				expect(new Set(stats.writtenIds).size).toBe(stats.writtenIds.length);
				expect(stats.maxConcurrent).toBe(1);
			});

			test("timer and threshold flushes together write every entry once", async () => {
				const stats = instrumentWrites(5);
				const logging = new EntityStorageLoggingConnector({
					config: { batchSize: 6, batchIntervalMs: 10 }
				});
				await logging.start();

				for (let i = 0; i < 80; i++) {
					await logInContext(logging, {
						level: LogLevel.Info,
						source: "test",
						message: `both-${i}`
					});
					if (i % 7 === 0) {
						await new Promise(resolve => setTimeout(resolve, 12));
					}
				}

				await logging.stop();

				expect(await storedCount()).toBe(80);
				expect(new Set(stats.writtenIds).size).toBe(80);
				expect(stats.maxConcurrent).toBe(1);
			});
		});

		describe("stop", () => {
			test("flushes remaining cached entries on stop", async () => {
				const logging = new EntityStorageLoggingConnector({
					config: { batchSize: 100, batchIntervalMs: 0 }
				});
				await logInContext(logging, { level: LogLevel.Info, source: "test", message: "one" });
				await logInContext(logging, { level: LogLevel.Info, source: "test", message: "two" });

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
				await logInContext(logging, { level: LogLevel.Info, source: "test", message: "buffered" });

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
				await logInContext(logging, { level: LogLevel.Info, source: "test", message: "timed" });

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
				await logInContext(logging, { level: LogLevel.Info, source: "test", message: "fail" });
				await vi.advanceTimersByTimeAsync(1000);

				// "fail" entry was re-queued; "ok" is added after the failed flush
				await logInContext(logging, { level: LogLevel.Info, source: "test", message: "ok" });
				await vi.advanceTimersByTimeAsync(1000);

				const result = await storage.query(undefined, undefined, undefined, undefined, 100);
				// Both entries written on the second flush (re-queued "fail" + "ok")
				expect(result.entities).toHaveLength(2);

				await logging.stop();
			});

			test("starts timer on first log call after explicit start", async () => {
				const logging = new EntityStorageLoggingConnector({
					config: { batchSize: 0, batchIntervalMs: 1000 }
				});
				await logging.start();
				await logInContext(logging, { level: LogLevel.Info, source: "test", message: "lazy" });

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
					await logInContext(logging, {
						level: LogLevel.Info,
						source: "test",
						message: `entry-${i}`
					});
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
				await logInContext(logging, { level: LogLevel.Info, source: "test", message: "one" });
				await logging.stop();

				const afterStop = await storage.query(undefined, undefined, undefined, undefined, 100);
				expect(afterStop.entities).toHaveLength(1);

				await vi.advanceTimersByTimeAsync(5000);

				const afterAdvance = await storage.query(undefined, undefined, undefined, undefined, 100);
				expect(afterAdvance.entities).toHaveLength(1);
			});
		});

		describe("retention", () => {
			beforeEach(() => {
				vi.useFakeTimers();
			});

			afterEach(() => {
				vi.useRealTimers();
			});

			test("removes entries older than retainForMs on timer tick", async () => {
				const logging = new EntityStorageLoggingConnector({
					config: {
						batchSize: 0,
						batchIntervalMs: 0,
						retainForMs: 3600000,
						retentionIntervalMs: 60000
					}
				});
				await logging.start();

				const twoHoursAgo = Date.now() - 7200000;
				await logInContext(logging, {
					level: LogLevel.Info,
					source: "test",
					message: "old-1",
					ts: twoHoursAgo
				});
				await logInContext(logging, {
					level: LogLevel.Info,
					source: "test",
					message: "old-2",
					ts: twoHoursAgo
				});
				await logInContext(logging, { level: LogLevel.Info, source: "test", message: "recent" });

				const before = await storage.query(undefined, undefined, undefined, undefined, 100);
				expect(before.entities).toHaveLength(3);

				await vi.advanceTimersByTimeAsync(60000);

				const after = await storage.query(undefined, undefined, undefined, undefined, 100);
				expect(after.entities).toHaveLength(1);
				expect(after.entities[0].message).toBe("recent");

				await logging.stop();
			});

			test("does not remove entries within retainForMs", async () => {
				const logging = new EntityStorageLoggingConnector({
					config: {
						batchSize: 0,
						batchIntervalMs: 0,
						retainForMs: 3600000,
						retentionIntervalMs: 60000
					}
				});
				await logging.start();

				await logInContext(logging, { level: LogLevel.Info, source: "test", message: "a" });
				await logInContext(logging, { level: LogLevel.Info, source: "test", message: "b" });

				await vi.advanceTimersByTimeAsync(60000);

				const result = await storage.query(undefined, undefined, undefined, undefined, 100);
				expect(result.entities).toHaveLength(2);

				await logging.stop();
			});

			test("keeps only maxEntries newest entries when limit is exceeded", async () => {
				const logging = new EntityStorageLoggingConnector({
					config: {
						batchSize: 0,
						batchIntervalMs: 0,
						retainForMs: 0,
						maxEntries: 2,
						retentionIntervalMs: 60000
					}
				});
				await logging.start();

				await logInContext(logging, {
					level: LogLevel.Info,
					source: "test",
					message: "entry-1",
					ts: 1000
				});
				await logInContext(logging, {
					level: LogLevel.Info,
					source: "test",
					message: "entry-2",
					ts: 2000
				});
				await logInContext(logging, {
					level: LogLevel.Info,
					source: "test",
					message: "entry-3",
					ts: 3000
				});
				await logInContext(logging, {
					level: LogLevel.Info,
					source: "test",
					message: "entry-4",
					ts: 4000
				});

				await vi.advanceTimersByTimeAsync(60000);

				const result = await storage.query(undefined, undefined, undefined, undefined, 100);
				expect(result.entities).toHaveLength(2);
				const messages = result.entities.map(e => e.message).sort();
				expect(messages).toEqual(["entry-3", "entry-4"]);

				await logging.stop();
			});

			test("does not remove entries when count is within maxEntries", async () => {
				const logging = new EntityStorageLoggingConnector({
					config: {
						batchSize: 0,
						batchIntervalMs: 0,
						maxEntries: 5,
						retentionIntervalMs: 60000
					}
				});
				await logging.start();

				for (let i = 0; i < 3; i++) {
					await logInContext(logging, {
						level: LogLevel.Info,
						source: "test",
						message: `entry-${i}`
					});
				}

				await vi.advanceTimersByTimeAsync(60000);

				const result = await storage.query(undefined, undefined, undefined, undefined, 100);
				expect(result.entities).toHaveLength(3);

				await logging.stop();
			});

			test("deletes in batches respecting retentionBatchSize", async () => {
				const logging = new EntityStorageLoggingConnector({
					config: {
						batchSize: 0,
						batchIntervalMs: 0,
						retainForMs: 3600000,
						retentionIntervalMs: 60000,
						retentionBatchSize: 2
					}
				});
				await logging.start();

				const removeBatchSpy = vi.spyOn(storage, "removeBatch");

				const twoHoursAgo = Date.now() - 7200000;
				for (let i = 0; i < 5; i++) {
					await logInContext(logging, {
						level: LogLevel.Info,
						source: "test",
						message: `old-${i}`,
						ts: twoHoursAgo
					});
				}

				await vi.advanceTimersByTimeAsync(60000);

				// 5 old entries removed in chunks of retentionBatchSize, never in one call
				expect(removeBatchSpy).toHaveBeenCalledTimes(3);
				for (const call of removeBatchSpy.mock.calls) {
					expect((call[0] as string[]).length).toBeLessThanOrEqual(2);
				}
				expect(removeBatchSpy.mock.calls.flatMap(call => call[0] as string[])).toHaveLength(5);

				await logging.stop();
			});

			test("stop clears retention timer so no further cleanup runs", async () => {
				const logging = new EntityStorageLoggingConnector({
					config: {
						batchSize: 0,
						batchIntervalMs: 0,
						retainForMs: 3600000,
						retentionIntervalMs: 60000
					}
				});
				await logging.start();

				const twoHoursAgo = Date.now() - 7200000;
				await logInContext(logging, {
					level: LogLevel.Info,
					source: "test",
					message: "old",
					ts: twoHoursAgo
				});

				await logging.stop();

				// Retention timer is cleared; old entry should not be deleted
				await vi.advanceTimersByTimeAsync(120000);

				const result = await storage.query(undefined, undefined, undefined, undefined, 100);
				expect(result.entities).toHaveLength(1);
			});

			test("applies age-based cleanup before count-based cleanup when both are configured", async () => {
				const logging = new EntityStorageLoggingConnector({
					config: {
						batchSize: 0,
						batchIntervalMs: 0,
						retainForMs: 3600000,
						maxEntries: 10,
						retentionIntervalMs: 60000
					}
				});
				await logging.start();

				const twoHoursAgo = Date.now() - 7200000;
				for (let i = 0; i < 8; i++) {
					await logInContext(logging, {
						level: LogLevel.Info,
						source: "test",
						message: `old-${i}`,
						ts: twoHoursAgo
					});
				}
				for (let i = 0; i < 5; i++) {
					await logInContext(logging, {
						level: LogLevel.Info,
						source: "test",
						message: `recent-${i}`
					});
				}

				// 13 total. Age-based removes 8 old → 5 remain. Count-based with maxEntries=10: 5 ≤ 10, no further action.
				await vi.advanceTimersByTimeAsync(60000);

				const result = await storage.query(undefined, undefined, undefined, undefined, 100);
				expect(result.entities).toHaveLength(5);
				expect(result.entities.every(e => e.message?.startsWith("recent"))).toBe(true);

				await logging.stop();
			});

			test("runs retention cleanup per tenant and does not delete entries from other tenants", async () => {
				if (!multiTenant) {
					return;
				}

				const tenantEntries = new Map<string, LogEntry[]>();

				const getCurrentTenant = async (): Promise<string> => {
					const contextIds = (await ContextIdStore.getContextIds()) ?? {};
					const tenantId = contextIds[ContextIdKeys.Tenant];
					return Is.string(tenantId) && tenantId.length > 0 ? tenantId : "default";
				};

				const getTenantEntries = (tenant: string): LogEntry[] => {
					let entries = tenantEntries.get(tenant);
					if (!entries) {
						entries = [];
						tenantEntries.set(tenant, entries);
					}
					return entries;
				};

				vi.spyOn(storage, "set").mockImplementation(async (entity: LogEntry) => {
					const tenant = await getCurrentTenant();
					getTenantEntries(tenant).push(entity);
				});

				vi.spyOn(storage, "query").mockImplementation(async (...args: unknown[]) => {
					const conditions = args[0] as
						| {
								property?: string;
								comparison?: string;
								value?: unknown;
						  }
						| undefined;
					const sortProperties = args[1] as
						{ property: string; sortDirection: number }[] | undefined;
					const limit = args[4] as number | undefined;

					const tenant = await getCurrentTenant();
					let result = [...getTenantEntries(tenant)];

					if (conditions?.property === "ts" && Is.number(conditions.value)) {
						const maxTs = conditions.value;
						result = result.filter(entry => entry.ts < maxTs);
					}

					if (Array.isArray(sortProperties) && sortProperties.length > 0) {
						const firstSort = sortProperties[0];
						if (firstSort.property === "ts") {
							result.sort((a, b) => a.ts - b.ts);
						}
					}

					if (Is.number(limit)) {
						result = result.slice(0, limit);
					}

					return {
						entities: result,
						cursor: undefined
					};
				});

				vi.spyOn(storage, "count").mockImplementation(async () => {
					const tenant = await getCurrentTenant();
					return getTenantEntries(tenant).length;
				});

				vi.spyOn(storage, "removeBatch").mockImplementation(async (ids: string[]) => {
					const tenant = await getCurrentTenant();
					const entries = getTenantEntries(tenant);
					tenantEntries.set(
						tenant,
						entries.filter(entry => !ids.includes(entry.id))
					);
				});

				const logging = new EntityStorageLoggingConnector({
					config: {
						batchSize: 0,
						batchIntervalMs: 0,
						retainForMs: 3600000,
						retentionIntervalMs: 60000
					}
				});
				await logging.start();

				const twoHoursAgo = Date.now() - 7200000;

				await ContextIdStore.run({ [ContextIdKeys.Tenant]: "test-tenant" }, async () => {
					await logging.log({
						level: LogLevel.Info,
						source: "test",
						message: "old-test-tenant",
						ts: twoHoursAgo
					});
					await logging.log({
						level: LogLevel.Info,
						source: "test",
						message: "recent-test-tenant"
					});
				});

				await ContextIdStore.run({ [ContextIdKeys.Tenant]: "other-tenant" }, async () => {
					await storage.set({
						id: "other-old",
						level: LogLevel.Info,
						source: "test",
						message: "old-other-tenant",
						ts: twoHoursAgo
					});
					await storage.set({
						id: "other-recent",
						level: LogLevel.Info,
						source: "test",
						ts: Date.now(),
						message: "recent-other-tenant"
					});
				});

				await vi.advanceTimersByTimeAsync(60000);

				const testTenantResult = await ContextIdStore.run(
					{ [ContextIdKeys.Tenant]: "test-tenant" },
					async () => storage.query(undefined, undefined, undefined, undefined, 100)
				);
				expect(testTenantResult.entities).toHaveLength(1);
				expect(testTenantResult.entities[0].message).toBe("recent-test-tenant");

				const otherTenantResult = await ContextIdStore.run(
					{ [ContextIdKeys.Tenant]: "other-tenant" },
					async () => storage.query(undefined, undefined, undefined, undefined, 100)
				);
				expect(otherTenantResult.entities).toHaveLength(2);
				const otherTenantMessages = otherTenantResult.entities.map(e => e.message).sort();
				expect(otherTenantMessages).toEqual(["old-other-tenant", "recent-other-tenant"]);

				await logging.stop();
			});
		});
	});
});
