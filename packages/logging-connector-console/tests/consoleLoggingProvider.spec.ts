// Copyright 2024 IOTA Stiftung.
// SPDX-License-Identifier: Apache-2.0.
import { GuardError, I18n } from "@3sixty/core";
import { LogLevel } from "@3sixty/logging-models";
import { ConsoleLoggingConnector } from "../src/consoleLoggingConnector.js";

describe("ConsoleLoggingConnector", () => {
	beforeAll(() => {
		I18n.addDictionary("en", {
			testSource: {
				subsetMessage: "subset {statusCode} {url}",
				fullMessage: "full {value}"
			}
		});
	});

	beforeEach(() => {
		vi.spyOn(globalThis.console, "info").mockImplementation(() => {});
	});

	afterEach(() => {
		vi.restoreAllMocks();
	});

	test("can construct", async () => {
		const logging = new ConsoleLoggingConnector();
		expect(logging).toBeDefined();
	});

	test("can log a message with the full data when translation is disabled", async () => {
		const logging = new ConsoleLoggingConnector({ config: { hideGroups: true } });
		await logging.log({
			level: LogLevel.Info,
			source: "TestSource",
			message: "subsetMessage",
			ts: 1719000000000,
			data: { statusCode: 400, url: "/foo" }
		});
		expect(globalThis.console.info).toHaveBeenCalledWith(
			expect.stringContaining("INFO"),
			expect.stringContaining(new Date(1719000000000).toISOString()),
			expect.stringContaining("TestSource"),
			expect.stringContaining("subsetMessage"),
			JSON.stringify({ statusCode: 400, url: "/foo" })
		);
	});

	test("can log the remaining data when the translation consumes a subset of the properties", async () => {
		const logging = new ConsoleLoggingConnector({
			config: { translateMessages: true, hideGroups: true }
		});
		await logging.log({
			level: LogLevel.Info,
			source: "TestSource",
			message: "subsetMessage",
			ts: 1719000000000,
			data: { statusCode: 400, url: "/foo", body: { marker: "abc" } }
		});
		expect(globalThis.console.info).toHaveBeenCalledWith(
			expect.stringContaining("INFO"),
			expect.stringContaining(new Date(1719000000000).toISOString()),
			expect.stringContaining("TestSource"),
			expect.stringContaining("subset 400 /foo"),
			JSON.stringify({ body: { marker: "abc" } })
		);
	});

	test("can log without data when the translation consumes all the properties", async () => {
		const logging = new ConsoleLoggingConnector({
			config: { translateMessages: true, hideGroups: true }
		});
		await logging.log({
			level: LogLevel.Info,
			source: "TestSource",
			message: "fullMessage",
			ts: 1719000000000,
			data: { value: 42 }
		});
		expect(globalThis.console.info).toHaveBeenCalledWith(
			expect.stringContaining("INFO"),
			expect.stringContaining(new Date(1719000000000).toISOString()),
			expect.stringContaining("TestSource"),
			expect.stringContaining("full 42")
		);
	});

	test("can log the full data when the message has no translation", async () => {
		const logging = new ConsoleLoggingConnector({
			config: { translateMessages: true, hideGroups: true }
		});
		await logging.log({
			level: LogLevel.Info,
			source: "TestSource",
			message: "untranslatedMessage",
			ts: 1719000000000,
			data: { statusCode: 400, url: "/foo" }
		});
		expect(globalThis.console.info).toHaveBeenCalledWith(
			expect.stringContaining("INFO"),
			expect.stringContaining(new Date(1719000000000).toISOString()),
			expect.stringContaining("TestSource"),
			expect.stringContaining("untranslatedMessage"),
			JSON.stringify({ statusCode: 400, url: "/foo" })
		);
	});

	test("can log with colour by default", async () => {
		const logging = new ConsoleLoggingConnector({ config: { hideGroups: true } });
		await logging.log({
			level: LogLevel.Info,
			source: "TestSource",
			message: "hello",
			ts: 1719000000000
		});
		expect(globalThis.console.info).toHaveBeenCalledWith(
			"\u001B[32mINFO\u001B[39m",
			`\u001B[35m[${new Date(1719000000000).toISOString()}]\u001B[39m`,
			"\u001B[34mTestSource\u001B[39m",
			"\u001B[36mhello\u001B[39m"
		);
	});

	test("can log without colour when disabled", async () => {
		const logging = new ConsoleLoggingConnector({
			config: { hideGroups: true, disableColor: true }
		});
		await logging.log({
			level: LogLevel.Info,
			source: "TestSource",
			message: "hello",
			ts: 1719000000000
		});
		expect(globalThis.console.info).toHaveBeenCalledWith(
			"INFO",
			`[${new Date(1719000000000).toISOString()}]`,
			"TestSource",
			"hello"
		);
	});

	test("can display groups without styling when colour is disabled", async () => {
		const groupSpy = vi.spyOn(globalThis.console, "group").mockImplementation(() => {});
		vi.spyOn(globalThis.console, "groupEnd").mockImplementation(() => {});
		const logging = new ConsoleLoggingConnector({ config: { disableColor: true } });
		await logging.log({
			level: LogLevel.Info,
			source: "TestSource",
			message: "hello",
			ts: 1719000000000
		});
		expect(groupSpy).toHaveBeenCalledWith("TestSource");
		expect(globalThis.console.info).toHaveBeenCalledWith(
			"INFO",
			`[${new Date(1719000000000).toISOString()}]`,
			"hello"
		);
	});

	describe("log validation", () => {
		test("rejects an entry with no message without writing to the console", async () => {
			const logging = new ConsoleLoggingConnector();
			await expect(
				logging.log({ level: LogLevel.Info, source: "TestSource" } as never)
			).rejects.toMatchObject({
				name: GuardError.CLASS_NAME,
				message: "guard.string",
				properties: { property: "logEntry.message" }
			});
			expect(globalThis.console.info).not.toHaveBeenCalled();
		});

		test("rejects an entry with a non-string source", async () => {
			const logging = new ConsoleLoggingConnector();
			await expect(
				logging.log({ level: LogLevel.Info, source: 42, message: "hello" } as never)
			).rejects.toMatchObject({
				name: GuardError.CLASS_NAME,
				message: "guard.string",
				properties: { property: "logEntry.source" }
			});
			expect(globalThis.console.info).not.toHaveBeenCalled();
		});

		test("rejects an entry with an unknown level", async () => {
			const logging = new ConsoleLoggingConnector();
			await expect(
				logging.log({ level: "critical", source: "TestSource", message: "hello" } as never)
			).rejects.toMatchObject({
				name: GuardError.CLASS_NAME,
				message: "guard.arrayOneOf",
				properties: { property: "logEntry.level" }
			});
			expect(globalThis.console.info).not.toHaveBeenCalled();
		});
	});
});
