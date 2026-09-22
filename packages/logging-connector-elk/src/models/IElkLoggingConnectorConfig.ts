// Copyright 2026 IOTA Stiftung.
// SPDX-License-Identifier: Apache-2.0.
import type { ILoggingLevelsConfig } from "@twin.org/logging-models";

/**
 * Configuration for the ELK Logging Connector.
 */
export interface IElkLoggingConnectorConfig extends ILoggingLevelsConfig {
	/**
	 * The base URL of the Elasticsearch endpoint, e.g. http://localhost:9200.
	 */
	endpoint: string;

	/**
	 * The name of the index documents are written to.
	 * @default twin-logs
	 */
	indexName?: string;

	/**
	 * Append a UTC date suffix to the index name, e.g. twin-logs-2026.08.03, so that
	 * index lifecycle management can roll indices by day.
	 * @default false
	 */
	indexDateRolling?: boolean;

	/**
	 * The API key to authenticate with, sent as an ApiKey authorization header.
	 * Mutually exclusive with username and password.
	 */
	apiKey?: string;

	/**
	 * The user name for basic authentication, requires password.
	 * Mutually exclusive with apiKey.
	 */
	username?: string;

	/**
	 * The password for basic authentication, requires username.
	 * Mutually exclusive with apiKey.
	 */
	password?: string;

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
	 * Maximum number of entries to hold in the in-memory cache. Set to 0 to disable the limit.
	 * @default 1000
	 */
	maxCacheSize?: number;

	/**
	 * Timeout in milliseconds for a bulk request.
	 * @default 30000
	 */
	timeoutMs?: number;

	/**
	 * Number of attempts made for a bulk request before the entries are re-queued.
	 * @default 1
	 */
	retryCount?: number;

	/**
	 * Number of milliseconds to delay before each retry.
	 */
	retryDelayMs?: number;
}
