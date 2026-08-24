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
import { ContextIdKeys, ContextIdStore, type IContextIds } from "@twin.org/context";
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
import { OpenTelemetryProcessorTypes } from "./models/openTelemetryProcessorTypes.js";

/**
 * Class for performing logging operations using OpenTelemetry.
 */
export class OpenTelemetryLoggingConnector implements ILoggingConnector {
	/**
	 * The namespace for the logging connector.
	 */
	public static readonly NAMESPACE: string = "open-telemetry";

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
	 * Per-context-key Logger instances, created lazily on the first log() call in each context.
	 * @internal
	 */
	private _loggers: { [key: string]: Logger };

	/**
	 * All LoggerProvider instances created, tracked so stop() can shut them all down.
	 * @internal
	 */
	private _providers: LoggerProvider[];

	/**
	 * True between start() and stop().
	 * @internal
	 */
	private _started: boolean;

	/**
	 * Create a new instance of OpenTelemetryLoggingConnector.
	 * @param options The options for the logging connector.
	 */
	constructor(options?: IOpenTelemetryLoggingConnectorConstructorOptions) {
		this._config = options?.config ?? {};
		this._levels = this._config.levels ?? Object.values(LogLevel);
		this._loggers = {};
		this._providers = [];
		this._started = false;

		for (const [, config] of Object.entries(this._config.exporters ?? {})) {
			if (!Is.undefined(config.processor)) {
				Guards.arrayOneOf(
					OpenTelemetryLoggingConnector.CLASS_NAME,
					nameof(config.processor),
					config.processor,
					Object.values(OpenTelemetryProcessorTypes)
				);
			}
		}
	}

	/**
	 * Returns the class name of the component.
	 * @returns The class name of the component.
	 */
	public className(): string {
		return OpenTelemetryLoggingConnector.CLASS_NAME;
	}

	/**
	 * Validate the configured exporters and mark the connector as running.
	 * LoggerProvider instances are created lazily on the first log() call per tenant context.
	 * Calling start() on a connector that has already been started is a no-op.
	 * @param nodeLoggingComponentType The node logging component type.
	 * @returns A promise that resolves when the connector is ready to receive log entries.
	 */
	public async start(nodeLoggingComponentType?: string): Promise<void> {
		if (this._started) {
			return;
		}

		// Validate exporter configs up-front so callers get a synchronous throw during startup
		// rather than on the first log() call.
		for (const [, config] of Object.entries(this._config.exporters ?? {})) {
			if (config.type === OpenTelemetryExporterTypes.Otlp) {
				Guards.stringValue(
					OpenTelemetryLoggingConnector.CLASS_NAME,
					nameof(config.endpoint),
					config.endpoint
				);
			} else {
				throw new GeneralError(OpenTelemetryLoggingConnector.CLASS_NAME, "unknownExporterType", {
					type: (config as { type: string }).type
				});
			}
		}

		this._started = true;

		const nodeLogging = ComponentFactory.getIfExists<ILoggingComponent>(nodeLoggingComponentType);
		await nodeLogging?.log({
			source: OpenTelemetryLoggingConnector.CLASS_NAME,
			message: "connectorStarted",
			level: "info",
			data: { exporterCount: Object.keys(this._config.exporters ?? {}).length }
		});
	}

	/**
	 * Shut down all LoggerProvider instances and release resources.
	 * Each provider flushes its buffered records before tearing down.
	 * Calling stop() on a connector that has not been started is a no-op.
	 * @param nodeLoggingComponentType The node logging component type.
	 * @returns A promise that resolves when all LoggerProviders have shut down.
	 */
	public async stop(nodeLoggingComponentType?: string): Promise<void> {
		if (this._started) {
			await Promise.all(this._providers.map(async p => p.shutdown()));
			this._providers = [];
			this._loggers = {};
			this._started = false;

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
	 * The current ContextIdStore context is read on every call. A dedicated Logger backed by a
	 * LoggerProvider whose Resource carries the context IDs (tenant, node, etc.) is resolved or
	 * created for that context, ensuring every emitted OTel log record is stamped with the
	 * correct tenant attributes automatically.
	 * @param logEntry The entry to log.
	 * @returns A promise that resolves when the entry has been emitted.
	 */
	public async log(logEntry: ILogEntry): Promise<void> {
		Guards.object<ILogEntry>(OpenTelemetryLoggingConnector.CLASS_NAME, nameof(logEntry), logEntry);

		if (!this._levels.includes(logEntry.level) || !this._started) {
			return;
		}

		const contextIds = (await ContextIdStore.getContextIds()) ?? {};
		const logger = this.getOrCreateLogger(contextIds);

		logger.emit({
			timestamp: logEntry.ts ?? Date.now(),
			severityNumber:
				OpenTelemetryLoggingConnector._SEVERITY[logEntry.level] ?? SeverityNumber.UNSPECIFIED,
			severityText: logEntry.level.toUpperCase(),
			body: logEntry.message,
			attributes: this.toAttributes(logEntry)
		});
	}

	/**
	 * Returns the cached Logger for the given context, creating a dedicated LoggerProvider if
	 * this context has not been seen before.  Each unique context key gets its own provider
	 * so that per-tenant resource attributes are stamped onto every record automatically by
	 * the OTel SDK rather than being injected per-record.
	 * @param contextIds The current execution context IDs.
	 * @returns The Logger for this context.
	 * @internal
	 */
	private getOrCreateLogger(contextIds: IContextIds): Logger {
		const node = contextIds[ContextIdKeys.Node];
		const tenant = contextIds[ContextIdKeys.Tenant];

		const key = `${node ?? ""}/${tenant ?? ""}`;

		const cached = this._loggers[key];
		if (!Is.undefined(cached)) {
			return cached;
		}

		const scopedContextIds: { [key: string]: string } = {};
		const resourcePrefix = "service";
		if (Is.stringValue(node)) {
			scopedContextIds[`${resourcePrefix}.instance.id`] = node;
		}
		if (Is.stringValue(tenant)) {
			scopedContextIds[`${resourcePrefix}.namespace`] = tenant;
		}
		const resourceAttrs = { ...this._config.resourceAttributes, ...scopedContextIds };
		const resource = Is.empty(resourceAttrs) ? undefined : resourceFromAttributes(resourceAttrs);

		const provider = new LoggerProvider({ processors: this.buildProcessors(), resource });
		this._providers.push(provider);

		const logger = provider.getLogger(
			this._config.loggerName ?? "twin-logging",
			this._config.loggerVersion ?? "1.0.0"
		);
		this._loggers[key] = logger;
		return logger;
	}

	/**
	 * Builds a fresh set of log record processors from the configured exporters.
	 * Each LoggerProvider receives its own processor instances so that providers can
	 * be shut down independently.
	 * @returns An array of processors.
	 * @internal
	 */
	private buildProcessors(): LogRecordProcessor[] {
		const processors: LogRecordProcessor[] = [];
		for (const [, config] of Object.entries(this._config.exporters ?? {})) {
			if (config.type === OpenTelemetryExporterTypes.Otlp) {
				const exporter = new OTLPLogExporter({
					url: config.endpoint,
					headers: config.headers,
					concurrencyLimit: config.concurrencyLimit,
					timeoutMillis: config.timeoutMs
				});

				if (config.processor === OpenTelemetryProcessorTypes.Simple) {
					processors.push(new SimpleLogRecordProcessor({ exporter }));
				} else {
					processors.push(
						new BatchLogRecordProcessor({
							exporter,
							scheduledDelayMillis: config.scheduledDelayMs,
							maxExportBatchSize: config.maxExportBatchSize,
							maxQueueSize: config.maxQueueSize,
							exportTimeoutMillis: config.exportTimeoutMs
						})
					);
				}
			}
		}
		return processors;
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
				} else if (Is.arrayValue(val)) {
					if (Is.string(val[0]) && val.every(el => Is.string(el))) {
						attributes[key] = val;
					} else if (Is.number(val[0]) && val.every(el => Is.number(el))) {
						attributes[key] = val;
					} else if (Is.boolean(val[0]) && val.every(el => Is.boolean(el))) {
						attributes[key] = val;
					} else {
						attributes[key] = JSON.stringify(val);
					}
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
