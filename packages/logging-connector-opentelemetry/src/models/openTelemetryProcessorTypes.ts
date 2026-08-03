// Copyright 2026 IOTA Stiftung.
// SPDX-License-Identifier: Apache-2.0.

/**
 * The types of log record processors.
 */
// eslint-disable-next-line @typescript-eslint/naming-convention
export const OpenTelemetryProcessorTypes = {
	/**
	 * Accumulates records and flushes on a schedule or when the buffer fills.
	 */
	Batch: "batch",

	/**
	 * Exports each record as it is emitted, useful for tests and local development.
	 */
	Simple: "simple"
} as const;

/**
 * The types of log record processors.
 */
export type OpenTelemetryProcessorTypes =
	(typeof OpenTelemetryProcessorTypes)[keyof typeof OpenTelemetryProcessorTypes];
