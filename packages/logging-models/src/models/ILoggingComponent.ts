// Copyright 2024 IOTA Stiftung.
// SPDX-License-Identifier: Apache-2.0.
import type { IComponent } from "@3sixty/core";
import type { ILogEntry } from "./ILogEntry.js";
import type { LogLevel } from "./logLevel.js";

/**
 * Interface describing a logging contract.
 */
export interface ILoggingComponent extends IComponent {
	/**
	 * Log an entry to the component.
	 * @param logEntry The entry to log.
	 * @returns A promise that resolves when the entry has been accepted by the component.
	 */
	log(logEntry: ILogEntry): Promise<void>;

	/**
	 * Query the log entries.
	 * @param level The level of the log entries.
	 * @param source The source of the log entries.
	 * @param timeStart The inclusive time as the start of the log entries.
	 * @param timeEnd The inclusive time as the end of the log entries.
	 * @param cursor The cursor to request the next chunk of entities.
	 * @param limit Limit the number of entities to return.
	 * @returns All the entities for the storage matching the conditions,
	 * and a cursor which can be used to request more entities.
	 */
	query(
		level?: LogLevel,
		source?: string,
		timeStart?: number,
		timeEnd?: number,
		cursor?: string,
		limit?: number
	): Promise<{
		/**
		 * The entities, which can be partial if a limited keys list was provided.
		 */
		entities: ILogEntry[];
		/**
		 * An optional cursor, when defined can be used to call find to get more entities.
		 */
		cursor?: string;
	}>;
}
