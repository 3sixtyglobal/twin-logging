// Copyright 2026 IOTA Stiftung.
// SPDX-License-Identifier: Apache-2.0.

/**
 * A pending Elasticsearch document held in the batch cache.
 */
export interface IElkBatchEntry {
	/**
	 * The document id.
	 */
	id: string;

	/**
	 * The index the document is written to.
	 */
	index: string;

	/**
	 * The document built from the log entry.
	 */
	document: { [key: string]: unknown };
}
