// Copyright 2026 IOTA Stiftung.
// SPDX-License-Identifier: Apache-2.0.
import type { ILoggingLevelsConfig } from "@3sixty/logging-models";

/**
 * Configuration for the File Logging Connector.
 */
export interface IFileLoggingConnectorConfig extends ILoggingLevelsConfig {
	/**
	 * The directory in which the log files are written, created if it does not exist.
	 */
	directory: string;

	/**
	 * The name of the active log file within the directory.
	 * @default app.log
	 */
	filename?: string;

	/**
	 * The maximum size in bytes the active log file can reach before it is rotated.
	 * A value of 0 or less disables size based rotation, allowing the file to grow without bound.
	 * A positive value below the minimum of 102400 (100 KB) throws on construction, to avoid
	 * excessive rotation.
	 * @default 10485760
	 */
	maxFileSizeBytes?: number;

	/**
	 * The maximum number of rotated log files to retain alongside the active file.
	 * When the limit is reached the oldest rotated file is removed.
	 * A value of 0 or less retains no rotated files, the active file is discarded on rotation.
	 * @default 5
	 */
	maxRetainedFiles?: number;

	/**
	 * The timeout in milliseconds to wait when acquiring the write lock before a log call fails.
	 * Defaults to the Mutex default when not set.
	 */
	mutexTimeoutMs?: number;
}
