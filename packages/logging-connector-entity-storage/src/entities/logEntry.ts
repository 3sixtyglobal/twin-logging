// Copyright 2024 IOTA Stiftung.
// SPDX-License-Identifier: Apache-2.0.
import { SortDirection, entity, property } from "@twin.org/entity";
import type { LogLevel } from "@twin.org/logging-models";
import type { LogEntryError } from "./logEntryError.js";

/**
 * Call defining a log entry.
 */
@entity()
export class LogEntry {
	/**
	 * The id.
	 */
	@property({ type: "string", isPrimary: true })
	public id!: string;

	/**
	 * The level of the error being logged.
	 */
	@property({ type: "string" })
	public level!: LogLevel;

	/**
	 * The source of the log entry.
	 */
	@property({ type: "string" })
	public source!: string;

	/**
	 * The timestamp of the log entry.
	 */
	@property({ type: "integer", format: "uint64", sortDirection: SortDirection.Descending })
	public ts!: number;

	/**
	 * The message.
	 */
	@property({ type: "string" })
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
