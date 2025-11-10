// Copyright 2024 IOTA Stiftung.
// SPDX-License-Identifier: Apache-2.0.
import { LoggingConnectorFactory } from "../src/factories/loggingConnectorFactory.js";
import type { ILoggingConnector } from "../src/models/ILoggingConnector.js";

describe("LoggingConnectorFactory", () => {
	test("can add an item to the factory", async () => {
		LoggingConnectorFactory.register("my-logging", () => ({}) as unknown as ILoggingConnector);
	});
});
