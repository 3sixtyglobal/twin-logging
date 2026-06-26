// Copyright 2026 IOTA Stiftung.
// SPDX-License-Identifier: Apache-2.0.

/**
 * The types of log record exporters.
 */
// eslint-disable-next-line @typescript-eslint/naming-convention
export const OpenTelemetryExporterTypes = {
	/**
	 * OTLP over HTTP.
	 */
	Otlp: "otlp"
} as const;

/**
 * The types of log record exporters.
 */
export type OpenTelemetryExporterTypes =
	(typeof OpenTelemetryExporterTypes)[keyof typeof OpenTelemetryExporterTypes];
