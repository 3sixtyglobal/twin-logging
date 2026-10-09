// Copyright 2024 IOTA Stiftung.
// SPDX-License-Identifier: Apache-2.0.
import type { IContextIds } from "@3sixty/context";
import type { LogEntry } from "../entities/logEntry.js";

/**
 * A pending log entry held in the batch cache, preserving the tenant context
 * captured at the time log() was called so it can be faithfully replayed on flush.
 */
export interface IBatchEntry {
	/**
	 * The storage entity built from the log entry at the time log() was called.
	 */
	entity: LogEntry;

	/**
	 * Full context IDs snapshot taken at log() time; used to restore context on flush.
	 */
	contextIds: IContextIds;

	/**
	 * True when the entry was produced outside any tenant context and must be
	 * written to every tenant via run on flush.
	 */
	perTenant: boolean;
}
