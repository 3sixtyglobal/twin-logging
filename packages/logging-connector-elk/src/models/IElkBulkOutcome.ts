// Copyright 2026 IOTA Stiftung.
// SPDX-License-Identifier: Apache-2.0.
import type { IElkBatchEntry } from "./IElkBatchEntry.js";

/**
 * The result of one bulk request, describing what the Elasticsearch response said about each document.
 */
export interface IElkBulkOutcome {
	/**
	 * The entries Elasticsearch failed on a transient basis, which should be delivered again.
	 */
	retry: IElkBatchEntry[];

	/**
	 * The number of entries Elasticsearch rejected in a way that repeating the request cannot fix.
	 */
	rejected: number;

	/**
	 * The reason reported.
	 */
	reason?: string;
}
