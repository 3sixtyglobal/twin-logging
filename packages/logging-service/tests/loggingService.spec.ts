// Copyright 2024 IOTA Stiftung.
// SPDX-License-Identifier: Apache-2.0.
import { LoggingConnectorFactory, type ILoggingConnector } from "@twin.org/logging-models";
import { LoggingService } from "../src/loggingService.js";

describe("LoggingService", () => {
	test("Can create an instance", async () => {
		LoggingConnectorFactory.register("logging", () => ({}) as unknown as ILoggingConnector);
		const service = new LoggingService();
		expect(service).toBeDefined();
	});
});
