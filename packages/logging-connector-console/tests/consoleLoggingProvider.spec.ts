// Copyright 2024 IOTA Stiftung.
// SPDX-License-Identifier: Apache-2.0.
import { ConsoleLoggingConnector } from "../src/consoleLoggingConnector.js";

describe("ConsoleLoggingConnector", () => {
	test("can construct", async () => {
		const logging = new ConsoleLoggingConnector();
		expect(logging).toBeDefined();
	});
});
