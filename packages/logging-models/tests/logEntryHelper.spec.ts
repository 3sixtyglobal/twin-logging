// Copyright 2024 IOTA Stiftung.
// SPDX-License-Identifier: Apache-2.0.
import { I18n } from "@twin.org/core";
import { LogEntryHelper } from "../src/helpers/logEntryHelper.js";
import { LogLevel } from "../src/models/logLevel.js";

describe("LogEntryHelper", () => {
	beforeAll(() => {
		I18n.addDictionary("en", {
			info: {
				testSource: {
					levelSourceMessage: "level source match {value}"
				}
			},
			testSource: {
				sourceMessage: "source match {value}"
			},
			plainMessage: "plain match {value}"
		});
	});

	test("can get the message key matching level, source and message", () => {
		const messageKey = LogEntryHelper.getMessageKey({
			level: LogLevel.Info,
			source: "TestSource",
			message: "levelSourceMessage"
		});
		expect(messageKey).toEqual("info.testSource.levelSourceMessage");
	});

	test("can get the message key matching source and message", () => {
		const messageKey = LogEntryHelper.getMessageKey({
			level: LogLevel.Info,
			source: "TestSource",
			message: "sourceMessage"
		});
		expect(messageKey).toEqual("testSource.sourceMessage");
	});

	test("can get the message key matching message only", () => {
		const messageKey = LogEntryHelper.getMessageKey({
			level: LogLevel.Info,
			source: "TestSource",
			message: "plainMessage"
		});
		expect(messageKey).toEqual("plainMessage");
	});

	test("can return undefined when no message key matches", () => {
		const messageKey = LogEntryHelper.getMessageKey({
			level: LogLevel.Info,
			source: "TestSource",
			message: "unknownMessage"
		});
		expect(messageKey).toBeUndefined();
	});

	test("can translate a message with data", () => {
		const translated = LogEntryHelper.translate({
			level: LogLevel.Info,
			source: "TestSource",
			message: "levelSourceMessage",
			data: { value: 42 }
		});
		expect(translated).toEqual("level source match 42");
	});

	test("can return undefined when translating with no matching key", () => {
		const translated = LogEntryHelper.translate({
			level: LogLevel.Info,
			source: "TestSource",
			message: "unknownMessage"
		});
		expect(translated).toBeUndefined();
	});
});
