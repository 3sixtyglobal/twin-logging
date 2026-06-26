// Copyright 2026 IOTA Stiftung.
// SPDX-License-Identifier: Apache-2.0.
import { type LogRecord, SeverityNumber } from "@opentelemetry/api-logs";
import { LoggerProvider } from "@opentelemetry/sdk-logs";
import { LogLevel } from "@twin.org/logging-models";
import { OpenTelemetryLoggingConnector } from "../src/openTelemetryLoggingConnector.js";

/**
 * Records captured from the OTEL logger between tests.
 */
let emitted: LogRecord[];

/**
 * Replace the LoggerProvider's getLogger with a stub that captures emitted records,
 * so the ILogEntry -> LogRecord mapping can be asserted without any exporter or network.
 */
beforeEach(() => {
	emitted = [];
	vi.spyOn(LoggerProvider.prototype, "getLogger").mockReturnValue({
		emit: (logRecord: LogRecord): void => {
			emitted.push(logRecord);
		},
		enabled: (): boolean => true
	});
});

afterEach(() => {
	vi.restoreAllMocks();
});

/**
 * Create a connector with no exporters (no-op provider) and start it.
 * @param config Optional additional config merged with the empty exporters map.
 * @returns A started connector instance.
 */
async function makeConnector(
	config: { [key: string]: unknown } = {}
): Promise<OpenTelemetryLoggingConnector> {
	const connector = new OpenTelemetryLoggingConnector({
		config: { exporters: {}, ...config }
	});
	await connector.start();
	return connector;
}

describe("OpenTelemetryLoggingConnector", () => {
	test("can construct", async () => {
		const connector = new OpenTelemetryLoggingConnector();
		expect(connector).toBeDefined();
		expect(connector.className()).toEqual("OpenTelemetryLoggingConnector");
	});

	test("can start and stop", async () => {
		const connector = new OpenTelemetryLoggingConnector({ config: { exporters: {} } });
		await expect(connector.start()).resolves.toBeUndefined();
		await expect(connector.stop()).resolves.toBeUndefined();
	});

	test("start is idempotent", async () => {
		const connector = await makeConnector();
		await expect(connector.start()).resolves.toBeUndefined();
		await connector.stop();
	});

	test("stop without start is a no-op", async () => {
		const connector = new OpenTelemetryLoggingConnector({ config: { exporters: {} } });
		await expect(connector.stop()).resolves.toBeUndefined();
	});

	test("can fail to start with an unknown exporter type", async () => {
		const connector = new OpenTelemetryLoggingConnector({
			config: { exporters: { bad: { type: "type1" } } } as never
		});
		await expect(connector.start()).rejects.toMatchObject({
			name: "GeneralError",
			message: "openTelemetryLoggingConnector.unknownExporterType"
		});
	});

	test("can start with an OTLP exporter and stop", async () => {
		const connector = new OpenTelemetryLoggingConnector({
			config: {
				exporters: {
					collector: { type: "otlp", endpoint: "http://localhost:4318/v1/logs" }
				}
			}
		});
		await expect(connector.start()).resolves.toBeUndefined();
		await expect(connector.stop()).resolves.toBeUndefined();
	});

	test("can start with an OTLP exporter using the simple processor", async () => {
		const connector = new OpenTelemetryLoggingConnector({
			config: {
				exporters: {
					collector: {
						type: "otlp",
						endpoint: "http://localhost:4318/v1/logs",
						processor: "simple"
					}
				}
			}
		});
		await expect(connector.start()).resolves.toBeUndefined();
		await expect(connector.stop()).resolves.toBeUndefined();
	});

	test("can fail to start with an OTLP exporter that has no endpoint", async () => {
		const connector = new OpenTelemetryLoggingConnector({
			config: { exporters: { collector: { type: "otlp" } } } as never
		});
		await expect(connector.start()).rejects.toMatchObject({
			name: "GuardError",
			properties: { property: "config.endpoint" }
		});
	});

	test("does not emit before start", async () => {
		const connector = new OpenTelemetryLoggingConnector({ config: { exporters: {} } });
		await connector.log({ level: "info", source: "Test", message: "hello" });
		expect(emitted).toHaveLength(0);
	});

	test("does not emit after stop", async () => {
		const connector = await makeConnector();
		await connector.stop();
		await connector.log({ level: "info", source: "Test", message: "hello" });
		expect(emitted).toHaveLength(0);
	});

	test("emits a record with mapped body, severity and timestamp", async () => {
		const connector = await makeConnector();
		await connector.log({ level: "info", source: "MySource", message: "hello", ts: 1700000000000 });

		expect(emitted).toHaveLength(1);
		expect(emitted[0].body).toEqual("hello");
		expect(emitted[0].severityNumber).toEqual(SeverityNumber.INFO);
		expect(emitted[0].severityText).toEqual("INFO");
		expect(emitted[0].timestamp).toEqual(1700000000000);
		expect(emitted[0].attributes?.source).toEqual("MySource");
		await connector.stop();
	});

	test("maps each log level to the correct severity", async () => {
		const connector = await makeConnector();
		const expectedSeverity: { [level in LogLevel]: SeverityNumber } = {
			trace: SeverityNumber.TRACE,
			debug: SeverityNumber.DEBUG,
			info: SeverityNumber.INFO,
			warn: SeverityNumber.WARN,
			error: SeverityNumber.ERROR
		};

		for (const level of Object.values(LogLevel)) {
			await connector.log({ level, source: "Test", message: level });
		}

		expect(emitted).toHaveLength(Object.values(LogLevel).length);
		for (const record of emitted) {
			expect(record.severityNumber).toEqual(expectedSeverity[record.body as LogLevel]);
			expect(record.severityText).toEqual((record.body as string).toUpperCase());
		}
		await connector.stop();
	});

	test("filters out levels that are not configured", async () => {
		const connector = await makeConnector({ levels: [LogLevel.Error] });
		await connector.log({ level: "info", source: "Test", message: "dropped" });
		await connector.log({ level: "error", source: "Test", message: "kept" });

		expect(emitted).toHaveLength(1);
		expect(emitted[0].body).toEqual("kept");
		await connector.stop();
	});

	test("forwards primitives natively and serialises non-primitive data", async () => {
		const connector = await makeConnector();
		await connector.log({
			level: "info",
			source: "Test",
			message: "data",
			data: {
				route: "/api/health",
				statusCode: 200,
				success: true,
				tags: ["a", "b"],
				codes: [200, 404],
				nested: { dropped: false },
				mixed: [1, "two"]
			}
		});

		const attributes = emitted[0].attributes ?? {};
		expect(attributes.route).toEqual("/api/health");
		expect(attributes.statusCode).toEqual(200);
		expect(attributes.success).toEqual(true);
		expect(attributes.tags).toEqual(["a", "b"]);
		expect(attributes.codes).toEqual([200, 404]);
		expect(attributes.nested).toEqual(JSON.stringify({ dropped: false }));
		expect(attributes.mixed).toEqual(JSON.stringify([1, "two"]));
		await connector.stop();
	});

	test("source attribute is not clobbered by a colliding data key", async () => {
		const connector = await makeConnector();
		await connector.log({
			level: "info",
			source: "RealSource",
			message: "collision",
			data: { source: "fakeSource" }
		});

		expect(emitted[0].attributes?.source).toEqual("RealSource");
		await connector.stop();
	});

	test("maps an error to exception attributes", async () => {
		const connector = await makeConnector();
		await connector.log({
			level: "error",
			source: "Test",
			message: "boom",
			error: {
				name: "GeneralError",
				message: "something.failed",
				stack: "    at doWork (worker.js:10:5)"
			}
		});

		const attributes = emitted[0].attributes ?? {};
		expect(attributes["exception.type"]).toEqual("GeneralError");
		expect(attributes["exception.message"]).toEqual("something.failed");
		expect(attributes["exception.stacktrace"]).toEqual(
			"GeneralError: something.failed\n    at doWork (worker.js:10:5)"
		);
		await connector.stop();
	});

	test("keeps inner cause name and message when the inner stack is absent", async () => {
		const connector = await makeConnector();
		await connector.log({
			level: "error",
			source: "Test",
			message: "boom",
			error: {
				name: "GeneralError",
				message: "outer.failed",
				stack: "    at outer (a.js:1:1)",
				cause: {
					name: "RootError",
					message: "root.cause"
				}
			}
		});

		expect(emitted[0].attributes?.["exception.stacktrace"]).toEqual(
			"GeneralError: outer.failed\n    at outer (a.js:1:1)\nCaused by: RootError: root.cause"
		);
		await connector.stop();
	});

	test("preserves the full error cause chain in the stacktrace", async () => {
		const connector = await makeConnector();
		await connector.log({
			level: "error",
			source: "Test",
			message: "boom",
			error: {
				name: "GeneralError",
				message: "outer.failed",
				stack: "    at outer (a.js:1:1)",
				cause: {
					name: "RootError",
					message: "root.cause",
					stack: "    at root (b.js:2:2)"
				}
			}
		});

		const attributes = emitted[0].attributes ?? {};
		expect(attributes["exception.type"]).toEqual("GeneralError");
		expect(attributes["exception.message"]).toEqual("outer.failed");
		expect(attributes["exception.stacktrace"]).toEqual(
			"GeneralError: outer.failed\n    at outer (a.js:1:1)\nCaused by: RootError: root.cause\n    at root (b.js:2:2)"
		);
		await connector.stop();
	});

	test("defaults the timestamp when none is provided", async () => {
		const connector = await makeConnector();
		const before = Date.now();
		await connector.log({ level: "info", source: "Test", message: "no-ts" });
		const after = Date.now();

		const ts = emitted[0].timestamp as number;
		expect(ts).toBeGreaterThanOrEqual(before);
		expect(ts).toBeLessThanOrEqual(after);
		await connector.stop();
	});
});
