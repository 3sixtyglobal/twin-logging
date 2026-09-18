// Copyright 2024 IOTA Stiftung.
// SPDX-License-Identifier: Apache-2.0.
import { SortDirection, entity, property } from "@twin.org/entity";
import type { LogLevel } from "@twin.org/logging-models";
import type { LogEntryError } from "./logEntryError.js";

/**
 * Entity representing a persisted log entry.
 */
@entity()
export class LogEntry {
	/**
	 * The id.
	 * Bounded so storage backends index it in full rather than by prefix.
	 */
	@property({ type: "string", isPrimary: true, maxLength: 255 })
	public id!: string;

	/**
	 * The level of the error being logged.
	 */
	@property({ type: "string", maxLength: 16 })
	public level!: LogLevel;

	/**
	 * The source of the log entry.
	 */
	@property({ type: "string", maxLength: 256 })
	public source!: string;

	/**
	 * The timestamp of the log entry.
	 */
	@property({ type: "integer", format: "uint64", sortDirection: SortDirection.Descending })
	public ts!: number;

	/**
	 * The message.
	 */
	@property({ type: "string", maxLength: 2048 })
	public message!: string;

	/**
	 * Associated error data.
	 */
	@property({ type: "array", itemType: "object", itemTypeRef: "LogEntryError", optional: true })
	public error?: LogEntryError[];

	/**
	 * Data for the message.
	 */
	@property({ type: "object", optional: true })
	public data?: { [key: string]: unknown };
}
