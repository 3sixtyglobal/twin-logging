// Copyright 2024 IOTA Stiftung.
// SPDX-License-Identifier: Apache-2.0.
import type { IPlatformComponent } from "@twin.org/api-models";
import { ContextIdKeys, ContextIdStore, type IContextIds } from "@twin.org/context";
import {
	BaseError,
	Coerce,
	ComponentFactory,
	Converter,
	Guards,
	type IError,
	Is,
	JsonHelper,
	Mutex,
	RandomHelper
} from "@twin.org/core";
import {
	ComparisonOperator,
	type EntityCondition,
	LogicalOperator,
	SortDirection
} from "@twin.org/entity";
import {
	EntityStorageConnectorFactory,
	type IEntityStorageConnector
} from "@twin.org/entity-storage-models";
import { type ILogEntry, type ILoggingConnector, LogLevel } from "@twin.org/logging-models";
import { nameof } from "@twin.org/nameof";
import type { LogEntry } from "./entities/logEntry.js";
import type { LogEntryError } from "./entities/logEntryError.js";
import type { IBatchEntry } from "./models/IBatchEntry.js";
import type { IEntityStorageLoggingConnectorConstructorOptions } from "./models/IEntityStorageLoggingConnectorConstructorOptions.js";

/**
 * Class for performing logging operations in entity storage.
 */
export class EntityStorageLoggingConnector implements ILoggingConnector {
	/**
	 * The namespace for the logging connector.
	 */
	public static readonly NAMESPACE: string = "entity-storage";

	/**
	 * Runtime name for the class.
	 */
	public static readonly CLASS_NAME: string = nameof<EntityStorageLoggingConnector>();

	/**
	 * Default number of entries to accumulate before flushing.
	 */
	public static readonly DEFAULT_BATCH_SIZE: number = 10;

	/**
	 * Default interval in milliseconds between automatic flushes.
	 */
	public static readonly DEFAULT_BATCH_INTERVAL_MS: number = 5000;

	/**
	 * Default maximum number of entries to hold in the in-memory cache.
	 */
	public static readonly DEFAULT_MAX_CACHE_SIZE: number = 1000;

	/**
	 * Default interval in milliseconds between retention cleanup runs, 5 minutes.
	 */
	public static readonly DEFAULT_RETENTION_INTERVAL_MS: number = 300000;

	/**
	 * Default age threshold in milliseconds; entries older than this are deleted, 2 days.
	 */
	public static readonly DEFAULT_RETAIN_FOR_MS: number = 172800000;

	/**
	 * Default maximum number of stored entries to keep before the oldest are removed.
	 */
	public static readonly DEFAULT_MAX_ENTRIES: number = 10000;

	/**
	 * Default maximum number of entries to remove per removeBatch call during cleanup.
	 */
	public static readonly DEFAULT_RETENTION_BATCH_SIZE: number = 1000;

	/**
	 * The log levels to capture, will default to all.
	 * @internal
	 */
	private readonly _levels: LogLevel[];

	/**
	 * The entity storage for the log entries.
	 * @internal
	 */
	private readonly _logEntryStorage: IEntityStorageConnector<LogEntry>;

	/**
	 * Platform component for partitioning.
	 * @internal
	 */
	private readonly _platformComponent: IPlatformComponent;

	/**
	 * Flush when the cache reaches this size; undefined or <= 1 disables size-based flushing.
	 * @internal
	 */
	private readonly _batchSize: number | undefined;

	/**
	 * Flush every this many milliseconds; undefined or <= 0 disables timer-based flushing.
	 * @internal
	 */
	private readonly _batchIntervalMs: number | undefined;

	/**
	 * Entries waiting to be written to storage.
	 * @internal
	 */
	private readonly _batchCache: IBatchEntry[];

	/**
	 * Maximum entries to keep after a failed flush re-queue; 0 means unlimited.
	 * @internal
	 */
	private readonly _maxCacheSize: number;

	/**
	 * Timeout in milliseconds passed to Mutex.lock calls.
	 * @internal
	 */
	private readonly _mutexTimeoutMs?: number;

	/**
	 * Unique key used to serialize concurrent flush calls via Mutex.
	 * @internal
	 */
	private readonly _mutexKey: string;

	/**
	 * Age threshold in milliseconds; entries older than this are deleted during cleanup.
	 * Undefined when age-based retention is disabled.
	 * @internal
	 */
	private readonly _retainForMs?: number;

	/**
	 * Maximum number of stored entries to keep; oldest are removed when exceeded.
	 * Undefined when count-based retention is disabled.
	 * @internal
	 */
	private readonly _maxEntries?: number;

	/**
	 * Interval in milliseconds between retention cleanup runs.
	 * Undefined when the retention timer is disabled.
	 * @internal
	 */
	private readonly _retentionIntervalMs?: number;

	/**
	 * Maximum entries deleted per removeBatch call during a cleanup pass.
	 * @internal
	 */
	private readonly _retentionBatchSize: number;

	/**
	 * Handle for the interval timer, present only while the connector is running.
	 * @internal
	 */
	private _batchTimer?: ReturnType<typeof setInterval>;

	/**
	 * Handle for the retention cleanup timer, present only while the connector is running.
	 * @internal
	 */
	private _retentionTimer?: ReturnType<typeof setTimeout>;

	/**
	 * Is the service running.
	 * @internal
	 */
	private _started: boolean;

	/**
	 * Create a new instance of EntityStorageLoggingConnector.
	 * @param options The options for the connector.
	 */
	constructor(options?: IEntityStorageLoggingConnectorConstructorOptions) {
		this._levels = options?.config?.levels ?? Object.values(LogLevel);

		const cfgBatchSize =
			Coerce.integer(options?.config?.batchSize) ??
			EntityStorageLoggingConnector.DEFAULT_BATCH_SIZE;
		this._batchSize = cfgBatchSize > 1 ? cfgBatchSize : undefined;

		const cfgIntervalMs =
			Coerce.integer(options?.config?.batchIntervalMs) ??
			EntityStorageLoggingConnector.DEFAULT_BATCH_INTERVAL_MS;
		this._batchIntervalMs = cfgIntervalMs > 0 ? cfgIntervalMs : undefined;

		const cfgMaxCacheSize =
			Coerce.integer(options?.config?.maxCacheSize) ??
			EntityStorageLoggingConnector.DEFAULT_MAX_CACHE_SIZE;
		this._maxCacheSize = cfgMaxCacheSize > 0 ? cfgMaxCacheSize : 0;

		this._mutexTimeoutMs = Coerce.integer(options?.config?.mutexTimeoutMs);

		const cfgRetainForMs =
			Coerce.integer(options?.config?.retainForMs) ??
			EntityStorageLoggingConnector.DEFAULT_RETAIN_FOR_MS;
		this._retainForMs = cfgRetainForMs > 0 ? cfgRetainForMs : undefined;

		const cfgMaxEntries =
			Coerce.integer(options?.config?.maxEntries) ??
			EntityStorageLoggingConnector.DEFAULT_MAX_ENTRIES;
		this._maxEntries = cfgMaxEntries > 0 ? cfgMaxEntries : undefined;

		const cfgRetentionIntervalMs =
			Coerce.integer(options?.config?.retentionIntervalMs) ??
			EntityStorageLoggingConnector.DEFAULT_RETENTION_INTERVAL_MS;
		this._retentionIntervalMs = cfgRetentionIntervalMs > 0 ? cfgRetentionIntervalMs : undefined;

		const cfgRetentionBatchSize =
			Coerce.integer(options?.config?.retentionBatchSize) ??
			EntityStorageLoggingConnector.DEFAULT_RETENTION_BATCH_SIZE;
		this._retentionBatchSize =
			cfgRetentionBatchSize > 0
				? cfgRetentionBatchSize
				: EntityStorageLoggingConnector.DEFAULT_RETENTION_BATCH_SIZE;

		this._mutexKey = RandomHelper.generateUuidV7("compact");
		this._started = false;
		this._batchCache = [];
		this._logEntryStorage = EntityStorageConnectorFactory.get(
			options?.logEntryStorageConnectorType ?? "log-entry"
		);
		this._platformComponent = ComponentFactory.get<IPlatformComponent>(
			options?.platformComponentType ?? "platform"
		);
	}

	/**
	 * Returns the class name of the component.
	 * @returns The class name of the component.
	 */
	public className(): string {
		return EntityStorageLoggingConnector.CLASS_NAME;
	}

	/**
	 * Start the connector; sets up the interval timer when batchIntervalMs is configured.
	 * @returns A promise that resolves when the connector is ready to accept log entries.
	 */
	public async start(): Promise<void> {
		if (!this._started) {
			this._started = true;
			this.startTimer();
			this.startRetentionTimer();
		}
	}

	/**
	 * Stop the connector; flushes any remaining cached entries and clears the timer.
	 * @returns A promise that resolves when the final flush completes and the timer is cleared.
	 */
	public async stop(): Promise<void> {
		if (this._started) {
			this._started = false;
			this.stopTimer();
			this.stopRetentionTimer();
		}
		await this.flush();
	}

	/**
	 * Log an entry to the connector.
	 *
	 * When batching is active the entry is held in memory until a flush is triggered
	 * by the size threshold or the interval timer; otherwise it is written immediately.
	 * @param logEntry The entry to log.
	 * @returns A promise that resolves when the entry is accepted (written or enqueued).
	 */
	public async log(logEntry: ILogEntry): Promise<void> {
		Guards.object<ILogEntry>(EntityStorageLoggingConnector.CLASS_NAME, nameof(logEntry), logEntry);

		if (this._levels.includes(logEntry.level)) {
			const id = Converter.bytesToHex(RandomHelper.generate(32));

			const entity: LogEntry = {
				id,
				level: logEntry.level,
				source: logEntry.source,
				ts: logEntry.ts ?? Date.now(),
				message: logEntry.message,
				error: Is.object<IError>(logEntry.error) ? BaseError.flatten(logEntry.error) : undefined,
				data: logEntry.data
			};

			// If we don't have a tenant context ID and the tenant component is multi-tenant,
			// we consider the entry as per-tenant and run it in the tenant context to ensure
			// correct partitioning.
			const contextIds = (await ContextIdStore.getContextIds()) ?? {};
			const perTenant =
				!Is.stringValue(contextIds[ContextIdKeys.Tenant]) &&
				this._platformComponent.isMultiTenant();

			if (Is.empty(this._batchSize) && Is.empty(this._batchIntervalMs)) {
				await this._platformComponent.execute(async () => this._logEntryStorage.set(entity));
			} else {
				let shouldFlush = false;
				const locked = await Mutex.lock(this._mutexKey, {
					throwOnTimeout: true,
					timeoutMs: this._mutexTimeoutMs
				});
				if (locked) {
					try {
						this._batchCache.push({ entity, contextIds, perTenant });
						shouldFlush = !Is.empty(this._batchSize) && this._batchCache.length >= this._batchSize;
					} finally {
						Mutex.unlock(this._mutexKey);
					}
				}

				if (shouldFlush) {
					await this.flush();
				}
			}
		}
	}

	/**
	 * Query the log entries.
	 * Any pending batched entries are flushed before the query executes so results are always current.
	 * @param conditions The conditions to match for the entities.
	 * @param sortProperties The optional sort order.
	 * @param properties The optional keys to return, defaults to all.
	 * @param cursor The cursor to request the next chunk of entities.
	 * @param limit Limit the number of entities to return.
	 * @returns All the entities for the storage matching the conditions,
	 * and a cursor which can be used to request more entities.
	 */
	public async query(
		conditions?: EntityCondition<ILogEntry>,
		sortProperties?: {
			property: keyof Omit<ILogEntry, "error" | "data">;
			sortDirection: SortDirection;
		}[],
		properties?: (keyof ILogEntry)[],
		cursor?: string,
		limit?: number
	): Promise<{
		/**
		 * The entities, which can be partial if a limited keys list was provided.
		 */
		entities: Partial<ILogEntry>[];
		/**
		 * An optional cursor, when defined can be used to call find to get more entities.
		 */
		cursor?: string;
	}> {
		await this.flush();

		const finalConditions: EntityCondition<ILogEntry> = {
			conditions: [],
			logicalOperator: LogicalOperator.And
		};

		if (!Is.empty(conditions)) {
			finalConditions.conditions.push(conditions);
		}

		const result = await this._logEntryStorage.query(
			finalConditions.conditions.length > 0 ? finalConditions : undefined,
			sortProperties,
			properties,
			cursor,
			limit
		);

		const mappedEntities: Partial<ILogEntry>[] = [];

		for (const entity of result.entities) {
			mappedEntities.push({
				level: entity.level,
				source: entity.source,
				ts: entity.ts,
				message: entity.message,
				error: Is.arrayValue<LogEntryError>(entity.error)
					? BaseError.expand(entity.error)
					: undefined,
				data: entity.data
			});
		}

		return {
			entities: mappedEntities,
			cursor: result.cursor
		};
	}

	/**
	 * Write all cached entries to storage and clear the cache.
	 * Entries sharing the same tenant context are grouped into a single setBatch call.
	 * If the mutex cannot be acquired the call returns without writing.
	 * On a storage write failure the entries are returned to the head of the cache for the next attempt.
	 * @returns A promise that resolves when all cached entries have been written to storage.
	 */
	public async flush(): Promise<void> {
		this.stopTimer();

		if (this._batchCache.length === 0) {
			this.startTimer();
			return;
		}
		const locked = await Mutex.lock(this._mutexKey, {
			throwOnTimeout: true,
			timeoutMs: this._mutexTimeoutMs
		});
		if (!locked) {
			this.startTimer();
			return;
		}
		let entries: IBatchEntry[] = [];
		try {
			entries = this._batchCache.splice(0);

			const perTenantEntities: LogEntry[] = [];
			const contextGroups = new Map<string, { contextIds: IContextIds; entities: LogEntry[] }>();

			for (const entry of entries) {
				if (entry.perTenant) {
					perTenantEntities.push(entry.entity);
				} else {
					const key = JsonHelper.canonicalize(entry.contextIds);
					let group = contextGroups.get(key);
					if (Is.empty(group)) {
						group = { contextIds: entry.contextIds, entities: [] };
						contextGroups.set(key, group);
					}
					group.entities.push(entry.entity);
				}
			}

			if (perTenantEntities.length > 0) {
				await this._platformComponent.execute(async () =>
					this._logEntryStorage.setBatch(perTenantEntities)
				);
			}

			for (const group of contextGroups.values()) {
				await ContextIdStore.run(group.contextIds, async () =>
					this._logEntryStorage.setBatch(group.entities)
				);
			}
		} catch {
			this._batchCache.unshift(...entries);
			if (this._maxCacheSize > 0 && this._batchCache.length > this._maxCacheSize) {
				this._batchCache.splice(0, this._batchCache.length - this._maxCacheSize);
			}
		} finally {
			Mutex.unlock(this._mutexKey);
		}

		this.startTimer();
	}

	/**
	 * Delete log entries that exceed the configured retention thresholds.
	 * Age-based cleanup (retainForMs) runs first, then count-based (maxEntries).
	 * Deletions are issued in batches of retentionBatchSize to avoid DB load spikes.
	 * @internal
	 */
	private async runRetention(): Promise<void> {
		this.stopRetentionTimer();

		try {
			if (!Is.empty(this._retainForMs)) {
				const epoch = Date.now() - this._retainForMs;
				const ageCondition: EntityCondition<LogEntry> = {
					property: "ts",
					value: epoch,
					comparison: ComparisonOperator.LessThan
				};
				const allIds: string[] = [];
				let cursor: string | undefined;
				do {
					const result = await this._logEntryStorage.query(
						ageCondition,
						undefined,
						["id"],
						cursor,
						this._retentionBatchSize
					);
					allIds.push(...result.entities.map(e => e.id as string));
					cursor = result.cursor;
				} while (!Is.empty(cursor));
				if (allIds.length > 0) {
					await this._logEntryStorage.removeBatch(allIds);
				}
			}

			if (!Is.empty(this._maxEntries)) {
				const total = await this._logEntryStorage.count();
				if (total > this._maxEntries) {
					const excess = total - this._maxEntries;
					const allIds: string[] = [];
					let cursor: string | undefined;
					do {
						const batchLimit = Math.min(excess - allIds.length, this._retentionBatchSize);
						const result = await this._logEntryStorage.query(
							undefined,
							[{ property: "ts", sortDirection: SortDirection.Ascending }],
							["id"],
							cursor,
							batchLimit
						);
						allIds.push(...result.entities.map(e => e.id as string));
						cursor = result.cursor;
					} while (!Is.empty(cursor) && allIds.length < excess);
					if (allIds.length > 0) {
						await this._logEntryStorage.removeBatch(allIds);
					}
				}
			}
		} catch {}

		this.startRetentionTimer();
	}

	/**
	 * Start the retention timer if both a retention option and an interval are configured.
	 * @internal
	 */
	private startRetentionTimer(): void {
		if (
			!Is.empty(this._retentionIntervalMs) &&
			Is.empty(this._retentionTimer) &&
			this._started &&
			(!Is.empty(this._retainForMs) || !Is.empty(this._maxEntries))
		) {
			this._retentionTimer = globalThis.setTimeout(async () => {
				await this.runRetention();
			}, this._retentionIntervalMs);
		}
	}

	/**
	 * Stop the retention timer if it is running.
	 * @internal
	 */
	private stopRetentionTimer(): void {
		if (!Is.empty(this._retentionTimer)) {
			globalThis.clearTimeout(this._retentionTimer);
			this._retentionTimer = undefined;
		}
	}

	/**
	 * Start the interval timer if batchIntervalMs is configured and the connector is running.
	 * @internal
	 */
	private startTimer(): void {
		if (!Is.empty(this._batchIntervalMs) && Is.empty(this._batchTimer) && this._started) {
			this._batchTimer = globalThis.setTimeout(async () => {
				await this.flush();
			}, this._batchIntervalMs);
		}
	}

	/**
	 * Stop the interval timer if it is running.
	 * @internal
	 */
	private stopTimer(): void {
		if (!Is.empty(this._batchTimer)) {
			globalThis.clearTimeout(this._batchTimer);
			this._batchTimer = undefined;
		}
	}
}
