// Copyright 2024 IOTA Stiftung.
// SPDX-License-Identifier: Apache-2.0.
import type { IConsoleLoggingConnectorConfig } from "./IConsoleLoggingConnectorConfig.js";

/**
 * Options for the console logging connector constructor.
 */
export interface IConsoleLoggingConnectorConstructorOptions {
	/**
	 * The configuration for the console logging connector.
	 */
	config?: IConsoleLoggingConnectorConfig;
}
