// Copyright 2024 IOTA Stiftung.
// SPDX-License-Identifier: Apache-2.0.
import type { EntityCondition, SortDirection } from "@twin.org/entity";
import { nameof } from "@twin.org/nameof";
import type { ILogEntry } from "../models/ILogEntry.js";
import type { ILoggingConnector } from "../models/ILoggingConnector.js";

/**
 * Class for performing logging operations to nowhere.
 */
export class SilentLoggingConnector implements ILoggingConnector {
	/**
	 * The namespace for the logging connector.
	 */
	public static readonly NAMESPACE: string = "silent";

	/**
	 * Runtime name for the class.
	 */
	public static readonly CLASS_NAME: string = nameof<SilentLoggingConnector>();

	/**
	 * Returns the class name of the component.
	 * @returns The class name of the component.
	 */
	public className(): string {
		return SilentLoggingConnector.CLASS_NAME;
	}

	/**
	 * Log an entry to the connector.
	 * @param logEntry The entry to log.
	 * @returns A promise that resolves immediately without performing any output.
	 */
	public async log(logEntry: ILogEntry): Promise<void> {}

	/**
	 * Query the log entries.
	 * @param conditions The conditions to match for the entities.
	 * @param sortProperties The optional sort order.
	 * @param properties The optional keys to return, defaults to all.
	 * @param cursor The cursor to request the next chunk of entities.
	 * @param limit Limit the number of entities to return.
	 * @returns All the entities for the storage matching the conditions,
	 * and a cursor which can be used to request more entities.
	 */
	public async query(
		conditions?: EntityCondition<ILogEntry>,
		sortProperties?: {
			property: keyof Omit<ILogEntry, "error" | "data">;
			sortDirection: SortDirection;
		}[],
		properties?: (keyof ILogEntry)[],
		cursor?: string,
		limit?: number
	): Promise<{
		/**
		 * The entities, which can be partial if a limited keys list was provided.
		 */
		entities: Partial<ILogEntry>[];
		/**
		 * An optional cursor, when defined can be used to call find to get more entities.
		 */
		cursor?: string;
	}> {
		return {
			entities: []
		};
	}
}
