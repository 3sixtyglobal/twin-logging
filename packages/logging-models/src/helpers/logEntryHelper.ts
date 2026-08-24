// Copyright 2024 IOTA Stiftung.
// SPDX-License-Identifier: Apache-2.0.
import { I18n, Is, StringHelper } from "@twin.org/core";
import type { ILogEntry } from "../models/ILogEntry.js";

/**
 * Helper class for log entry operations.
 */
export class LogEntryHelper {
	/**
	 * Translates the message of a log entry using the current locale.
	 * @param logEntry The log entry whose message should be translated.
	 * @returns The translated message string, or undefined if no matching translation key exists.
	 */
	public static translate(logEntry: ILogEntry): string | undefined {
		const messageKey = LogEntryHelper.getMessageKey(logEntry);
		if (Is.stringValue(messageKey)) {
			return I18n.formatMessage(messageKey, logEntry.data);
		}
	}

	/**
	 * Gets the dictionary key that would be used to translate the log entry message.
	 * @param logEntry The log entry to find the translation key for.
	 * @returns The matching dictionary key, or undefined if no matching translation key exists.
	 */
	public static getMessageKey(logEntry: ILogEntry): string | undefined {
		if (Is.stringValue(logEntry.level) && Is.stringValue(logEntry.source)) {
			const sourceMessage = `${logEntry.level}.${StringHelper.camelCase(logEntry.source)}.${logEntry.message}`;
			if (I18n.hasMessage(sourceMessage)) {
				return sourceMessage;
			}
		}

		if (Is.stringValue(logEntry.source)) {
			const sourceMessage = `${StringHelper.camelCase(logEntry.source)}.${logEntry.message}`;
			if (I18n.hasMessage(sourceMessage)) {
				return sourceMessage;
			}
		}

		if (I18n.hasMessage(logEntry.message)) {
			return logEntry.message;
		}
	}
}
