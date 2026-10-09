// Copyright 2024 IOTA Stiftung.
// SPDX-License-Identifier: Apache-2.0.
import { GuardError } from "@3sixty/core";
import { MultiLoggingConnector } from "../src/connectors/multiLoggingConnector.js";
import { LoggingConnectorFactory } from "../src/factories/loggingConnectorFactory.js";
import type { ILogEntry } from "../src/models/ILogEntry.js";
import type { ILoggingConnector } from "../src/models/ILoggingConnector.js";
import { LogLevel } from "../src/models/logLevel.js";

describe("MultiLoggingConnector", () => {
	describe("log validation", () => {
		let logged: ILogEntry[];
		let connector: MultiLoggingConnector;

		beforeEach(() => {
			logged = [];
			LoggingConnectorFactory.register(
				"child",
				() =>
					({
						log: async (logEntry: ILogEntry): Promise<void> => {
							logged.push(logEntry);
						}
					}) as unknown as ILoggingConnector
			);
			connector = new MultiLoggingConnector({ loggingConnectorTypes: ["child"] });
		});

		test("rejects an entry with no message and does not reach the child connectors", async () => {
			await expect(
				connector.log({ level: LogLevel.Info, source: "client" } as never)
			).rejects.toMatchObject({
				name: GuardError.CLASS_NAME,
				message: "guard.string",
				properties: { property: "logEntry.message" }
			});
			expect(logged).toEqual([]);
		});

		test("rejects an entry with a non-string source", async () => {
			await expect(
				connector.log({ level: LogLevel.Info, source: 42, message: "hello" } as never)
			).rejects.toMatchObject({
				name: GuardError.CLASS_NAME,
				message: "guard.string",
				properties: { property: "logEntry.source" }
			});
			expect(logged).toEqual([]);
		});

		test("rejects an entry with an unknown level", async () => {
			await expect(
				connector.log({ level: "critical", source: "client", message: "hello" } as never)
			).rejects.toMatchObject({
				name: GuardError.CLASS_NAME,
				message: "guard.arrayOneOf",
				properties: { property: "logEntry.level" }
			});
			expect(logged).toEqual([]);
		});

		test("passes a valid entry through to the child connectors", async () => {
			await connector.log({ level: LogLevel.Info, source: "client", message: "hello" });
			expect(logged).toHaveLength(1);
			expect(logged[0]).toMatchObject({
				level: LogLevel.Info,
				source: "client",
				message: "hello"
			});
		});
	});
});
