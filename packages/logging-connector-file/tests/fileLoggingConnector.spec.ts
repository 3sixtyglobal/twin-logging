// Copyright 2026 IOTA Stiftung.
// SPDX-License-Identifier: Apache-2.0.
import { mkdtemp, readdir, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { ContextIdKeys, ContextIdStore } from "@twin.org/context";
import { GuardError } from "@twin.org/core";
import { LoggingConnectorFactory, LogLevel, MultiLoggingConnector } from "@twin.org/logging-models";
import { FileLoggingConnector } from "../src/fileLoggingConnector.js";

/**
 * Temporary directory created for each test and removed afterwards.
 */
let testDir: string;

/**
 * Connectors created during a test, closed afterwards to release their file handles.
 */
let connectors: FileLoggingConnector[];

/**
 * Create a connector and track it so its handle is closed after the test.
 * @param config The connector configuration.
 * @returns The connector.
 */
function createConnector(
	config: ConstructorParameters<typeof FileLoggingConnector>[0]["config"]
): FileLoggingConnector {
	const connector = new FileLoggingConnector({ config });
	connectors.push(connector);
	return connector;
}

beforeEach(async () => {
	testDir = await mkdtemp(path.join(tmpdir(), "file-logging-connector-"));
	connectors = [];
});

afterEach(async () => {
	for (const connector of connectors) {
		await connector.stop();
	}
	await rm(testDir, { recursive: true, force: true });
});

/**
 * Read a log file and parse the newline delimited JSON entries.
 * @param filename The file name, defaults to app.log.
 * @returns The parsed entries.
 */
async function readEntries(filename: string = "app.log"): Promise<{ [key: string]: unknown }[]> {
	const content = await readFile(path.join(testDir, filename), "utf8");
	return content
		.split("\n")
		.filter(line => line.length > 0)
		.map(line => JSON.parse(line) as { [key: string]: unknown });
}

/**
 * Read every log file in the test directory and return all entries.
 * @returns The parsed entries across all files.
 */
async function readAllEntries(): Promise<{ [key: string]: unknown }[]> {
	const files = await readdir(testDir);
	const all: { [key: string]: unknown }[] = [];
	for (const file of files) {
		all.push(...(await readEntries(file)));
	}
	return all;
}

/**
 * The rotation limit used by the size-based tests, the minimum allowed (100 KB).
 */
const ROTATION_LIMIT_BYTES = 100 * 1024;

/**
 * Build a log entry padded so a couple of them exceed the 100 KB rotation limit.
 * @param message The entry message.
 * @returns A log entry roughly 60 KB in size.
 */
function largeEntry(message: string): {
	level: "info";
	source: string;
	message: string;
	data: { pad: string };
} {
	return { level: "info", source: "Test", message, data: { pad: "x".repeat(60 * 1024) } };
}

describe("FileLoggingConnector", () => {
	test("can construct", () => {
		const connector = createConnector({ directory: testDir });
		expect(connector).toBeDefined();
		expect(connector.className()).toEqual("FileLoggingConnector");
	});

	test("can fail to construct with no directory", () => {
		let error: { name?: string; properties?: { property?: string } } | undefined;
		try {
			// eslint-disable-next-line no-new
			new FileLoggingConnector({ config: {} } as never);
		} catch (err) {
			error = err as { name?: string; properties?: { property?: string } };
		}
		expect(error?.name).toEqual("GuardError");
		expect(error?.properties?.property).toEqual("options.config.directory");
	});

	test("can start and stop", async () => {
		const connector = createConnector({ directory: testDir, mutexTimeoutMs: 2000 });
		await expect(connector.start()).resolves.toBeUndefined();
		await expect(connector.stop()).resolves.toBeUndefined();
	});

	test("stop without start is a no-op", async () => {
		const connector = createConnector({ directory: testDir });
		await expect(connector.stop()).resolves.toBeUndefined();
	});

	test("reopens the active file after a stop", async () => {
		const connector = createConnector({ directory: testDir });
		await connector.log({ level: "info", source: "Test", message: "before-stop" });
		await connector.stop();
		await connector.log({ level: "info", source: "Test", message: "after-stop" });
		await connector.stop();

		const entries = await readEntries();
		expect(entries).toHaveLength(2);
		expect(entries.map(entry => entry.message)).toEqual(["before-stop", "after-stop"]);
	});

	test("can start and create the target directory", async () => {
		const nested = path.join(testDir, "logs", "nested");
		const connector = createConnector({ directory: nested });
		await connector.start();
		await connector.log({ level: "info", source: "Test", message: "hello" });

		const entries = await readEntries(path.join("logs", "nested", "app.log"));
		expect(entries).toHaveLength(1);
	});

	test("writes a single newline delimited JSON entry with mapped fields", async () => {
		const connector = createConnector({ directory: testDir });
		await connector.log({
			level: "info",
			source: "MySource",
			message: "hello",
			ts: 1700000000000,
			data: { port: 8080 }
		});

		const entries = await readEntries();
		expect(entries).toHaveLength(1);
		expect(entries[0]).toEqual({
			level: "info",
			source: "MySource",
			timestamp: new Date(1700000000000).toISOString(),
			message: "hello",
			data: { port: 8080 }
		});
	});

	test("defaults the timestamp to the current time as an ISO string", async () => {
		const connector = createConnector({ directory: testDir });
		const before = Date.now();
		await connector.log({ level: "info", source: "Test", message: "no-ts" });
		const after = Date.now();

		const entries = await readEntries();
		const ts = Date.parse(entries[0].timestamp as string);
		expect(ts).toBeGreaterThanOrEqual(before);
		expect(ts).toBeLessThanOrEqual(after);
	});

	test("filters out levels that are not configured", async () => {
		const connector = createConnector({ directory: testDir, levels: [LogLevel.Error] });
		await connector.log({ level: "info", source: "Test", message: "dropped" });
		await connector.log({ level: "error", source: "Test", message: "kept" });

		const entries = await readEntries();
		expect(entries).toHaveLength(1);
		expect(entries[0].message).toEqual("kept");
	});

	test("flattens an error into the written entry", async () => {
		const connector = createConnector({ directory: testDir });
		await connector.log({
			level: "error",
			source: "Test",
			message: "boom",
			error: { name: "GeneralError", message: "something.failed" }
		});

		const entries = await readEntries();
		const error = entries[0].error as { name: string; message: string }[];
		expect(Array.isArray(error)).toEqual(true);
		expect(error[0].name).toEqual("GeneralError");
		expect(error[0].message).toEqual("something.failed");
	});

	test("stamps the node and tenant of the active context onto the written entry", async () => {
		const connector = createConnector({ directory: testDir });

		await ContextIdStore.run(
			{ [ContextIdKeys.Tenant]: "tenant-a", [ContextIdKeys.Node]: "node-1" },
			async () => connector.log({ level: "info", source: "Test", message: "in-context" })
		);

		const entries = await readEntries();
		expect(entries[0].node).toEqual("node-1");
		expect(entries[0].tenant).toEqual("tenant-a");
	});

	test("attributes each entry to the context it was logged under", async () => {
		const connector = createConnector({ directory: testDir });

		await ContextIdStore.run({ [ContextIdKeys.Tenant]: "tenant-a" }, async () =>
			connector.log({ level: "info", source: "Test", message: "from-a" })
		);
		await ContextIdStore.run({ [ContextIdKeys.Tenant]: "tenant-b" }, async () =>
			connector.log({ level: "info", source: "Test", message: "from-b" })
		);

		const entries = await readEntries();
		expect(entries.map(entry => [entry.message, entry.tenant])).toEqual([
			["from-a", "tenant-a"],
			["from-b", "tenant-b"]
		]);
	});

	test("omits the context fields when there is no active context", async () => {
		const connector = createConnector({ directory: testDir });
		await connector.log({ level: "info", source: "Test", message: "no-context" });

		const entries = await readEntries();
		expect(entries[0]).not.toHaveProperty("node");
		expect(entries[0]).not.toHaveProperty("tenant");
	});

	test("throws when maxFileSizeBytes is a positive value below the minimum", () => {
		expect(
			() => new FileLoggingConnector({ config: { directory: testDir, maxFileSizeBytes: 10 } })
		).toThrow("fileLoggingConnector.maxFileSizeTooSmall");
	});

	test("rotates the active file when the size limit is reached", async () => {
		const connector = createConnector({
			directory: testDir,
			maxFileSizeBytes: ROTATION_LIMIT_BYTES,
			maxRetainedFiles: 5
		});

		await connector.log(largeEntry("first"));
		await connector.log(largeEntry("second"));

		const files = (await readdir(testDir)).sort();
		expect(files).toContain("app.log");
		expect(files).toContain("app.1.log");

		const rotated = await readEntries("app.1.log");
		expect(rotated[0].message).toEqual("first");
		const active = await readEntries("app.log");
		expect(active[0].message).toEqual("second");
	});

	test("enforces the retained-file limit and keeps the newest entries", async () => {
		const connector = createConnector({
			directory: testDir,
			maxFileSizeBytes: ROTATION_LIMIT_BYTES,
			maxRetainedFiles: 2
		});

		for (let i = 0; i < 6; i++) {
			await connector.log(largeEntry(`entry-${i}`));
		}
		await connector.stop();

		// Active file plus at most maxRetainedFiles rotated files.
		const files = (await readdir(testDir)).sort();
		expect(files).toEqual(["app.1.log", "app.2.log", "app.log"]);

		// The newest entry is in the active file, older ones shift up, and the oldest are gone.
		expect((await readEntries("app.log"))[0].message).toEqual("entry-5");
		expect((await readEntries("app.1.log"))[0].message).toEqual("entry-4");
		expect((await readEntries("app.2.log"))[0].message).toEqual("entry-3");
		const survivingMessages = (await readAllEntries()).map(entry => entry.message);
		expect(survivingMessages).not.toContain("entry-0");
	});

	test("discards the active file on rotation when no files are retained", async () => {
		const connector = createConnector({
			directory: testDir,
			maxFileSizeBytes: ROTATION_LIMIT_BYTES,
			maxRetainedFiles: 0
		});

		for (let i = 0; i < 4; i++) {
			await connector.log(largeEntry(`entry-${i}`));
		}
		await connector.stop();

		const files = await readdir(testDir);
		expect(files).toEqual(["app.log"]);
		// Only the newest entry survives; earlier ones were discarded on rotation.
		const entries = await readEntries();
		expect(entries).toHaveLength(1);
		expect(entries[0].message).toEqual("entry-3");
	});

	test("respects a custom filename when rotating", async () => {
		const connector = createConnector({
			directory: testDir,
			filename: "service.log",
			maxFileSizeBytes: ROTATION_LIMIT_BYTES,
			maxRetainedFiles: 5
		});

		await connector.log(largeEntry("first"));
		await connector.log(largeEntry("second"));
		await connector.stop();

		const files = (await readdir(testDir)).sort();
		expect(files).toContain("service.log");
		expect(files).toContain("service.1.log");
		expect((await readEntries("service.log"))[0].message).toEqual("second");
		expect((await readEntries("service.1.log"))[0].message).toEqual("first");
	});

	test("does not rotate when size rotation is disabled", async () => {
		const connector = createConnector({ directory: testDir, maxFileSizeBytes: 0 });

		for (let i = 0; i < 10; i++) {
			await connector.log(largeEntry(`entry-${i}`));
		}
		await connector.stop();

		const files = await readdir(testDir);
		expect(files).toEqual(["app.log"]);
		const entries = await readEntries();
		expect(entries).toHaveLength(10);
	});

	test("writes every entry under concurrent calls without losing or corrupting lines", async () => {
		const connector = createConnector({ directory: testDir });

		const indices = [...new Array(50).keys()];
		await Promise.all(
			indices.map(async i =>
				connector.log({ level: "info", source: "Test", message: `entry-${i}` })
			)
		);
		await connector.stop();

		const entries = await readEntries();
		expect(entries).toHaveLength(50);
		const messages = new Set(entries.map(entry => entry.message));
		expect(messages.size).toEqual(50);
	});

	test("keeps every entry when rotations happen mid-burst under concurrency", async () => {
		const connector = createConnector({
			directory: testDir,
			maxFileSizeBytes: ROTATION_LIMIT_BYTES,
			maxRetainedFiles: 100
		});

		const indices = [...new Array(50).keys()];
		await Promise.all(indices.map(async i => connector.log(largeEntry(`entry-${i}`))));
		await connector.stop();

		// Rotations occur during the burst; no entry should be lost or duplicated across files.
		const all = await readAllEntries();
		expect(all).toHaveLength(50);
		const messages = new Set(all.map(entry => entry.message));
		expect(messages.size).toEqual(50);
	});

	test("can be composed through MultiLoggingConnector", async () => {
		const fileConnector = createConnector({ directory: testDir });
		LoggingConnectorFactory.register(FileLoggingConnector.NAMESPACE, () => fileConnector);
		try {
			const multi = new MultiLoggingConnector({
				loggingConnectorTypes: [FileLoggingConnector.NAMESPACE]
			});
			await multi.log({ level: "info", source: "Test", message: "via-multi" });

			const entries = await readEntries();
			expect(entries).toHaveLength(1);
			expect(entries[0].message).toEqual("via-multi");
		} finally {
			LoggingConnectorFactory.unregister(FileLoggingConnector.NAMESPACE);
		}
	});

	describe("log validation", () => {
		test("rejects an entry with no message without writing a file", async () => {
			const connector = createConnector({ directory: testDir });
			await expect(
				connector.log({ level: LogLevel.Info, source: "Test" } as never)
			).rejects.toMatchObject({
				name: GuardError.CLASS_NAME,
				message: "guard.string",
				properties: { property: "logEntry.message" }
			});
			await connector.stop();
			expect(await readdir(testDir)).toEqual([]);
		});

		test("rejects an entry with a non-string source", async () => {
			const connector = createConnector({ directory: testDir });
			await expect(
				connector.log({ level: LogLevel.Info, source: 42, message: "hello" } as never)
			).rejects.toMatchObject({
				name: GuardError.CLASS_NAME,
				message: "guard.string",
				properties: { property: "logEntry.source" }
			});
		});

		test("rejects an entry with an unknown level", async () => {
			const connector = createConnector({ directory: testDir });
			await expect(
				connector.log({ level: "critical", source: "Test", message: "hello" } as never)
			).rejects.toMatchObject({
				name: GuardError.CLASS_NAME,
				message: "guard.arrayOneOf",
				properties: { property: "logEntry.level" }
			});
		});
	});
});
