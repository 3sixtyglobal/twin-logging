// Copyright 2026 IOTA Stiftung.
// SPDX-License-Identifier: Apache-2.0.
import path from "node:path";
import { Guards } from "@twin.org/core";
import * as dotenv from "dotenv";

dotenv.config({
	path: [path.join(import.meta.dirname, ".env.dev"), path.join(import.meta.dirname, ".env")],
	quiet: true
});

Guards.stringValue(
	"TestEnv",
	"TEST_ELASTICSEARCH_ENDPOINT",
	process.env.TEST_ELASTICSEARCH_ENDPOINT
);
Guards.stringValue("TestEnv", "TEST_ELASTICSEARCH_INDEX", process.env.TEST_ELASTICSEARCH_INDEX);

export const TEST_ELASTICSEARCH_ENDPOINT: string = process.env.TEST_ELASTICSEARCH_ENDPOINT;
export const TEST_ELASTICSEARCH_INDEX: string = process.env.TEST_ELASTICSEARCH_INDEX;
