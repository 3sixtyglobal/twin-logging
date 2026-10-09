// Copyright 2026 IOTA Stiftung.
// SPDX-License-Identifier: Apache-2.0.
import { ContextIdKeys, ContextIdStore } from "@3sixty/context";
import { GuardError } from "@3sixty/core";
import { LogLevel } from "@3sixty/logging-models";
import { type LogRecord, SeverityNumber } from "@opentelemetry/api-logs";
import * as opentelemetryResources from "@opentelemetry/resources";
import { LoggerProvider } from "@opentelemetry/sdk-logs";
import { TEST_OTLP_ENDPOINT_LOGS, TEST_OTLP_GRAFANA } from "./setupTestEnv.js";
import { OpenTelemetryLoggingConnector } from "../src/openTelemetryLoggingConnector.js";

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
	let emitted: LogRecord[];

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

	test("can fail to construct with an unknown processor type", () => {
		expect(
			() =>
				new OpenTelemetryLoggingConnector({
					config: {
						exporters: {
							collector: {
								type: "otlp",
								endpoint: TEST_OTLP_ENDPOINT_LOGS,
								processor: "unknown" as never
							}
						}
					}
				})
		).toThrow("guard.arrayOneOf");
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
					collector: { type: "otlp", endpoint: TEST_OTLP_ENDPOINT_LOGS }
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
						endpoint: TEST_OTLP_ENDPOINT_LOGS,
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

	test("creates a separate provider for each unique tenant context", async () => {
		const connector = await makeConnector();

		await ContextIdStore.run({ [ContextIdKeys.Tenant]: "tenant-a" }, async () =>
			connector.log({ level: "info", source: "Test", message: "from-a" })
		);
		await ContextIdStore.run({ [ContextIdKeys.Tenant]: "tenant-b" }, async () =>
			connector.log({ level: "info", source: "Test", message: "from-b" })
		);

		// One provider per unique context → getLogger called once per context.
		expect(LoggerProvider.prototype.getLogger).toHaveBeenCalledTimes(2);
		expect(emitted).toHaveLength(2);
		await connector.stop();
	});

	test("reuses the same logger for repeated calls within the same tenant context", async () => {
		const connector = await makeConnector();

		await ContextIdStore.run({ [ContextIdKeys.Tenant]: "tenant-a" }, async () => {
			await connector.log({ level: "info", source: "Test", message: "first" });
			await connector.log({ level: "info", source: "Test", message: "second" });
		});

		// Same context → same provider → getLogger called only once.
		expect(LoggerProvider.prototype.getLogger).toHaveBeenCalledTimes(1);
		expect(emitted).toHaveLength(2);
		await connector.stop();
	});

	test("maps tenant and node context IDs to semantic service resource attributes", async () => {
		const resourceSpy = vi.spyOn(opentelemetryResources, "resourceFromAttributes");
		const connector = await makeConnector({
			resourceAttributes: { "service.name": "my-service" }
		});

		await ContextIdStore.run(
			{ [ContextIdKeys.Tenant]: "tenant-a", [ContextIdKeys.Node]: "node-1" },
			async () => connector.log({ level: "info", source: "Test", message: "hello" })
		);

		expect(resourceSpy).toHaveBeenCalledWith(
			expect.objectContaining({
				"service.name": "my-service",
				"service.namespace": "tenant-a",
				"service.instance.id": "node-1"
			})
		);
		await connector.stop();
	});

	test("emits without error when there is no active context", async () => {
		const connector = await makeConnector();
		// No ContextIdStore.run() wrapper - simulates a background task with no tenant context.
		await connector.log({ level: "info", source: "Test", message: "no-context" });
		expect(emitted).toHaveLength(1);
		await connector.stop();
	});

	describe("log validation", () => {
		test("rejects an entry with no message without emitting a record", async () => {
			const connector = await makeConnector();
			await expect(
				connector.log({ level: LogLevel.Info, source: "Test" } as never)
			).rejects.toMatchObject({
				name: GuardError.CLASS_NAME,
				message: "guard.string",
				properties: { property: "logEntry.message" }
			});
			expect(emitted).toHaveLength(0);
			await connector.stop();
		});

		test("rejects an entry with a non-string source", async () => {
			const connector = await makeConnector();
			await expect(
				connector.log({ level: LogLevel.Info, source: 42, message: "hello" } as never)
			).rejects.toMatchObject({
				name: GuardError.CLASS_NAME,
				message: "guard.string",
				properties: { property: "logEntry.source" }
			});
			expect(emitted).toHaveLength(0);
			await connector.stop();
		});

		test("rejects an entry with an unknown level", async () => {
			const connector = await makeConnector();
			await expect(
				connector.log({ level: "critical", source: "Test", message: "hello" } as never)
			).rejects.toMatchObject({
				name: GuardError.CLASS_NAME,
				message: "guard.arrayOneOf",
				properties: { property: "logEntry.level" }
			});
			expect(emitted).toHaveLength(0);
			await connector.stop();
		});
	});
});

describe("OpenTelemetryLoggingConnector (live OTLP)", () => {
	const SERVICE_NAME = "otel-connector-integration-test";
	const LOKI_TIMEOUT_MS = 15_000;

	function liveConnector(): OpenTelemetryLoggingConnector {
		return new OpenTelemetryLoggingConnector({
			config: {
				exporters: { collector: { type: "otlp", endpoint: TEST_OTLP_ENDPOINT_LOGS } },
				resourceAttributes: { "service.name": SERVICE_NAME }
			}
		});
	}

	async function findInLoki(message: string): Promise<boolean> {
		const query = `{service_name="${SERVICE_NAME}"} |= "${message}"`;
		const deadline = Date.now() + LOKI_TIMEOUT_MS;
		do {
			const nowMs = Date.now();
			const url = new URL(
				`${TEST_OTLP_GRAFANA}/api/datasources/proxy/uid/loki/loki/api/v1/query_range`
			);
			url.searchParams.set("query", query);
			url.searchParams.set("start", `${nowMs - 60_000}000000`);
			url.searchParams.set("end", `${nowMs}000000`);
			url.searchParams.set("limit", "1");
			const resp = await fetch(url.toString(), {
				headers: { Authorization: `Basic ${btoa("admin:admin")}` }
			}).catch(() => null);
			if (resp?.ok) {
				const body = (await resp.json()) as { data?: { result?: { values?: unknown[] }[] } };
				if (body.data?.result?.some(s => (s.values?.length ?? 0) > 0)) {
					return true;
				}
			}
			await new Promise<void>(resolve => setTimeout(resolve, 500));
		} while (Date.now() < deadline);
		return false;
	}

	test("delivers a log record to Loki via the OTLP endpoint", async () => {
		const message = `live-test-${Date.now()}`;
		const connector = liveConnector();
		await connector.start();
		await connector.log({ level: "info", source: "IntegrationTest", message });
		await connector.stop();
		expect(await findInLoki(message)).toBe(true);
	});

	test("delivers log records with tenant context to Loki", async () => {
		const message = `tenant-test-${Date.now()}`;
		const connector = liveConnector();
		await connector.start();
		await ContextIdStore.run({ [ContextIdKeys.Tenant]: "integration-tenant" }, async () => {
			await connector.log({ level: "info", source: "IntegrationTest", message });
		});
		await connector.stop();
		expect(await findInLoki(message)).toBe(true);
	});

	test("delivers all log levels to Loki", async () => {
		const marker = `all-levels-${Date.now()}`;
		const logLevels = Object.values(LogLevel) as LogLevel[];
		const connector = liveConnector();
		await connector.start();
		for (const level of logLevels) {
			await connector.log({ level, source: "IntegrationTest", message: `${marker}-${level}` });
		}
		await connector.stop();
		for (const level of logLevels) {
			expect(await findInLoki(`${marker}-${level}`)).toBe(true);
		}
	});
});
