// Copyright 2026 IOTA Stiftung.
// SPDX-License-Identifier: Apache-2.0.
import type { OpenTelemetryExporterTypes } from "./openTelemetryExporterTypes.js";

/**
 * Configuration for an OTLP-over-HTTP log record exporter.
 * The connector instantiates an OTLPLogExporter from these options in start().
 */
export interface IOpenTelemetryOtlpExporterConfig {
	/**
	 * Type.
	 */
	type: typeof OpenTelemetryExporterTypes.Otlp;

	/**
	 * The full URL of the OTLP logs endpoint to push records to, e.g.
	 * "http://localhost:4318/v1/logs". Required: a missing endpoint is rejected at start().
	 */
	endpoint: string;

	/**
	 * Additional headers to attach to each export request, e.g. for authentication.
	 */
	headers?: { [key: string]: string };

	/**
	 * Which log record processor to wrap the exporter with.
	 * "batch" accumulates records and flushes on a schedule or when the buffer fills.
	 * "simple" exports each record as it is emitted (useful for tests and local development).
	 * @default batch
	 */
	processor?: "batch" | "simple";

	/**
	 * The delay interval in milliseconds between two consecutive batch exports.
	 * Only applies when processor is "batch".
	 * @default 5000
	 */
	scheduledDelayMs?: number;

	/**
	 * The maximum number of records exported in a single batch.
	 * Only applies when processor is "batch".
	 * @default 512
	 */
	maxExportBatchSize?: number;

	/**
	 * The maximum number of records held in the queue before records are dropped.
	 * Only applies when processor is "batch".
	 * @default 2048
	 */
	maxQueueSize?: number;

	/**
	 * How long a single export may run before it is cancelled, in milliseconds.
	 * Only applies when processor is "batch".
	 * @default 30000
	 */
	exportTimeoutMs?: number;

	/**
	 * The maximum number of concurrent export requests the exporter will make.
	 */
	concurrencyLimit?: number;

	/**
	 * How long an OTLP request may run before it times out, in milliseconds.
	 */
	timeoutMs?: number;
}
