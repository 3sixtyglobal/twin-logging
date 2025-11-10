// Copyright 2024 IOTA Stiftung.
// SPDX-License-Identifier: Apache-2.0.
import type { ILoggingLevelsConfig } from "../models/ILoggingLevelsConfig.js";

/**
 * Options for the multi logging connector.
 */
export interface IMultiLoggingConnectorConstructorOptions {
	/**
	 * The logging connectors to multiplex.
	 */
	loggingConnectorTypes: string[];

	/**
	 * The configuration for the logging connector.
	 */
	config?: ILoggingLevelsConfig;
}
