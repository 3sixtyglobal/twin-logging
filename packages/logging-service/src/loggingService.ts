// Copyright 2024 IOTA Stiftung.
// SPDX-License-Identifier: Apache-2.0.
import { Guards, Is } from "@twin.org/core";
import {
	ComparisonOperator,
	LogicalOperator,
	SortDirection,
	type EntityCondition
} from "@twin.org/entity";
import {
	LoggingConnectorFactory,
	type ILogEntry,
	type ILoggingComponent,
	type ILoggingConnector,
	type LogLevel
} from "@twin.org/logging-models";
import { nameof } from "@twin.org/nameof";
import type { ILoggingServiceConstructorOptions } from "./models/ILoggingServiceConstructorOptions";

/**
 * Service for performing logging operations to a connector.
 */
export class LoggingService implements ILoggingComponent {
	/**
	 * Runtime name for the class.
	 */
	public static readonly CLASS_NAME: string = nameof<LoggingService>();

	/**
	 * Logging connector used by the service.
	 * @internal
	 */
	private readonly _loggingConnector: ILoggingConnector;

	/**
	 * Create a new instance of LoggingService.
	 * @param options The options for the connector.
	 */
	constructor(options?: ILoggingServiceConstructorOptions) {
		this._loggingConnector = LoggingConnectorFactory.get(
			options?.loggingConnectorType ?? "logging"
		);
	}

	/**
	 * Log an entry to the connector.
	 * @param logEntry The entry to log.
	 * @returns Nothing.
	 */
	public async log(logEntry: ILogEntry): Promise<void> {
		Guards.object<ILogEntry>(LoggingService.CLASS_NAME, nameof(logEntry), logEntry);

		await this._loggingConnector.log(logEntry);
	}

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
	public async query(
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
	}> {
		const condition: EntityCondition<Omit<ILogEntry, "error" | "data">> = {
			conditions: [],
			logicalOperator: LogicalOperator.And
		};

		if (Is.stringValue(level)) {
			condition.conditions.push({
				property: "level",
				comparison: ComparisonOperator.Equals,
				value: level
			});
		}

		if (Is.stringValue(source)) {
			condition.conditions.push({
				property: "source",
				comparison: ComparisonOperator.Equals,
				value: source
			});
		}

		if (Is.number(timeStart)) {
			condition.conditions.push({
				property: "ts",
				comparison: ComparisonOperator.GreaterThanOrEqual,
				value: timeStart
			});
		}

		if (Is.number(timeEnd)) {
			condition.conditions.push({
				property: "ts",
				comparison: ComparisonOperator.LessThanOrEqual,
				value: timeEnd
			});
		}

		if (Is.function(this._loggingConnector?.query)) {
			const result = await this._loggingConnector.query(
				condition,
				[{ property: "ts", sortDirection: SortDirection.Descending }],
				undefined,
				cursor,
				limit
			);

			return { entities: result.entities as ILogEntry[], cursor: result.cursor };
		}

		return { entities: [] };
	}
}
