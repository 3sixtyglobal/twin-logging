// Copyright 2024 IOTA Stiftung.
// SPDX-License-Identifier: Apache-2.0.
import { I18n } from "@twin.org/core";
import { LogLevel } from "@twin.org/logging-models";
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
});
