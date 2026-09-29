// Copyright 2026 IOTA Stiftung.
// SPDX-License-Identifier: Apache-2.0.
import { type FileHandle, mkdir, open, rename, rm, stat } from "node:fs/promises";
import path from "node:path";
import { ContextIdKeys, ContextIdStore, type IContextIds } from "@twin.org/context";
import { BaseError, Coerce, GeneralError, Guards, type IError, Is, Mutex } from "@twin.org/core";
import { type ILogEntry, type ILoggingConnector, LogLevel } from "@twin.org/logging-models";
import { nameof } from "@twin.org/nameof";
import type { IFileLoggingConnectorConstructorOptions } from "./models/IFileLoggingConnectorConstructorOptions.js";

/**
 * Class for performing logging operations to size-limited files on disk.
 *
 * Entries are appended to an active file as newline delimited JSON through a file handle
 * that is opened once and kept open, avoiding an open and close on every write. Each entry
 * is written straight through to the file so it is durable as soon as log() resolves.
 * When the active file would exceed the configured size limit it is rotated: the active
 * file becomes the newest numbered file and any file beyond the retained file limit is
 * removed, keeping total on-disk usage predictable.
 *
 * All tenants of a node share one file; each record carries the node and tenant.
 *
 * The connector assumes a single writer per file: one instance should own a given log file.
 * Its own writes and rotations are serialised with a mutex, but it does not coordinate with
 * other processes or external tools rotating the same file.
 */
export class FileLoggingConnector implements ILoggingConnector {
	/**
	 * The namespace for the logging connector.
	 */
	public static readonly NAMESPACE: string = "file";

	/**
	 * Runtime name for the class.
	 */
	public static readonly CLASS_NAME: string = nameof<FileLoggingConnector>();

	/**
	 * Default name for the active log file.
	 */
	public static readonly DEFAULT_FILENAME: string = "app.log";

	/**
	 * Default maximum size in bytes of the active log file before rotation (10 MB).
	 */
	public static readonly DEFAULT_MAX_FILE_SIZE_BYTES: number = 10 * 1024 * 1024;

	/**
	 * Minimum size in bytes that can be configured for the active log file before rotation (100 KB).
	 */
	public static readonly MIN_MAX_FILE_SIZE_BYTES: number = 100 * 1024;

	/**
	 * Default number of rotated log files to retain.
	 */
	public static readonly DEFAULT_MAX_RETAINED_FILES: number = 5;

	/**
	 * The log levels to capture, will default to all.
	 * @internal
	 */
	private readonly _levels: LogLevel[];

	/**
	 * The directory the log files are written to.
	 * @internal
	 */
	private readonly _directory: string;

	/**
	 * The name of the active log file.
	 * @internal
	 */
	private readonly _filename: string;

	/**
	 * Rotate the active file when it reaches this size in bytes; 0 disables size rotation.
	 * @internal
	 */
	private readonly _maxFileSizeBytes: number;

	/**
	 * Number of rotated files to retain; 0 retains none.
	 * @internal
	 */
	private readonly _maxRetainedFiles: number;

	/**
	 * Timeout in milliseconds passed to Mutex.lock calls.
	 * @internal
	 */
	private readonly _mutexTimeoutMs?: number;

	/**
	 * Key used to serialize concurrent writes and rotations via Mutex, the resolved active path.
	 * @internal
	 */
	private readonly _mutexKey: string;

	/**
	 * The tracked size in bytes of the active file, avoiding a stat on every write.
	 * @internal
	 */
	private _currentSize: number;

	/**
	 * The open handle for the active file, present only while the connector is open.
	 * @internal
	 */
	private _handle?: FileHandle;

	/**
	 * Create a new instance of FileLoggingConnector.
	 * @param options The options for the logging connector.
	 * @throws GeneralError if maxFileSizeBytes is a positive value below the minimum.
	 */
	constructor(options: IFileLoggingConnectorConstructorOptions) {
		Guards.object(FileLoggingConnector.CLASS_NAME, nameof(options), options);
		Guards.object(FileLoggingConnector.CLASS_NAME, nameof(options.config), options.config);
		Guards.stringValue(
			FileLoggingConnector.CLASS_NAME,
			nameof(options.config.directory),
			options.config.directory
		);

		this._levels = options.config.levels ?? Object.values(LogLevel);
		this._directory = options.config.directory;
		this._filename = Is.stringValue(options.config.filename)
			? options.config.filename
			: FileLoggingConnector.DEFAULT_FILENAME;

		const cfgMaxFileSizeBytes =
			Coerce.integer(options.config.maxFileSizeBytes) ??
			FileLoggingConnector.DEFAULT_MAX_FILE_SIZE_BYTES;
		if (
			cfgMaxFileSizeBytes > 0 &&
			cfgMaxFileSizeBytes < FileLoggingConnector.MIN_MAX_FILE_SIZE_BYTES
		) {
			throw new GeneralError(FileLoggingConnector.CLASS_NAME, "maxFileSizeTooSmall", {
				maxFileSizeBytes: cfgMaxFileSizeBytes,
				minimum: FileLoggingConnector.MIN_MAX_FILE_SIZE_BYTES
			});
		}
		this._maxFileSizeBytes = cfgMaxFileSizeBytes <= 0 ? 0 : cfgMaxFileSizeBytes;

		const cfgMaxRetainedFiles =
			Coerce.integer(options.config.maxRetainedFiles) ??
			FileLoggingConnector.DEFAULT_MAX_RETAINED_FILES;
		this._maxRetainedFiles = cfgMaxRetainedFiles > 0 ? cfgMaxRetainedFiles : 0;

		this._mutexTimeoutMs = Coerce.integer(options.config.mutexTimeoutMs);
		this._mutexKey = path.resolve(this._directory, this._filename);
		this._currentSize = 0;
	}

	/**
	 * Returns the class name of the component.
	 * @returns The class name of the component.
	 */
	public className(): string {
		return FileLoggingConnector.CLASS_NAME;
	}

	/**
	 * Start the connector; ensures the target directory exists and opens the file handle.
	 * @returns A promise that resolves when the connector is ready to accept log entries.
	 */
	public async start(): Promise<void> {
		const locked = await Mutex.lock(this._mutexKey, {
			throwOnTimeout: true,
			timeoutMs: this._mutexTimeoutMs
		});
		if (locked) {
			try {
				await this.ensureOpen();
			} finally {
				Mutex.unlock(this._mutexKey);
			}
		}
	}

	/**
	 * Stop the connector; closes the file handle, releasing the descriptor.
	 * Calling stop() on a connector that has not been opened is a no-op.
	 * @returns A promise that resolves when the handle has been closed.
	 */
	public async stop(): Promise<void> {
		const locked = await Mutex.lock(this._mutexKey, {
			throwOnTimeout: true,
			timeoutMs: this._mutexTimeoutMs
		});
		if (locked) {
			try {
				await this.closeHandle();
			} finally {
				Mutex.unlock(this._mutexKey);
			}
		}
	}

	/**
	 * Log an entry to the connector.
	 * The entry is appended to the active file as a single newline delimited JSON record;
	 * when the active file exceeds the configured size limit it is rotated first.
	 * The current ContextIdStore context is read on every call so that each record carries the
	 * node and tenant it was logged under.
	 * @param logEntry The entry to log.
	 * @returns A promise that resolves when the entry has been written to disk.
	 */
	public async log(logEntry: ILogEntry): Promise<void> {
		Guards.object<ILogEntry>(FileLoggingConnector.CLASS_NAME, nameof(logEntry), logEntry);
		Guards.arrayOneOf(
			FileLoggingConnector.CLASS_NAME,
			nameof(logEntry.level),
			logEntry.level,
			Object.values(LogLevel)
		);
		Guards.string(FileLoggingConnector.CLASS_NAME, nameof(logEntry.source), logEntry.source);
		Guards.string(FileLoggingConnector.CLASS_NAME, nameof(logEntry.message), logEntry.message);

		if (!this._levels.includes(logEntry.level)) {
			return;
		}

		const contextIds = (await ContextIdStore.getContextIds()) ?? {};
		const line = `${JSON.stringify(this.toRecord(logEntry, contextIds))}\n`;
		const lineBytes = Buffer.byteLength(line, "utf8");

		const locked = await Mutex.lock(this._mutexKey, {
			throwOnTimeout: true,
			timeoutMs: this._mutexTimeoutMs
		});
		if (locked) {
			try {
				await this.ensureOpen();

				if (
					this._maxFileSizeBytes > 0 &&
					this._currentSize > 0 &&
					this._currentSize + lineBytes > this._maxFileSizeBytes
				) {
					await this.rotate();
				}

				// Read after any rotation, which reopens the handle for the fresh active file.
				const handle = this._handle;
				if (!Is.empty(handle)) {
					await handle.write(line, null, "utf8");
					this._currentSize += lineBytes;
				}
			} finally {
				Mutex.unlock(this._mutexKey);
			}
		}
	}

	/**
	 * Build the plain record written to disk from a log entry, defaulting the timestamp to the
	 * current time as an ISO string and flattening any error into a serialisable form. The node
	 * and tenant of the supplied context are included when set.
	 * @param logEntry The entry being logged.
	 * @param contextIds The context IDs the entry was logged under.
	 * @returns The record to serialise as a single JSON line.
	 * @internal
	 */
	private toRecord(logEntry: ILogEntry, contextIds: IContextIds): { [key: string]: unknown } {
		const node = contextIds[ContextIdKeys.Node];
		const tenant = contextIds[ContextIdKeys.Tenant];

		return {
			level: logEntry.level,
			source: logEntry.source,
			timestamp: new Date(logEntry.ts ?? Date.now()).toISOString(),
			node: Is.stringValue(node) ? node : undefined,
			tenant: Is.stringValue(tenant) ? tenant : undefined,
			message: logEntry.message,
			data: logEntry.data,
			error: Is.object<IError>(logEntry.error) ? BaseError.flatten(logEntry.error) : undefined
		};
	}

	/**
	 * Ensure the target directory exists, the tracked size matches the active file on disk and
	 * the file handle is open.
	 * @returns A promise that resolves once the handle is open.
	 * @internal
	 */
	private async ensureOpen(): Promise<void> {
		if (Is.empty(this._handle)) {
			await mkdir(this._directory, { recursive: true });
			this._currentSize = await this.fileSize(this.activePath());
			this._handle = await open(this.activePath(), "a");
		}
	}

	/**
	 * Close the active file handle if it is open.
	 * @returns A promise that resolves once the handle has been closed.
	 * @internal
	 */
	private async closeHandle(): Promise<void> {
		const handle = this._handle;
		if (!Is.empty(handle)) {
			this._handle = undefined;
			await handle.close();
		}
	}

	/**
	 * Rotate the active file by closing the handle, shifting the numbered files up, discarding
	 * any beyond the retained file limit, then reopening a fresh active file. When no rotated
	 * files are retained the active file is removed.
	 * @returns A promise that resolves once rotation has completed.
	 * @internal
	 */
	private async rotate(): Promise<void> {
		await this.closeHandle();

		const active = this.activePath();

		if (this._maxRetainedFiles <= 0) {
			await rm(active, { force: true });
		} else {
			await rm(this.rotatedPath(this._maxRetainedFiles), { force: true });

			for (let index = this._maxRetainedFiles - 1; index >= 1; index--) {
				const from = this.rotatedPath(index);
				if (await this.fileExists(from)) {
					await rename(from, this.rotatedPath(index + 1));
				}
			}

			await rename(active, this.rotatedPath(1));
		}

		await this.ensureOpen();
		this._currentSize = 0;
	}

	/**
	 * The path to the active log file.
	 * @returns The path to the active file.
	 * @internal
	 */
	private activePath(): string {
		return path.join(this._directory, this._filename);
	}

	/**
	 * The path to a numbered rotated log file.
	 * @param index The rotation index.
	 * @returns The path to the rotated file, inserting the index before the file extension.
	 * @internal
	 */
	private rotatedPath(index: number): string {
		const parsed = path.parse(this._filename);
		return path.join(this._directory, `${parsed.name}.${index}${parsed.ext}`);
	}

	/**
	 * Get the size in bytes of a file, returning 0 when it does not exist.
	 * @param filePath The path to the file.
	 * @returns The size of the file in bytes, or 0 if it does not exist.
	 * @internal
	 */
	private async fileSize(filePath: string): Promise<number> {
		try {
			const stats = await stat(filePath);
			return stats.size;
		} catch {
			return 0;
		}
	}

	/**
	 * Determine whether a file exists.
	 * @param filePath The path to the file.
	 * @returns True if the file exists.
	 * @internal
	 */
	private async fileExists(filePath: string): Promise<boolean> {
		try {
			await stat(filePath);
			return true;
		} catch {
			return false;
		}
	}
}
