// Copyright 2026 IOTA Stiftung.
// SPDX-License-Identifier: Apache-2.0.
import { ContextIdKeys, ContextIdStore, type IContextIds } from "@twin.org/context";
import {
	BaseError,
	Coerce,
	Converter,
	GeneralError,
	Guards,
	type IError,
	Is,
	RandomHelper
} from "@twin.org/core";
import { type ILogEntry, type ILoggingConnector, LogLevel } from "@twin.org/logging-models";
import { nameof } from "@twin.org/nameof";
import { FetchHelper, HttpMethod, HttpStatusCode } from "@twin.org/web";
import type { IElkBatchEntry } from "./models/IElkBatchEntry.js";
import type { IElkBulkOutcome } from "./models/IElkBulkOutcome.js";
import type { IElkLoggingConnectorConstructorOptions } from "./models/IElkLoggingConnectorConstructorOptions.js";

/**
 * Class for performing logging operations to an Elasticsearch endpoint.
 *
 * Entries are converted to Elasticsearch documents and delivered through the bulk API, which
 * keeps one HTTP round trip per batch. Batching is on by default; a flush is triggered by the
 * size threshold or when the interval timer is reached, stop() flushes whatever is still pending.
 * A size triggered flush runs detached, so log() never waits on the network.
 *
 * A bulk request that fails outright returns the whole batch to the cache for the next attempt.
 * When the response reports per item failures only the transient ones are delivered again;
 * documents Elasticsearch rejects permanently are dropped, as repeating them would hold up every
 * entry behind them forever. While deliveries are failing the size threshold stops scheduling
 * flushes, so a struggling cluster sees one retry per interval rather than one per logging call.
 * The cache is bounded by maxCacheSize and the oldest entries are discarded first once it is
 * full, which is where entries are lost if the cluster stays unreachable.
 */
export class ElkLoggingConnector implements ILoggingConnector {
	/**
	 * The namespace for the logging connector.
	 */
	public static readonly NAMESPACE: string = "elk";

	/**
	 * Runtime name for the class.
	 */
	public static readonly CLASS_NAME: string = nameof<ElkLoggingConnector>();

	/**
	 * Default name for the index documents are written to.
	 */
	public static readonly DEFAULT_INDEX_NAME: string = "twin-logs";

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
	 * Default timeout in milliseconds for a bulk request.
	 */
	public static readonly DEFAULT_TIMEOUT_MS: number = 30000;

	/**
	 * The log levels to capture, will default to all.
	 * @internal
	 */
	private readonly _levels: LogLevel[];

	/**
	 * The base URL of the Elasticsearch endpoint, without a trailing slash.
	 * @internal
	 */
	private readonly _endpoint: string;

	/**
	 * The base name of the index documents are written to.
	 * @internal
	 */
	private readonly _indexName: string;

	/**
	 * Append a UTC date suffix to the index name.
	 * @internal
	 */
	private readonly _indexDateRolling: boolean;

	/**
	 * The authorization header value, absent when no credentials are configured.
	 * @internal
	 */
	private readonly _authorization?: string;

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
	 * Entries waiting to be delivered to Elasticsearch.
	 * @internal
	 */
	private readonly _batchCache: IElkBatchEntry[];

	/**
	 * Maximum entries to hold in the cache, oldest dropped when exceeded; 0 means unlimited.
	 * @internal
	 */
	private readonly _maxCacheSize: number;

	/**
	 * Timeout in milliseconds for a bulk request.
	 * @internal
	 */
	private readonly _timeoutMs: number;

	/**
	 * Number of attempts made for a bulk request; undefined uses the fetch helper default.
	 * @internal
	 */
	private readonly _retryCount?: number;

	/**
	 * Base number of milliseconds to delay before a retry.
	 * @internal
	 */
	private readonly _retryDelayMs?: number;

	/**
	 * The timer that triggers interval-based flushes.
	 * @internal
	 */
	private _batchTimer?: ReturnType<typeof setTimeout>;

	/**
	 * Is the connector running.
	 * @internal
	 */
	private _started: boolean;

	/**
	 * Is a flush in progress.
	 * @internal
	 */
	private _activeFlush?: Promise<void>;

	/**
	 * Did the last delivery fail, in which case entries wait for the retry timer instead of
	 * being pushed at the cluster again by every logging call.
	 * @internal
	 */
	private _deliveryFailed: boolean;

	/**
	 * Create a new instance of ElkLoggingConnector.
	 * @param options The options for the logging connector.
	 * @throws GeneralError if the authentication options are conflicting or incomplete.
	 */
	constructor(options: IElkLoggingConnectorConstructorOptions) {
		Guards.object(ElkLoggingConnector.CLASS_NAME, nameof(options), options);
		Guards.object(ElkLoggingConnector.CLASS_NAME, nameof(options.config), options.config);
		Guards.stringValue(
			ElkLoggingConnector.CLASS_NAME,
			nameof(options.config.endpoint),
			options.config.endpoint
		);

		const config = options.config;

		this._levels = config.levels ?? Object.values(LogLevel);
		this._endpoint = config.endpoint.replace(/\/+$/, "");
		this._indexName = Is.stringValue(config.indexName)
			? config.indexName
			: ElkLoggingConnector.DEFAULT_INDEX_NAME;
		this._indexDateRolling = config.indexDateRolling ?? false;

		const hasApiKey = Is.stringValue(config.apiKey);
		const hasBasic = Is.stringValue(config.username) || Is.stringValue(config.password);
		if (hasApiKey && hasBasic) {
			throw new GeneralError(ElkLoggingConnector.CLASS_NAME, "conflictingAuth");
		}
		if (hasBasic) {
			Guards.stringValue(ElkLoggingConnector.CLASS_NAME, nameof(config.username), config.username);
			Guards.stringValue(ElkLoggingConnector.CLASS_NAME, nameof(config.password), config.password);
			const encoded = Converter.bytesToBase64(
				Converter.utf8ToBytes(`${config.username}:${config.password}`)
			);
			this._authorization = `Basic ${encoded}`;
		} else if (hasApiKey) {
			this._authorization = `ApiKey ${config.apiKey}`;
		}

		const cfgBatchSize = Coerce.integer(config.batchSize) ?? ElkLoggingConnector.DEFAULT_BATCH_SIZE;
		this._batchSize = cfgBatchSize > 1 ? cfgBatchSize : undefined;

		const cfgIntervalMs =
			Coerce.integer(config.batchIntervalMs) ?? ElkLoggingConnector.DEFAULT_BATCH_INTERVAL_MS;
		this._batchIntervalMs = cfgIntervalMs > 0 ? cfgIntervalMs : undefined;

		const cfgMaxCacheSize =
			Coerce.integer(config.maxCacheSize) ?? ElkLoggingConnector.DEFAULT_MAX_CACHE_SIZE;
		this._maxCacheSize = cfgMaxCacheSize > 0 ? cfgMaxCacheSize : 0;

		const cfgTimeoutMs = Coerce.integer(config.timeoutMs) ?? ElkLoggingConnector.DEFAULT_TIMEOUT_MS;
		this._timeoutMs = cfgTimeoutMs > 0 ? cfgTimeoutMs : ElkLoggingConnector.DEFAULT_TIMEOUT_MS;

		const cfgRetryCount = Coerce.integer(config.retryCount);
		this._retryCount = Is.integer(cfgRetryCount) ? Math.max(1, cfgRetryCount) : undefined;
		this._retryDelayMs = Coerce.integer(config.retryDelayMs);

		this._batchCache = [];
		this._started = false;
		this._deliveryFailed = false;
	}

	/**
	 * Returns the class name of the component.
	 * @returns The class name of the component.
	 */
	public className(): string {
		return ElkLoggingConnector.CLASS_NAME;
	}

	/**
	 * Start the connector; sets up the interval timer when batchIntervalMs is configured.
	 * @returns A promise that resolves when the connector is ready to accept log entries.
	 */
	public async start(): Promise<void> {
		if (!this._started) {
			this._started = true;
			this.startTimer();
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
		}
		await this.flush();
	}

	/**
	 * Log an entry to the connector.
	 *
	 * When batching is active the document is held in memory until a flush is triggered by
	 * the size threshold or the interval timer; otherwise it is delivered immediately and
	 * a delivery failure is thrown to the caller. A size triggered flush runs detached,
	 * so this call never waits on the network.
	 * @param logEntry The entry to log.
	 * @returns A promise that resolves when the entry is accepted (delivered or enqueued).
	 * @throws GeneralError if batching is disabled and the delivery fails.
	 */
	public async log(logEntry: ILogEntry): Promise<void> {
		Guards.object<ILogEntry>(ElkLoggingConnector.CLASS_NAME, nameof(logEntry), logEntry);

		if (this._levels.includes(logEntry.level)) {
			const contextIds = (await ContextIdStore.getContextIds()) ?? {};
			const entry: IElkBatchEntry = {
				id: Converter.bytesToHex(RandomHelper.generate(32)),
				index: this.resolveIndex(),
				document: this.toDocument(logEntry, contextIds)
			};

			if (Is.empty(this._batchSize) && Is.empty(this._batchIntervalMs)) {
				// Batching fully disabled, deliver straight away and let the caller see a failure.
				const outcome = await this.sendBulk([entry]);
				if (outcome.retry.length > 0 || outcome.rejected > 0) {
					throw new GeneralError(ElkLoggingConnector.CLASS_NAME, "bulkResponseErrors", {
						index: entry.index,
						failedCount: outcome.retry.length + outcome.rejected,
						totalCount: 1,
						reason: outcome.reason
					});
				}
			} else {
				this._batchCache.push(entry);
				// Bounds the cache when logging outruns the deliveries, discarding the oldest entries.
				this.trimCache();

				if (this.canFlushOnSize()) {
					this.startImmediateFlush();
				}
			}
		}
	}

	/**
	 * Deliver the cached documents to Elasticsearch in bulk requests. On return every entry cached
	 * when this was called has been delivered, dropped as permanently rejected, or put back in the
	 * cache after a failed delivery.
	 * @returns A promise that resolves when those entries have been delivered.
	 */
	public async flush(): Promise<void> {
		// A pass delivers only what it took when it started, so waiting for one already running.
		if (!Is.empty(this._activeFlush)) {
			await this._activeFlush;
		}

		// A peer resuming first may already have started, so waiting and returning because
		// it already has the entries.
		if (!Is.empty(this._activeFlush)) {
			await this._activeFlush;
			return;
		}

		const flushing = this.runFlush();
		this._activeFlush = flushing;
		try {
			await flushing;
		} finally {
			this._activeFlush = undefined;
		}
	}

	/**
	 * Run one flush pass over the entries cached at the point it starts. Entries logged during
	 * the delivery are left for the next pass.
	 * @internal
	 */
	private async runFlush(): Promise<void> {
		this.stopTimer();

		const entries = this._batchCache.splice(0, this._batchCache.length);
		let delivered = true;

		if (entries.length > 0) {
			try {
				const outcome = await this.sendBulk(entries);
				if (outcome.retry.length > 0) {
					delivered = false;
					this._batchCache.unshift(...outcome.retry);
					this.trimCache();
				}
			} catch {
				delivered = false;
				this._batchCache.unshift(...entries);
				this.trimCache();
			}
			this._deliveryFailed = !delivered;
		}

		// Entries logged during the delivery already fill a batch, so flush again.
		if (this.canFlushOnSize()) {
			this.startImmediateFlush();
		} else {
			this.startTimer();
		}
	}

	/**
	 * Drop the oldest entries once the cache exceeds maxCacheSize.
	 * @internal
	 */
	private trimCache(): void {
		if (this._maxCacheSize > 0 && this._batchCache.length > this._maxCacheSize) {
			this._batchCache.splice(0, this._batchCache.length - this._maxCacheSize);
		}
	}

	/**
	 * Build the Elasticsearch document from a log entry.
	 * @param logEntry The entry being logged.
	 * @param contextIds The context IDs the entry was logged under.
	 * @returns The document to index.
	 * @internal
	 */
	private toDocument(logEntry: ILogEntry, contextIds: IContextIds): { [key: string]: unknown } {
		const node = contextIds[ContextIdKeys.Node];
		const tenant = contextIds[ContextIdKeys.Tenant];

		return {
			"@timestamp": new Date(logEntry.ts ?? Date.now()).toISOString(),
			level: logEntry.level,
			source: logEntry.source,
			node: Is.stringValue(node) ? node : undefined,
			tenant: Is.stringValue(tenant) ? tenant : undefined,
			message: logEntry.message,
			data: logEntry.data,
			error: Is.object<IError>(logEntry.error) ? BaseError.flatten(logEntry.error) : undefined
		};
	}

	/**
	 * Deliver documents to the bulk API as a newline delimited JSON payload. Each document carries
	 * the id it was given when it was logged, so a document already indexed by an earlier attempt
	 * is reported as a conflict rather than indexed a second time.
	 * @param entries The cached entries to deliver.
	 * @returns What the response said about each document.
	 * @throws GeneralError if the request itself failed, so no document in it reached the cluster.
	 * @internal
	 */
	private async sendBulk(entries: IElkBatchEntry[]): Promise<IElkBulkOutcome> {
		const body = `${entries
			.map(entry => {
				const action = JSON.stringify({ create: { _index: entry.index, _id: entry.id } });
				return `${action}\n${JSON.stringify(entry.document)}`;
			})
			.join("\n")}\n`;

		const headers: { [key: string]: string } = { "content-type": "application/x-ndjson" };
		if (Is.stringValue(this._authorization)) {
			headers.authorization = this._authorization;
		}

		const response = await FetchHelper.fetch(
			ElkLoggingConnector.CLASS_NAME,
			`${this._endpoint}/_bulk`,
			HttpMethod.POST,
			body,
			{
				headers,
				timeoutMs: this._timeoutMs,
				retryCount: this._retryCount,
				retryDelayMs: this._retryDelayMs
			}
		);

		if (!response.ok) {
			throw new GeneralError(ElkLoggingConnector.CLASS_NAME, "bulkRequestFailed", {
				index: entries[0].index,
				status: response.status,
				statusText: response.statusText
			});
		}

		const contentType = response.headers.get("content-type") ?? "";
		if (!contentType.toLowerCase().includes("application/json")) {
			return { retry: [], rejected: 0 };
		}

		const result = (await response.json()) as {
			errors?: boolean;
			items?: { create?: { status?: number; error?: { reason?: string } } }[];
		};

		if (result.errors !== true) {
			return { retry: [], rejected: 0 };
		}

		return this.classifyItems(entries, result.items ?? []);
	}

	/**
	 * Work out which documents of a partially failed bulk response are worth delivering again.
	 * @param entries The entries the request was built from, in the order of the response items.
	 * @param items The per item results from the bulk response.
	 * @returns What the response said about each document.
	 * @internal
	 */
	private classifyItems(
		entries: IElkBatchEntry[],
		items: { create?: { status?: number; error?: { reason?: string } } }[]
	): IElkBulkOutcome {
		const retry: IElkBatchEntry[] = [];
		let rejected = 0;
		let reason: string | undefined;

		for (let i = 0; i < entries.length; i++) {
			const item = items[i];
			const create = item?.create;

			if (Is.empty(item)) {
				// The response says something failed but has no result for this document, so its fate
				// is unknown; the id it carries makes delivering it again safe either way.
				retry.push(entries[i]);
			} else if (!Is.empty(create?.error)) {
				reason ??= create?.error?.reason;

				const status = Coerce.integer(create?.status) ?? HttpStatusCode.internalServerError;

				// Conflict means that log entry was already delivered.
				if (status !== HttpStatusCode.conflict) {
					if (
						status === HttpStatusCode.tooManyRequests ||
						status >= HttpStatusCode.internalServerError
					) {
						retry.push(entries[i]);
					} else {
						rejected++;
					}
				}
			}
		}

		return { retry, rejected, reason };
	}

	/**
	 * The name of the index to write to, with a UTC date suffix when date rolling is enabled.
	 * @returns The resolved index name.
	 * @internal
	 */
	private resolveIndex(): string {
		if (!this._indexDateRolling) {
			return this._indexName;
		}
		const now = new Date();
		const year = now.getUTCFullYear();
		const month = `${now.getUTCMonth() + 1}`.padStart(2, "0");
		const day = `${now.getUTCDate()}`.padStart(2, "0");
		return `${this._indexName}-${year}.${month}.${day}`;
	}

	/**
	 * Is the cache full enough to deliver it now. Returns false if the last delivery is failing,
	 * because entries are waiting to be retried.
	 * @returns True if a size triggered flush should be scheduled.
	 * @internal
	 */
	private canFlushOnSize(): boolean {
		return (
			!this._deliveryFailed &&
			!Is.empty(this._batchSize) &&
			this._batchCache.length >= this._batchSize
		);
	}

	/**
	 * Schedule a flush to run.
	 * @internal
	 */
	private startImmediateFlush(): void {
		this.stopTimer();
		this._batchTimer = globalThis.setTimeout(async () => {
			try {
				await this.flush();
			} catch {
				// Cached entries stay in place and the next tick retries them. Nothing is logged
				// because this is the logging connector itself.
			}
		}, 0);
	}

	/**
	 * Start the interval timer if batchIntervalMs is configured and the connector is running.
	 * After a failed delivery a timer is started whether or not the interval is configured, since
	 * it is what carries the retry.
	 * @internal
	 */
	private startTimer(): void {
		const delayMs = this._deliveryFailed
			? (this._batchIntervalMs ?? ElkLoggingConnector.DEFAULT_BATCH_INTERVAL_MS)
			: this._batchIntervalMs;

		if (!Is.empty(delayMs) && Is.empty(this._batchTimer) && this._started) {
			this._batchTimer = globalThis.setTimeout(async () => {
				try {
					await this.flush();
				} catch {}
			}, delayMs);
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
