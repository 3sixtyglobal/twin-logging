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
	 * When a flush fails, re-queued entries are trimmed to this limit by dropping the oldest first.
	 * Set to 0 to disable the limit.
	 * @default 1000
	 */
	maxCacheSize?: number;
}
