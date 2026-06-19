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
import { type EntityCondition, LogicalOperator, type SortDirection } from "@twin.org/entity";
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
	 * Handle for the interval timer, present only while the connector is running.
	 * @internal
	 */
	private _batchTimer: ReturnType<typeof setInterval> | undefined;

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

		this._mutexKey = RandomHelper.generateUuidV7("compact");
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
	 * The timer is also started lazily by the first batched write if this method is not called.
	 * @returns A promise that resolves when the connector is ready to accept log entries.
	 */
	public async start(): Promise<void> {
		if (!Is.empty(this._batchIntervalMs) && Is.empty(this._batchTimer)) {
			this._batchTimer = setInterval(async () => {
				await this.flush();
			}, this._batchIntervalMs);
		}
	}

	/**
	 * Stop the connector; flushes any remaining cached entries and clears the timer.
	 * @returns A promise that resolves when the final flush completes and the timer is cleared.
	 */
	public async stop(): Promise<void> {
		if (!Is.empty(this._batchTimer)) {
			clearInterval(this._batchTimer);
			this._batchTimer = undefined;
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
				if (!Is.empty(this._batchIntervalMs) && Is.empty(this._batchTimer)) {
					this._batchTimer = setInterval(async () => {
						await this.flush();
					}, this._batchIntervalMs);
				}

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
			finalConditions,
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
		if (this._batchCache.length === 0) {
			return;
		}
		const locked = await Mutex.lock(this._mutexKey, {
			throwOnTimeout: true,
			timeoutMs: this._mutexTimeoutMs
		});
		if (!locked) {
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
	}
}
