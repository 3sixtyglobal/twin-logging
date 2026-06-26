// Copyright 2026 IOTA Stiftung.
// SPDX-License-Identifier: Apache-2.0.
import { type LogAttributes, type Logger, SeverityNumber } from "@opentelemetry/api-logs";
import { OTLPLogExporter } from "@opentelemetry/exporter-logs-otlp-http";
import { resourceFromAttributes } from "@opentelemetry/resources";
import {
	BatchLogRecordProcessor,
	LoggerProvider,
	type LogRecordProcessor,
	SimpleLogRecordProcessor
} from "@opentelemetry/sdk-logs";
import {
	ATTR_EXCEPTION_MESSAGE,
	ATTR_EXCEPTION_STACKTRACE,
	ATTR_EXCEPTION_TYPE
} from "@opentelemetry/semantic-conventions";
import { BaseError, ComponentFactory, GeneralError, Guards, type IError, Is } from "@twin.org/core";
import {
	type ILogEntry,
	type ILoggingComponent,
	type ILoggingConnector,
	LogLevel
} from "@twin.org/logging-models";
import { nameof } from "@twin.org/nameof";
import type { IOpenTelemetryLoggingConnectorConfig } from "./models/IOpenTelemetryLoggingConnectorConfig.js";
import type { IOpenTelemetryLoggingConnectorConstructorOptions } from "./models/IOpenTelemetryLoggingConnectorConstructorOptions.js";
import { OpenTelemetryExporterTypes } from "./models/openTelemetryExporterTypes.js";

/**
 * Class for performing logging operations using OpenTelemetry.
 */
export class OpenTelemetryLoggingConnector implements ILoggingConnector {
	/**
	 * The namespace for the logging connector.
	 */
	public static readonly NAMESPACE: string = "opentelemetry";

	/**
	 * Runtime name for the class.
	 */
	public static readonly CLASS_NAME: string = nameof<OpenTelemetryLoggingConnector>();

	/**
	 * Maps a TWIN log level to an OpenTelemetry severity number.
	 * @internal
	 */
	private static readonly _SEVERITY: { [level in LogLevel]: SeverityNumber } = {
		trace: SeverityNumber.TRACE,
		debug: SeverityNumber.DEBUG,
		info: SeverityNumber.INFO,
		warn: SeverityNumber.WARN,
		error: SeverityNumber.ERROR
	};

	/**
	 * Config options, stored so start() can initialise the LoggerProvider.
	 * @internal
	 */
	private readonly _config: IOpenTelemetryLoggingConnectorConfig;

	/**
	 * The log levels to forward, will default to all.
	 * @internal
	 */
	private readonly _levels: LogLevel[];

	/**
	 * The LoggerProvider that owns the exporters. Set by start(), cleared by stop().
	 * @internal
	 */
	private _loggerProvider?: LoggerProvider;

	/**
	 * The Logger used to emit records. Set by start(), cleared by stop().
	 * @internal
	 */
	private _logger?: Logger;

	/**
	 * Create a new instance of OpenTelemetryLoggingConnector.
	 * @param options The options for the logging connector.
	 */
	constructor(options?: IOpenTelemetryLoggingConnectorConstructorOptions) {
		this._config = options?.config ?? {};
		this._levels = this._config.levels ?? Object.values(LogLevel);
	}

	/**
	 * Returns the class name of the component.
	 * @returns The class name of the component.
	 */
	public className(): string {
		return OpenTelemetryLoggingConnector.CLASS_NAME;
	}

	/**
	 * Initialise the LoggerProvider and configured exporters.
	 * Calling start() on a connector that has already been started is a no-op.
	 * @param nodeLoggingComponentType The node logging component type.
	 * @returns A promise that resolves when the LoggerProvider is running.
	 */
	public async start(nodeLoggingComponentType?: string): Promise<void> {
		if (!Is.undefined(this._loggerProvider)) {
			return;
		}

		const processors: LogRecordProcessor[] = [];
		for (const [, config] of Object.entries(this._config.exporters ?? {})) {
			if (config.type === OpenTelemetryExporterTypes.Otlp) {
				Guards.stringValue(
					OpenTelemetryLoggingConnector.CLASS_NAME,
					nameof(config.endpoint),
					config.endpoint
				);

				const exporter = new OTLPLogExporter({
					url: config.endpoint,
					headers: config.headers,
					concurrencyLimit: config.concurrencyLimit,
					timeoutMillis: config.timeoutMs
				});

				if (config.processor === "simple") {
					processors.push(new SimpleLogRecordProcessor(exporter));
				} else {
					processors.push(
						new BatchLogRecordProcessor(exporter, {
							scheduledDelayMillis: config.scheduledDelayMs,
							maxExportBatchSize: config.maxExportBatchSize,
							maxQueueSize: config.maxQueueSize,
							exportTimeoutMillis: config.exportTimeoutMs
						})
					);
				}
			} else {
				throw new GeneralError(OpenTelemetryLoggingConnector.CLASS_NAME, "unknownExporterType", {
					type: (config as { type: string }).type
				});
			}
		}

		const resource = Is.empty(this._config.resourceAttributes)
			? undefined
			: resourceFromAttributes(this._config.resourceAttributes);

		this._loggerProvider = new LoggerProvider({ processors, resource });
		this._logger = this._loggerProvider.getLogger(
			this._config.loggerName ?? "twin-logging",
			this._config.loggerVersion ?? "1.0.0"
		);

		const nodeLogging = ComponentFactory.getIfExists<ILoggingComponent>(nodeLoggingComponentType);
		await nodeLogging?.log({
			source: OpenTelemetryLoggingConnector.CLASS_NAME,
			message: "connectorStarted",
			level: "info",
			data: { exporterCount: Object.keys(this._config.exporters ?? {}).length }
		});
	}

	/**
	 * Shut down the LoggerProvider and release resources.
	 * shutdown() flushes any buffered records before tearing down, so records held by a
	 * batch processor are exported before the process exits.
	 * Calling stop() on a connector that has not been started is a no-op.
	 * @param nodeLoggingComponentType The node logging component type.
	 * @returns A promise that resolves when the LoggerProvider has shut down.
	 */
	public async stop(nodeLoggingComponentType?: string): Promise<void> {
		if (!Is.undefined(this._loggerProvider)) {
			await this._loggerProvider.shutdown();
			this._loggerProvider = undefined;
			this._logger = undefined;

			const nodeLogging = ComponentFactory.getIfExists<ILoggingComponent>(nodeLoggingComponentType);
			await nodeLogging?.log({
				source: OpenTelemetryLoggingConnector.CLASS_NAME,
				message: "connectorStopped",
				level: "info",
				data: {}
			});
		}
	}

	/**
	 * Log an entry to the connector.
	 * The entry is mapped to an OpenTelemetry LogRecord and emitted to the LoggerProvider,
	 * which buffers and exports it via the configured exporters. Entries whose level is not
	 * in the configured levels are skipped, as are entries received before start() (or after
	 * stop()) since there is no provider to forward them to.
	 * @param logEntry The entry to log.
	 * @returns A promise that resolves when the entry has been emitted.
	 */
	public async log(logEntry: ILogEntry): Promise<void> {
		Guards.object<ILogEntry>(OpenTelemetryLoggingConnector.CLASS_NAME, nameof(logEntry), logEntry);

		if (!this._levels.includes(logEntry.level) || Is.undefined(this._logger)) {
			return;
		}

		this._logger.emit({
			timestamp: logEntry.ts ?? Date.now(),
			severityNumber:
				OpenTelemetryLoggingConnector._SEVERITY[logEntry.level] ?? SeverityNumber.UNSPECIFIED,
			severityText: logEntry.level.toUpperCase(),
			body: logEntry.message,
			attributes: this.toAttributes(logEntry)
		});
	}

	/**
	 * Build the OTEL attributes for a log entry from its source, custom data and error.
	 * Scalar data values (string, number, boolean) and uniform primitive arrays are forwarded
	 * as-is; other values are JSON serialised into a string, since OTEL attributes only accept primitives. The error,
	 * when present, is mapped to the exception.* semantic-convention attributes.
	 * @param logEntry The entry being logged.
	 * @returns An OTEL attributes object.
	 * @internal
	 */
	private toAttributes(logEntry: ILogEntry): LogAttributes {
		const attributes: LogAttributes = {};

		if (!Is.empty(logEntry.data)) {
			for (const [key, val] of Object.entries(logEntry.data)) {
				if (Is.string(val) || Is.number(val) || Is.boolean(val)) {
					attributes[key] = val;
				} else if (
					Is.arrayValue(val) &&
					(Is.string(val[0]) || Is.number(val[0]) || Is.boolean(val[0])) &&
					val.every(el => typeof el === typeof val[0])
				) {
					attributes[key] = val as string[] | number[] | boolean[];
				} else if (!Is.undefined(val)) {
					attributes[key] = JSON.stringify(val);
				}
			}
		}

		attributes.source = logEntry.source;

		if (Is.object<IError>(logEntry.error)) {
			const flattened = BaseError.flatten(logEntry.error);
			const top = flattened[0];
			attributes[ATTR_EXCEPTION_TYPE] = top.name;
			attributes[ATTR_EXCEPTION_MESSAGE] = top.message;

			const stacktrace = flattened
				.map(err => {
					const header = `${err.name}: ${err.message}`;
					return Is.stringValue(err.stack) ? `${header}\n${err.stack}` : header;
				})
				.join("\nCaused by: ");
			if (Is.stringValue(stacktrace)) {
				attributes[ATTR_EXCEPTION_STACKTRACE] = stacktrace;
			}
		}

		return attributes;
	}
}
