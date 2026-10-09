// Copyright 2026 IOTA Stiftung.
// SPDX-License-Identifier: Apache-2.0.
import type { ILoggingLevelsConfig } from "@3sixty/logging-models";
import type { IOpenTelemetryExporterConfig } from "./IOpenTelemetryExporterConfig.js";

/**
 * Configuration for the OpenTelemetry logging connector.
 */
export interface IOpenTelemetryLoggingConnectorConfig extends ILoggingLevelsConfig {
	/**
	 * The name of the OpenTelemetry logger used to emit records.
	 * @default twin-logging
	 */
	loggerName?: string;

	/**
	 * The version reported by the OpenTelemetry logger.
	 * @default 1.0.0
	 */
	loggerVersion?: string;

	/**
	 * Attributes describing the entity producing the logs, attached to the OTEL Resource
	 * so backends can group records by service, e.g. `{ "service.name": "my-service" }`.
	 * Omit for a resource with only the SDK defaults.
	 */
	resourceAttributes?: { [key: string]: string | number | boolean };

	/**
	 * Named exporter configurations keyed by an arbitrary id.
	 * Each entry's `type` field determines which exporter the connector instantiates
	 * in start(). Omit or pass an empty object for a no-op provider (useful for tests) -
	 * records are then mapped and emitted but not exported anywhere.
	 */
	exporters?: { [id: string]: IOpenTelemetryExporterConfig };
}
