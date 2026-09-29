// Copyright 2026 IOTA Stiftung.
// SPDX-License-Identifier: Apache-2.0.
import type { IElkLoggingConnectorConfig } from "./IElkLoggingConnectorConfig.js";

/**
 * Options for the ELK logging connector constructor.
 */
export interface IElkLoggingConnectorConstructorOptions {
	/**
	 * The configuration for the ELK logging connector.
	 */
	config: IElkLoggingConnectorConfig;
}
