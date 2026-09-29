// Copyright 2024 IOTA Stiftung.
// SPDX-License-Identifier: Apache-2.0.
import { GuardError } from "@twin.org/core";
import {
	LoggingConnectorFactory,
	LogLevel,
	type ILogEntry,
	type ILoggingConnector
} from "@twin.org/logging-models";
import { LoggingService } from "../src/loggingService.js";

describe("LoggingService", () => {
	test("Can create an instance", async () => {
		LoggingConnectorFactory.register("logging", () => ({}) as unknown as ILoggingConnector);
		const service = new LoggingService();
		expect(service).toBeDefined();
	});

	describe("log validation", () => {
		let logged: ILogEntry[];
		let service: LoggingService;

		beforeEach(() => {
			logged = [];
			LoggingConnectorFactory.register(
				"logging",
				() =>
					({
						log: async (logEntry: ILogEntry): Promise<void> => {
							logged.push(logEntry);
						}
					}) as unknown as ILoggingConnector
			);
			service = new LoggingService();
		});

		test("rejects an entry with no message and does not reach the connector", async () => {
			await expect(
				service.log({ level: LogLevel.Info, source: "client" } as never)
			).rejects.toMatchObject({
				name: GuardError.CLASS_NAME,
				message: "guard.string",
				properties: { property: "logEntry.message" }
			});
			expect(logged).toEqual([]);
		});

		test("rejects an entry with a non-string source", async () => {
			await expect(
				service.log({ level: LogLevel.Info, source: 42, message: "hello" } as never)
			).rejects.toMatchObject({
				name: GuardError.CLASS_NAME,
				message: "guard.string",
				properties: { property: "logEntry.source" }
			});
			expect(logged).toEqual([]);
		});

		test("rejects an entry with an unknown level", async () => {
			await expect(
				service.log({ level: "critical", source: "client", message: "hello" } as never)
			).rejects.toMatchObject({
				name: GuardError.CLASS_NAME,
				message: "guard.arrayOneOf",
				properties: { property: "logEntry.level" }
			});
			expect(logged).toEqual([]);
		});

		test("passes a valid entry through to the connector", async () => {
			await service.log({ level: LogLevel.Info, source: "client", message: "hello" });
			expect(logged).toEqual([{ level: LogLevel.Info, source: "client", message: "hello" }]);
		});
	});
});
