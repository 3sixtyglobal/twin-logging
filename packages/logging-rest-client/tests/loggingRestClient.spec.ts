// Copyright 2024 IOTA Stiftung.
// SPDX-License-Identifier: Apache-2.0.
import { LoggingRestClient } from "../src/loggingRestClient";

describe("LoggingRestClient", () => {
	test("Can create an instance", async () => {
		const client = new LoggingRestClient({ endpoint: "http://localhost:8080" });
		expect(client).toBeDefined();
	});
});
