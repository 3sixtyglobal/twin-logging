// Copyright 2024 IOTA Stiftung.
// SPDX-License-Identifier: Apache-2.0.
import { BaseRestClient } from "@twin.org/api-core";
import type { IBaseRestClientConfig, IOkResponse } from "@twin.org/api-models";
import { Coerce, Guards } from "@twin.org/core";
import type {
	ILogEntry,
	ILoggingComponent,
	ILoggingCreateRequest,
	ILoggingListRequest,
	ILoggingListResponse,
	LogLevel
} from "@twin.org/logging-models";
import { nameof } from "@twin.org/nameof";
import { HttpMethod } from "@twin.org/web";

/**
 * Client for performing logging through to REST endpoints.
 */
export class LoggingRestClient extends BaseRestClient implements ILoggingComponent {
	/**
	 * Runtime name for the class.
	 */
	public static readonly CLASS_NAME: string = nameof<LoggingRestClient>();

	/**
	 * Create a new instance of LoggingRestClient.
	 * @param config The configuration for the client.
	 */
	constructor(config: IBaseRestClientConfig) {
		super(LoggingRestClient.CLASS_NAME, config, "logging");
	}

	/**
	 * Returns the class name of the component.
	 * @returns The class name of the component.
	 */
	public className(): string {
		return LoggingRestClient.CLASS_NAME;
	}

	/**
	 * Log an entry to the connector.
	 * @param logEntry The entry to log.
	 * @returns A promise that resolves when the REST endpoint has accepted the entry.
	 */
	public async log(logEntry: ILogEntry): Promise<void> {
		Guards.object<ILogEntry>(LoggingRestClient.CLASS_NAME, nameof(logEntry), logEntry);

		await this.fetch<ILoggingCreateRequest, IOkResponse>("/", HttpMethod.POST, {
			body: logEntry
		});
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
		const response = await this.fetch<ILoggingListRequest, ILoggingListResponse>(
			"/",
			HttpMethod.GET,
			{
				query: {
					level,
					source,
					timeStart: Coerce.string(timeStart),
					timeEnd: Coerce.string(timeEnd),
					cursor,
					limit: Coerce.string(limit)
				}
			}
		);

		return response.body;
	}
}
