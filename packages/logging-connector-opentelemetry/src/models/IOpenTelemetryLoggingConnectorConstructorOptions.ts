// Copyright 2026 IOTA Stiftung.
// SPDX-License-Identifier: Apache-2.0.
import type { IOpenTelemetryLoggingConnectorConfig } from "./IOpenTelemetryLoggingConnectorConfig.js";

/**
 * Options for the OpenTelemetry logging connector constructor.
 */
export interface IOpenTelemetryLoggingConnectorConstructorOptions {
	/**
	 * The config for the logging connector.
	 */
	config?: IOpenTelemetryLoggingConnectorConfig;
}
