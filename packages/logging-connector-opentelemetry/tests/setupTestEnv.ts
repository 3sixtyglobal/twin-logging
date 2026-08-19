// Copyright 2026 IOTA Stiftung.
// SPDX-License-Identifier: Apache-2.0.
import nodePath from "node:path";
import { fileURLToPath } from "node:url";
import { Guards } from "@twin.org/core";
import * as dotenv from "dotenv";

const dir = nodePath.dirname(fileURLToPath(import.meta.url));

dotenv.config({
	path: [nodePath.join(dir, ".env.dev"), nodePath.join(dir, ".env")],
	quiet: true
});

console.debug("Setting up test environment from .env and .env.dev files");

Guards.stringValue("TestEnv", "TEST_OTLP_ENDPOINT", process.env.TEST_OTLP_ENDPOINT);
Guards.stringValue("TestEnv", "TEST_OTLP_GRPC", process.env.TEST_OTLP_GRPC);
Guards.stringValue("TestEnv", "TEST_OTLP_GRAFANA", process.env.TEST_OTLP_GRAFANA);
Guards.stringValue("TestEnv", "TEST_OTLP_TEMPO", process.env.TEST_OTLP_TEMPO);
Guards.stringValue("TestEnv", "TEST_OTLP_PYROSCOPE", process.env.TEST_OTLP_PYROSCOPE);
Guards.stringValue("TestEnv", "TEST_OTLP_PROMETHEUS", process.env.TEST_OTLP_PROMETHEUS);

export const TEST_OTLP_ENDPOINT = process.env.TEST_OTLP_ENDPOINT;
export const TEST_OTLP_GRPC = process.env.TEST_OTLP_GRPC;
export const TEST_OTLP_GRAFANA = process.env.TEST_OTLP_GRAFANA;
export const TEST_OTLP_TEMPO = process.env.TEST_OTLP_TEMPO;
export const TEST_OTLP_PYROSCOPE = process.env.TEST_OTLP_PYROSCOPE;
export const TEST_OTLP_PROMETHEUS = process.env.TEST_OTLP_PROMETHEUS;

export const TEST_OTLP_ENDPOINT_LOGS = `${TEST_OTLP_ENDPOINT}/v1/logs`;
export const TEST_OTLP_ENDPOINT_TRACES = `${TEST_OTLP_ENDPOINT}/v1/traces`;
export const TEST_OTLP_ENDPOINT_METRICS = `${TEST_OTLP_ENDPOINT}/v1/metrics`;
