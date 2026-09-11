// Copyright 2024 IOTA Stiftung.
// SPDX-License-Identifier: Apache-2.0.
import type { ILoggingLevelsConfig } from "@twin.org/logging-models";

/**
 * Configuration for the Entity Storage Logging Connector.
 */
export interface IEntityStorageLoggingConnectorConfig extends ILoggingLevelsConfig {
	/**
	 * Flush the cache once this many entries have accumulated.
	 * Set to 1 or below to disable size-based flushing.
	 * When combined with batchIntervalMs, whichever threshold is reached first triggers the flush.
	 * @default 10
	 */
	batchSize?: number;

	/**
	 * Flush the cache after this many milliseconds have elapsed since the last flush.
	 * Set to 0 or below to disable time-based flushing.
	 * When combined with batchSize, whichever threshold is reached first triggers the flush.
	 * @default 5000
	 */
	batchIntervalMs?: number;

	/**
	 * Maximum number of entries to hold in the in-memory cache.
	 * When the limit is exceeded the oldest entries are dropped, whether they were newly
	 * logged or put back by a failed flush.
	 * Set to 0 to disable the limit.
	 * @default 1000
	 */
	maxCacheSize?: number;

	/**
	 * Delete log entries older than this many milliseconds.
	 * When combined with maxEntries, age-based cleanup runs first.
	 * Set to 0 to disable age-based retention.
	 * @default 172800000 (2 days)
	 */
	retainForMs?: number;

	/**
	 * Keep at most this many log entries. When the stored count exceeds this limit,
	 * the oldest entries (by timestamp) are removed first.
	 * When combined with retainForMs, age-based cleanup runs first.
	 * Set to 0 to disable count-based retention.
	 * @default 10000
	 */
	maxEntries?: number;

	/**
	 * How often the retention cleanup task runs in milliseconds.
	 * Has no effect when both retainForMs and maxEntries are 0.
	 * Set to 0 to disable periodic cleanup.
	 * @default 300000 (5 minutes)
	 */
	retentionIntervalMs?: number;

	/**
	 * Maximum number of entries to delete per removeBatch call during a cleanup pass.
	 * Keeping this value small avoids spikes in database load.
	 * @default 1000
	 */
	retentionBatchSize?: number;
}
