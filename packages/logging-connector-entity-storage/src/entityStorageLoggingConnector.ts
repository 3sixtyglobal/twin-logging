// Copyright 2024 IOTA Stiftung.
// SPDX-License-Identifier: Apache-2.0.
import type { ITenantComponent } from "@twin.org/api-models";
import { ContextIdKeys, ContextIdStore } from "@twin.org/context";
import {
	BaseError,
	ComponentFactory,
	Converter,
	Guards,
	type IError,
	Is,
	RandomHelper
} from "@twin.org/core";
import { type EntityCondition, LogicalOperator, type SortDirection } from "@twin.org/entity";
import {
	EntityStorageConnectorFactory,
	type IEntityStorageConnector
} from "@twin.org/entity-storage-models";
import { type ILogEntry, type ILoggingConnector, LogLevel } from "@twin.org/logging-models";
import { nameof } from "@twin.org/nameof";
import type { LogEntry } from "./entities/logEntry.js";
import type { LogEntryError } from "./entities/logEntryError.js";
import type { IEntityStorageLoggingConnectorConstructorOptions } from "./models/IEntityStorageLoggingConnectorConstructorOptions.js";

/**
 * Class for performing logging operations in entity storage.
 */
export class EntityStorageLoggingConnector implements ILoggingConnector {
	/**
	 * The namespace for the logging connector.
	 */
	public static readonly NAMESPACE: string = "entity-storage";

	/**
	 * Runtime name for the class.
	 */
	public static readonly CLASS_NAME: string = nameof<EntityStorageLoggingConnector>();

	/**
	 * The log levels to capture, will default to all.
	 * @internal
	 */
	private readonly _levels: LogLevel[];

	/**
	 * The entity storage for the log entries.
	 * @internal
	 */
	private readonly _logEntryStorage: IEntityStorageConnector<LogEntry>;

	/**
	 * Tenant component for partitioning.
	 * @internal
	 */
	private readonly _tenantComponent?: ITenantComponent;

	/**
	 * Create a new instance of EntityStorageLoggingConnector.
	 * @param options The options for the connector.
	 */
	constructor(options?: IEntityStorageLoggingConnectorConstructorOptions) {
		this._levels = options?.config?.levels ?? Object.values(LogLevel);
		this._logEntryStorage = EntityStorageConnectorFactory.get(
			options?.logEntryStorageConnectorType ?? "log-entry"
		);
		this._tenantComponent = ComponentFactory.getIfExists<ITenantComponent>(
			options?.tenantComponentType ?? "tenant"
		);
	}

	/**
	 * Returns the class name of the component.
	 * @returns The class name of the component.
	 */
	public className(): string {
		return EntityStorageLoggingConnector.CLASS_NAME;
	}

	/**
	 * Log an entry to the connector.
	 * @param logEntry The entry to log.
	 * @returns Nothing.
	 */
	public async log(logEntry: ILogEntry): Promise<void> {
		Guards.object<ILogEntry>(EntityStorageLoggingConnector.CLASS_NAME, nameof(logEntry), logEntry);

		if (this._levels.includes(logEntry.level)) {
			const id = Converter.bytesToHex(RandomHelper.generate(32));

			const entity: LogEntry = {
				id,
				level: logEntry.level,
				source: logEntry.source,
				ts: logEntry.ts ?? Date.now(),
				message: logEntry.message,
				error: Is.object<IError>(logEntry.error) ? BaseError.flatten(logEntry.error) : undefined,
				data: logEntry.data
			};

			// Log entry must be run once per tenant in multi tenant mode
			// if the tenant id is not already set in the context
			// as these are most likely startup events or logging run outside of a tenant context
			// we need to be sent to all tenants
			const contextIds = (await ContextIdStore.getContextIds()) ?? {};
			if (Is.stringValue(contextIds[ContextIdKeys.Tenant]) || Is.empty(this._tenantComponent)) {
				await this._logEntryStorage.set(entity);
			} else {
				await this._tenantComponent.runPerTenant(async () => this._logEntryStorage.set(entity));
			}
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
		const finalConditions: EntityCondition<ILogEntry> = {
			conditions: [],
			logicalOperator: LogicalOperator.And
		};

		if (!Is.empty(conditions)) {
			finalConditions.conditions.push(conditions);
		}

		const result = await this._logEntryStorage.query(
			finalConditions,
			sortProperties,
			properties,
			cursor,
			limit
		);

		const mappedEntities: Partial<ILogEntry>[] = [];

		for (const entity of result.entities) {
			mappedEntities.push({
				level: entity.level,
				source: entity.source,
				ts: entity.ts,
				message: entity.message,
				error: Is.arrayValue<LogEntryError>(entity.error)
					? BaseError.expand(entity.error)
					: undefined,
				data: entity.data
			});
		}

		return {
			entities: mappedEntities,
			cursor: result.cursor
		};
	}
}
