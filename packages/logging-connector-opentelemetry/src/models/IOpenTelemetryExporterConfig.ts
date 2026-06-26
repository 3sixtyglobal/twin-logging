// Copyright 2026 IOTA Stiftung.
// SPDX-License-Identifier: Apache-2.0.
import type { IOpenTelemetryOtlpExporterConfig } from "./IOpenTelemetryOtlpExporterConfig.js";

/**
 * Discriminated union of all supported log record exporter configurations.
 * Add new members here when additional exporter types are implemented.
 */
export type IOpenTelemetryExporterConfig = IOpenTelemetryOtlpExporterConfig;
// Future: | IOpenTelemetryOtlpGrpcExporterConfig | IOpenTelemetryConsoleExporterConfig
