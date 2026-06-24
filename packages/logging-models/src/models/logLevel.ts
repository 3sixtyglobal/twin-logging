// Copyright 2024 IOTA Stiftung.
// SPDX-License-Identifier: Apache-2.0.

/**
 * The log levels.
 */
// eslint-disable-next-line @typescript-eslint/naming-convention
export const LogLevel = {
	/**
	 * Info.
	 */
	Info: "info",

	/**
	 * Error.
	 */
	Error: "error",

	/**
	 * Warn.
	 */
	Warn: "warn",

	/**
	 * Trace.
	 */
	Trace: "trace",

	/**
	 * Debug.
	 */
	Debug: "debug"
} as const;

/**
 * The log levels.
 */
export type LogLevel = (typeof LogLevel)[keyof typeof LogLevel];
