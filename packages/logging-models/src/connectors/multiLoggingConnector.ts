// Copyright 2024 IOTA Stiftung.
// SPDX-License-Identifier: Apache-2.0.
import { Guards, Is } from "@twin.org/core";
import type { EntityCondition, SortDirection } from "@twin.org/entity";
import { nameof } from "@twin.org/nameof";
import { LoggingConnectorFactory } from "../factories/loggingConnectorFactory.js";
import type { ILogEntry } from "../models/ILogEntry.js";
import type { ILoggingConnector } from "../models/ILoggingConnector.js";
import type { IMultiLoggingConnectorConstructorOptions } from "../models/IMultiLoggingConnectorConstructorOptions.js";
import { LogLevel } from "../models/logLevel.js";

/**
 * Class for performing logging operations on multiple connectors.
 */
export class MultiLoggingConnector implements ILoggingConnector {
	/**
	 * The namespace for the logging connector.
	 */
	public static readonly NAMESPACE: string = "multi";

	/**
	 * Runtime name for the class.
	 */
	public static readonly CLASS_NAME: string = nameof<MultiLoggingConnector>();

	/**
	 * The connectors to send the log entries to.
	 * @internal
	 */
	private readonly _loggingConnectors: ILoggingConnector[];

	/**
	 * The log levels to display, will default to all.
	 * @internal
	 */
	private readonly _levels: LogLevel[];

	/**
	 * Create a new instance of MultiLoggingConnector.
	 * @param options The options for the connector.
	 */
	constructor(options: IMultiLoggingConnectorConstructorOptions) {
		Guards.object(MultiLoggingConnector.CLASS_NAME, nameof(options), options);
		Guards.arrayValue(
			MultiLoggingConnector.CLASS_NAME,
			nameof(options.loggingConnectorTypes),
			options.loggingConnectorTypes
		);
		this._levels = options?.config?.levels ?? Object.values(LogLevel);
		this._loggingConnectors = options.loggingConnectorTypes.map(t =>
			LoggingConnectorFactory.get(t)
		);
	}

	/**
	 * Returns the class name of the component.
	 * @returns The class name of the component.
	 */
	public className(): string {
		return MultiLoggingConnector.CLASS_NAME;
	}

	/**
	 * Log an entry to the connector.
	 * @param logEntry The entry to log.
	 * @returns Nothing.
	 */
	public async log(logEntry: ILogEntry): Promise<void> {
		Guards.object<ILogEntry>(MultiLoggingConnector.CLASS_NAME, nameof(logEntry), logEntry);

		if (this._levels.includes(logEntry.level)) {
			logEntry.ts ??= Date.now();

			await Promise.allSettled(
				this._loggingConnectors.map(async loggingConnector => loggingConnector.log(logEntry))
			);
		}
	}

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
		// See if we can find a connector that supports querying.
		// If it throws anything other than not implemented, we should throw it.
		for (const loggingConnector of this._loggingConnectors) {
			// eslint-disable-next-line @typescript-eslint/unbound-method
			if (Is.function(loggingConnector.query)) {
				return loggingConnector.query(conditions, sortProperties, properties, cursor, limit);
			}
		}

		return {
			entities: []
		};
	}
}
