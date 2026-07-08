// Copyright 2026 IOTA Stiftung.
// SPDX-License-Identifier: Apache-2.0.
import type { IFileLoggingConnectorConfig } from "./IFileLoggingConnectorConfig.js";

/**
 * Options for the file logging connector constructor.
 */
export interface IFileLoggingConnectorConstructorOptions {
	/**
	 * The configuration for the file logging connector.
	 */
	config: IFileLoggingConnectorConfig;
}
