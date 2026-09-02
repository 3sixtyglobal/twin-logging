// Copyright 2024 IOTA Stiftung.
// SPDX-License-Identifier: Apache-2.0.
import { Guards, I18n, Is, ObjectHelper } from "@twin.org/core";
import {
	LogEntryHelper,
	LogLevel,
	type ILogEntry,
	type ILoggingConnector
} from "@twin.org/logging-models";
import { nameof } from "@twin.org/nameof";
import type { IConsoleLoggingConnectorConstructorOptions } from "./models/IConsoleLoggingConnectorConstructorOptions.js";

/**
 * Class for performing logging operations in the console.
 */
export class ConsoleLoggingConnector implements ILoggingConnector {
	/**
	 * Runtime name for the class.
	 */
	public static readonly CLASS_NAME: string = nameof<ConsoleLoggingConnector>();

	/**
	 * The namespace for the logging connector.
	 */
	public static readonly NAMESPACE: string = "console";

	/**
	 * Colors for highlighting.
	 * @internal
	 */
	private static readonly _COLORS: { [id: string]: number } = {
		blue: 34,
		cyan: 36,
		green: 32,
		magenta: 35,
		red: 31
	};

	/**
	 * The log levels to display, will default to all.
	 * @internal
	 */
	private readonly _levels: LogLevel[];

	/**
	 * Translate messages using the current locale.
	 * @internal
	 */
	private readonly _translateMessages: boolean;

	/**
	 * Hide the groups.
	 * @internal
	 */
	private readonly _hideGroups: boolean;

	/**
	 * The last group identity.
	 * @internal
	 */
	private _lastGroup?: string;

	/**
	 * Create a new instance of ConsoleLoggingConnector.
	 * @param options The options for the logging connector.
	 */
	constructor(options?: IConsoleLoggingConnectorConstructorOptions) {
		this._levels = options?.config?.levels ?? Object.values(LogLevel);
		this._translateMessages = options?.config?.translateMessages ?? false;
		this._hideGroups = options?.config?.hideGroups ?? false;
	}

	/**
	 * Returns the class name of the component.
	 * @returns The class name of the component.
	 */
	public className(): string {
		return ConsoleLoggingConnector.CLASS_NAME;
	}

	/**
	 * Log an entry to the connector.
	 * @param logEntry The entry to log.
	 * @returns A promise that resolves when the entry has been written to the console.
	 */
	public async log(logEntry: ILogEntry): Promise<void> {
		Guards.object<ILogEntry>(ConsoleLoggingConnector.CLASS_NAME, nameof(logEntry), logEntry);

		if (this._levels.includes(logEntry.level)) {
			logEntry.ts ??= Date.now();

			const params: unknown[] = [
				this.colorize(logEntry.level.toUpperCase(), logEntry.level === "error" ? "red" : "green"),
				this.colorize(`[${new Date(logEntry.ts).toISOString()}]`, "magenta")
			];

			if (!this._hideGroups) {
				this.handleGroup(logEntry.source);
			} else {
				params.push(this.colorize(logEntry.source, "blue"));
			}

			let message = logEntry.message;
			let data = logEntry.data;

			if (this._translateMessages) {
				const messageKey = LogEntryHelper.getMessageKey(logEntry);
				if (Is.stringValue(messageKey)) {
					message = I18n.formatMessage(messageKey, logEntry.data);
					data = this.reduceTranslatedData(messageKey, logEntry.data);
				}
			}

			params.push(this.colorize(message, "cyan"));

			if (!Is.empty(data)) {
				if (Is.object(data) || Is.array(data)) {
					params.push(JSON.stringify(data));
				} else {
					params.push(data);
				}
			}

			if (logEntry.error) {
				params.push(logEntry.error);
			}

			// eslint-disable-next-line no-restricted-syntax
			globalThis.console[logEntry.level](...params);
		}
	}

	/**
	 * Removes the data properties consumed by the translated message placeholders.
	 * @param messageKey The dictionary key the message was translated with.
	 * @param data The log entry data.
	 * @returns The remaining data properties, or undefined when none remain.
	 * @internal
	 */
	private reduceTranslatedData(
		messageKey: string,
		data?: { [key: string]: unknown }
	): { [key: string]: unknown } | undefined {
		if (Is.objectValue(data)) {
			const template = I18n.getDictionary(I18n.getLocale())?.[messageKey];
			if (Is.stringValue(template)) {
				const remaining = ObjectHelper.omit(data, I18n.getPropertyNames(template));
				if (Is.objectValue(remaining)) {
					return remaining;
				}
			}
		}
	}

	/**
	 * Derives an HSL color string from a source string using a hash of its characters.
	 * @param str The string to derive a color from.
	 * @returns An HSL color string suitable for use in CSS.
	 * @internal
	 */
	private stringToColor(str: string): string {
		const stringUniqueHash = [...str].reduce(
			// eslint-disable-next-line no-bitwise
			(acc, char) => char.charCodeAt(0) + ((acc << 5) - acc),
			0
		);
		return `hsl(${stringUniqueHash % 360}, 95%, 35%)`;
	}

	/**
	 * Add color to a string.
	 * @param message The string to colorize.
	 * @param color The color to use.
	 * @returns The colorized string.
	 * @internal
	 */
	private colorize(message: string, color: "blue" | "cyan" | "green" | "magenta" | "red"): string {
		// eslint-disable-next-line unicorn/escape-case
		return `\x1b[${ConsoleLoggingConnector._COLORS[color]}m${message}\x1b[39m`;
	}

	/**
	 * Opens or switches the console group when the active group changes.
	 * @param group The group identifier to display.
	 * @internal
	 */
	private handleGroup(group: string): void {
		if (this._lastGroup !== group) {
			this._lastGroup = group;
			if (this._lastGroup) {
				// eslint-disable-next-line no-restricted-syntax
				globalThis.console.groupEnd();
			}
			if (group.length > 0) {
				// eslint-disable-next-line no-restricted-syntax
				globalThis.console.group(
					`%c${group}`,
					`color: #ffffff; background: ${this.stringToColor(
						group
					)}; font-size: 10px; font-weight: bold; padding: 2px 4px; border-radius: 5px`
				);
			}
		}
	}
}
