// Copyright 2024 IOTA Stiftung.
// SPDX-License-Identifier: Apache-2.0.
import type { LogLevel } from "../logLevel.js";

/**
 * Request parameters for retrieving a list of log entries.
 */
export interface ILoggingListRequest {
	/**
	 * The query parameters.
	 */
	query?: {
		/**
		 * The level of the log entries to retrieve.
		 */
		level?: LogLevel;

		/**
		 * The source of the log entries to retrieve.
		 */
		source?: string;

		/**
		 * The start time of the metrics to retrieve as a timestamp in ms.
		 */
		timeStart?: string;

		/**
		 * The end time of the metrics to retrieve as a timestamp in ms.
		 */
		timeEnd?: string;

		/**
		 * The optional cursor to get next chunk.
		 */
		cursor?: string;

		/**
		 * Limit the number of entities to return.
		 */
		limit?: string;
	};
}
