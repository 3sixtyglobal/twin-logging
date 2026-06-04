// Copyright 2024 IOTA Stiftung.
// SPDX-License-Identifier: Apache-2.0.
import type { IEntityStorageLoggingConnectorConfig } from "./IEntityStorageLoggingConnectorConfig.js";

/**
 * The options for the entity storage logging connector.
 */
export interface IEntityStorageLoggingConnectorConstructorOptions {
	/**
	 * The type of the entity storage connector to use.
	 * @default log-entry
	 */
	logEntryStorageConnectorType?: string;

	/**
	 * The type of the tenant component to use for partitioning.
	 * @default tenant
	 */
	tenantComponentType?: string;

	/**
	 * The configuration for the entity storage logging connector.
	 */
	config?: IEntityStorageLoggingConnectorConfig;
}
