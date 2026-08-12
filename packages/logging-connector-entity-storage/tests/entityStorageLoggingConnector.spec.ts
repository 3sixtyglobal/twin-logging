// Copyright 2024 IOTA Stiftung.
// SPDX-License-Identifier: Apache-2.0.
import type { IPlatformComponent } from "@twin.org/api-models";
import { ContextIdKeys, ContextIdStore } from "@twin.org/context";
import { ComponentFactory } from "@twin.org/core";
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

				const after = await storage.query(undefined, undefined, undefined, undefined, 100);
				expect(after.entities).toHaveLength(3);
			});

			test("refills cache and flushes again after each threshold is reached", async () => {
				const logging = new EntityStorageLoggingConnector({
					config: { batchSize: 2, batchIntervalMs: 0 }
				});
				await logInContext(logging, { level: LogLevel.Info, source: "test", message: "one" });
				await logInContext(logging, { level: LogLevel.Info, source: "test", message: "two" });
				await logInContext(logging, { level: LogLevel.Info, source: "test", message: "three" });
				await logInContext(logging, { level: LogLevel.Info, source: "test", message: "four" });

				const result = await storage.query(undefined, undefined, undefined, undefined, 100);
				expect(result.entities).toHaveLength(4);
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

				if (multiTenant && !inTenantContext) {
					expect(executeSpy).toHaveBeenCalledTimes(1);
				} else {
					expect(executeSpy).not.toHaveBeenCalled();
				}
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

				// 5 old entries collected across batches, then removed in a single call
				expect(removeBatchSpy).toHaveBeenCalledTimes(1);

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
					return typeof tenantId === "string" && tenantId.length > 0 ? tenantId : "default";
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

					if (conditions?.property === "ts" && typeof conditions.value === "number") {
						const maxTs = conditions.value;
						result = result.filter(entry => entry.ts < maxTs);
					}

					if (Array.isArray(sortProperties) && sortProperties.length > 0) {
						const firstSort = sortProperties[0];
						if (firstSort.property === "ts") {
							result.sort((a, b) => a.ts - b.ts);
						}
					}

					if (typeof limit === "number") {
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
