// Copyright 2026 IOTA Stiftung.
// SPDX-License-Identifier: Apache-2.0.
import { ContextIdKeys, ContextIdStore } from "@twin.org/context";
import { Converter } from "@twin.org/core";
import { LogLevel } from "@twin.org/logging-models";
import { FetchHelper } from "@twin.org/web";
import { ElkLoggingConnector } from "../src/elkLoggingConnector.js";

interface ICapturedRequest {
	url: string;
	body: string;
	headers: { [key: string]: string | string[] };
	timeoutMs?: number;
	retryCount?: number;
	retryDelayMs?: number;
}

interface IBulkPair {
	action: { create: { _index: string; _id: string } };
	document: { [key: string]: unknown };
}

let requests: ICapturedRequest[];

let response: {
	ok: boolean;
	status: number;
	statusText: string;
	contentType: string;
	payload: unknown;
};

beforeEach(() => {
	requests = [];
	response = {
		ok: true,
		status: 200,
		statusText: "OK",
		contentType: "application/json; charset=UTF-8",
		payload: { errors: false, items: [] }
	};

	vi.spyOn(FetchHelper, "fetch").mockImplementation(async (source, url, method, body, options) => {
		requests.push({
			url,
			body: body as string,
			headers: (options?.headers ?? {}) as { [key: string]: string | string[] },
			timeoutMs: options?.timeoutMs,
			retryCount: options?.retryCount,
			retryDelayMs: options?.retryDelayMs
		});
		return {
			ok: response.ok,
			status: response.status,
			statusText: response.statusText,
			headers: new Headers(
				response.contentType.length > 0 ? { "content-type": response.contentType } : {}
			),
			json: async (): Promise<unknown> => response.payload
		} as Response;
	});
});

afterEach(() => {
	vi.restoreAllMocks();
});

async function makeConnector(
	config: { [key: string]: unknown } = {}
): Promise<ElkLoggingConnector> {
	const connector = new ElkLoggingConnector({
		config: {
			endpoint: "http://localhost:9200",
			batchSize: 1,
			batchIntervalMs: 0,
			...config
		}
	});
	await connector.start();
	return connector;
}

async function waitForRequests(count: number): Promise<void> {
	await vi.waitUntil(() => requests.length >= count, { timeout: 2000, interval: 1 });
}

function pairsOf(body: string): IBulkPair[] {
	const lines = body
		.split("\n")
		.filter(line => line.length > 0)
		.map(line => JSON.parse(line) as { [key: string]: unknown });

	const pairs: IBulkPair[] = [];
	for (let i = 0; i < lines.length; i += 2) {
		const action = lines[i];
		const document = lines[i + 1];
		expect(Object.keys(action)).toEqual(["create"]);
		expect(document).toBeDefined();
		expect(document).not.toHaveProperty("create");
		pairs.push({ action: action as unknown as IBulkPair["action"], document });
	}
	return pairs;
}

function documentsOf(body: string): { [key: string]: unknown }[] {
	return pairsOf(body).map(pair => pair.document);
}

describe("ElkLoggingConnector", () => {
	test("can construct", async () => {
		const connector = new ElkLoggingConnector({
			config: { endpoint: "http://localhost:9200" }
		});
		expect(connector).toBeDefined();
		expect(connector.className()).toEqual("ElkLoggingConnector");
		await connector.stop();
	});

	test("can fail to construct with no endpoint", () => {
		let error: { name?: string; properties?: { property?: string } } | undefined;
		try {
			// eslint-disable-next-line no-new
			new ElkLoggingConnector({ config: {} } as never);
		} catch (err) {
			error = err as { name?: string; properties?: { property?: string } };
		}
		expect(error?.name).toEqual("GuardError");
		expect(error?.properties?.property).toEqual("options.config.endpoint");
	});

	test("can fail to construct with both an api key and basic credentials", () => {
		expect(
			() =>
				new ElkLoggingConnector({
					config: {
						endpoint: "http://localhost:9200",
						apiKey: "key",
						username: "elastic",
						password: "changeme"
					}
				})
		).toThrow("elkLoggingConnector.conflictingAuth");
	});

	test("can fail to construct with a user name but no password", () => {
		let error: { name?: string; properties?: { property?: string } } | undefined;
		try {
			// eslint-disable-next-line no-new
			new ElkLoggingConnector({
				config: { endpoint: "http://localhost:9200", username: "elastic" }
			});
		} catch (err) {
			error = err as { name?: string; properties?: { property?: string } };
		}
		expect(error?.name).toEqual("GuardError");
		expect(error?.properties?.property).toEqual("config.password");
	});

	test("stop without start is a no-op", async () => {
		const connector = new ElkLoggingConnector({
			config: { endpoint: "http://localhost:9200" }
		});
		await expect(connector.stop()).resolves.toBeUndefined();
		expect(requests).toHaveLength(0);
	});

	test("posts a bulk request with mapped document fields", async () => {
		const connector = await makeConnector();
		await connector.log({
			level: "info",
			source: "MySource",
			message: "hello",
			ts: 1700000000000,
			data: { port: 8080 }
		});

		expect(requests).toHaveLength(1);
		expect(requests[0].url).toEqual("http://localhost:9200/_bulk");
		expect(requests[0].headers["content-type"]).toEqual("application/x-ndjson");

		const documents = documentsOf(requests[0].body);
		expect(documents).toHaveLength(1);
		expect(documents[0]).toEqual({
			"@timestamp": new Date(1700000000000).toISOString(),
			level: "info",
			source: "MySource",
			message: "hello",
			data: { port: 8080 }
		});
		await connector.stop();
	});

	test("strips a trailing slash from the endpoint", async () => {
		const connector = await makeConnector({ endpoint: "http://localhost:9200/" });
		await connector.log({ level: "info", source: "Test", message: "hello" });

		expect(requests[0].url).toEqual("http://localhost:9200/_bulk");
		await connector.stop();
	});

	test("defaults the timestamp to the current time as an ISO string", async () => {
		const connector = await makeConnector();
		const before = Date.now();
		await connector.log({ level: "info", source: "Test", message: "no-ts" });
		const after = Date.now();

		const ts = Date.parse(documentsOf(requests[0].body)[0]["@timestamp"] as string);
		expect(ts).toBeGreaterThanOrEqual(before);
		expect(ts).toBeLessThanOrEqual(after);
		await connector.stop();
	});

	test("filters out levels that are not configured", async () => {
		const connector = await makeConnector({ levels: [LogLevel.Error] });
		await connector.log({ level: "info", source: "Test", message: "dropped" });
		await connector.log({ level: "error", source: "Test", message: "kept" });

		expect(requests).toHaveLength(1);
		expect(documentsOf(requests[0].body)[0].message).toEqual("kept");
		await connector.stop();
	});

	test("flattens an error into the document", async () => {
		const connector = await makeConnector();
		await connector.log({
			level: "error",
			source: "Test",
			message: "boom",
			error: { name: "GeneralError", message: "something.failed" }
		});

		const error = documentsOf(requests[0].body)[0].error as { name: string; message: string }[];
		expect(Array.isArray(error)).toEqual(true);
		expect(error[0].name).toEqual("GeneralError");
		expect(error[0].message).toEqual("something.failed");
		await connector.stop();
	});

	test("stamps the node and tenant of the active context onto the document", async () => {
		const connector = await makeConnector();

		await ContextIdStore.run(
			{ [ContextIdKeys.Tenant]: "tenant-a", [ContextIdKeys.Node]: "node-1" },
			async () => connector.log({ level: "info", source: "Test", message: "in-context" })
		);

		const document = documentsOf(requests[0].body)[0];
		expect(document.node).toEqual("node-1");
		expect(document.tenant).toEqual("tenant-a");
		await connector.stop();
	});

	test("omits the context fields when there is no active context", async () => {
		const connector = await makeConnector();
		// No ContextIdStore.run() wrapper — simulates a background task with no tenant context.
		await connector.log({ level: "info", source: "Test", message: "no-context" });

		const document = documentsOf(requests[0].body)[0];
		expect(document).not.toHaveProperty("node");
		expect(document).not.toHaveProperty("tenant");
		await connector.stop();
	});

	test("attributes each document in a shared batch to its own tenant", async () => {
		const connector = await makeConnector({ batchSize: 2 });

		await ContextIdStore.run({ [ContextIdKeys.Tenant]: "tenant-a" }, async () =>
			connector.log({ level: "info", source: "Test", message: "from-a" })
		);
		await ContextIdStore.run({ [ContextIdKeys.Tenant]: "tenant-b" }, async () =>
			connector.log({ level: "info", source: "Test", message: "from-b" })
		);

		// Both entries flush in one bulk request, on a stack of their own, yet each keeps the
		// tenant captured when it was logged.
		await waitForRequests(1);
		expect(requests).toHaveLength(1);
		expect(
			documentsOf(requests[0].body).map(document => [document.message, document.tenant])
		).toEqual([
			["from-a", "tenant-a"],
			["from-b", "tenant-b"]
		]);
		await connector.stop();
	});

	test("holds entries until the size threshold is reached", async () => {
		const connector = await makeConnector({ batchSize: 3 });

		await connector.log({ level: "info", source: "Test", message: "one" });
		await connector.log({ level: "info", source: "Test", message: "two" });
		expect(requests).toHaveLength(0);

		await connector.log({ level: "info", source: "Test", message: "three" });
		await waitForRequests(1);
		expect(documentsOf(requests[0].body)).toHaveLength(3);
		await connector.stop();
	});

	test("pairs every document with a create action line carrying the index and a document id", async () => {
		const connector = await makeConnector({ batchSize: 2, indexName: "custom-logs" });
		await connector.log({ level: "info", source: "Test", message: "one" });
		await connector.log({ level: "info", source: "Test", message: "two" });
		await waitForRequests(1);

		// pairsOf enforces the action/document interleaving the bulk API requires.
		const pairs = pairsOf(requests[0].body);
		expect(pairs).toHaveLength(2);
		expect(pairs.map(pair => pair.document.message)).toEqual(["one", "two"]);
		for (const pair of pairs) {
			expect(pair.action.create._index).toEqual("custom-logs");
			expect(pair.action.create._id).toMatch(/^[\da-f]{64}$/);
		}
		expect(pairs[0].action.create._id).not.toEqual(pairs[1].action.create._id);
		expect(requests[0].body.endsWith("\n")).toEqual(true);
		await connector.stop();
	});

	test("appends a UTC date suffix to the index when date rolling is enabled", async () => {
		const connector = await makeConnector({ indexDateRolling: true, indexName: "twin-logs" });
		await connector.log({ level: "info", source: "Test", message: "hello" });

		const now = new Date();
		const expected = `twin-logs-${now.getUTCFullYear()}.${`${now.getUTCMonth() + 1}`.padStart(2, "0")}.${`${now.getUTCDate()}`.padStart(2, "0")}`;
		expect(pairsOf(requests[0].body)[0].action.create._index).toEqual(expected);
		await connector.stop();
	});

	test("sends an api key authorization header", async () => {
		const connector = await makeConnector({ apiKey: "secret-key" });
		await connector.log({ level: "info", source: "Test", message: "hello" });

		expect(requests[0].headers.authorization).toEqual("ApiKey secret-key");
		await connector.stop();
	});

	test("sends a basic authorization header", async () => {
		const connector = await makeConnector({ username: "elastic", password: "changeme" });
		await connector.log({ level: "info", source: "Test", message: "hello" });

		const expected = Converter.bytesToBase64(Converter.utf8ToBytes("elastic:changeme"));
		expect(requests[0].headers.authorization).toEqual(`Basic ${expected}`);
		await connector.stop();
	});

	test("sends no authorization header when no credentials are configured", async () => {
		const connector = await makeConnector();
		await connector.log({ level: "info", source: "Test", message: "hello" });

		expect(requests[0].headers).not.toHaveProperty("authorization");
		await connector.stop();
	});

	test("flushes pending entries on stop", async () => {
		const connector = await makeConnector({ batchSize: 100, batchIntervalMs: 60000 });
		await connector.log({ level: "info", source: "Test", message: "pending" });
		expect(requests).toHaveLength(0);

		await connector.stop();
		expect(requests).toHaveLength(1);
		expect(documentsOf(requests[0].body)[0].message).toEqual("pending");
	});

	test("flushes on the interval timer", async () => {
		const connector = await makeConnector({ batchSize: 100, batchIntervalMs: 50 });
		await connector.log({ level: "info", source: "Test", message: "timed" });
		expect(requests).toHaveLength(0);

		await waitForRequests(1);
		expect(documentsOf(requests[0].body)[0].message).toEqual("timed");
		await connector.stop();
	});

	test("sends one request per batch when many entries are logged at once", async () => {
		const connector = await makeConnector({ batchSize: 10, batchIntervalMs: 60000 });

		const pending: Promise<void>[] = [];
		for (let i = 0; i < 50; i++) {
			pending.push(connector.log({ level: "info", source: "Test", message: `entry-${i}` }));
		}
		await Promise.all(pending);
		await connector.flush();

		expect(requests.length).toBeGreaterThan(0);
		for (const request of requests) {
			expect(request.body.length).toBeGreaterThan(1);
			expect(documentsOf(request.body).length).toBeGreaterThan(0);
		}

		// Every entry is delivered exactly once.
		const messages = requests.flatMap(request =>
			documentsOf(request.body).map(document => document.message)
		);
		expect(new Set(messages).size).toEqual(50);
		expect(messages).toHaveLength(50);
		await connector.stop();
	});

	test("returns entries to the cache when the request fails", async () => {
		const connector = await makeConnector({ batchSize: 100, batchIntervalMs: 60000 });
		response = {
			ok: false,
			status: 503,
			statusText: "Service Unavailable",
			contentType: "application/json",
			payload: {}
		};

		await connector.log({ level: "info", source: "Test", message: "retry-me" });
		await connector.flush();
		expect(requests).toHaveLength(1);

		// The failed batch is still cached, so the next flush delivers it again.
		response = {
			ok: true,
			status: 200,
			statusText: "OK",
			contentType: "application/json",
			payload: { errors: false, items: [] }
		};
		await connector.flush();
		expect(requests).toHaveLength(2);
		expect(documentsOf(requests[1].body)[0].message).toEqual("retry-me");
		await connector.stop();
	});

	test("redelivers a failed batch under the same document ids", async () => {
		const connector = await makeConnector({ batchSize: 100, batchIntervalMs: 60000 });
		response = {
			ok: false,
			status: 503,
			statusText: "Service Unavailable",
			contentType: "application/json",
			payload: {}
		};

		await connector.log({ level: "info", source: "Test", message: "one" });
		await connector.log({ level: "info", source: "Test", message: "two" });
		await connector.flush();

		response = {
			ok: true,
			status: 200,
			statusText: "OK",
			contentType: "application/json",
			payload: { errors: false, items: [] }
		};
		await connector.flush();

		// Elasticsearch recognises the ids of the first attempt, so a document indexed before the
		// response was lost cannot be indexed a second time.
		const first = pairsOf(requests[0].body).map(pair => pair.action.create._id);
		const second = pairsOf(requests[1].body).map(pair => pair.action.create._id);
		expect(second).toEqual(first);
		await connector.stop();
	});

	test("stops flushing on the size threshold while a delivery is failing", async () => {
		const connector = await makeConnector({ batchSize: 2, batchIntervalMs: 60000 });
		response = {
			ok: false,
			status: 503,
			statusText: "Service Unavailable",
			contentType: "application/json",
			payload: {}
		};

		await connector.log({ level: "info", source: "Test", message: "one" });
		await connector.log({ level: "info", source: "Test", message: "two" });
		await waitForRequests(1);

		// The cache is still at the batch size after the failed delivery, so without a backoff
		// every further entry would send the whole cache at the cluster again.
		for (const message of ["three", "four", "five", "six"]) {
			await connector.log({ level: "info", source: "Test", message });
			await new Promise(resolve => {
				setTimeout(resolve, 0);
			});
		}
		expect(requests).toHaveLength(1);

		// An explicit flush still retries, and once it succeeds the threshold works again.
		response = {
			ok: true,
			status: 200,
			statusText: "OK",
			contentType: "application/json",
			payload: { errors: false, items: [] }
		};
		await connector.flush();
		expect(documentsOf(requests[1].body)).toHaveLength(6);

		await connector.log({ level: "info", source: "Test", message: "seven" });
		await connector.log({ level: "info", source: "Test", message: "eight" });
		await waitForRequests(3);
		expect(documentsOf(requests[2].body).map(document => document.message)).toEqual([
			"seven",
			"eight"
		]);
		await connector.stop();
	});

	test("retries only the transient failures of a partial bulk response", async () => {
		const connector = await makeConnector({ batchSize: 100, batchIntervalMs: 60000 });
		response = {
			ok: true,
			status: 200,
			statusText: "OK",
			contentType: "application/json",
			payload: {
				errors: true,
				items: [
					{ create: { status: 201 } },
					{ create: { status: 400, error: { reason: "mapper_parsing_exception" } } },
					{ create: { status: 429, error: { reason: "es_rejected_execution_exception" } } },
					{ create: { status: 409, error: { reason: "version_conflict_engine_exception" } } },
					{ create: { status: 403, error: { reason: "cluster_block_exception" } } }
				]
			}
		};

		for (const message of ["indexed", "malformed", "throttled", "duplicate", "blocked"]) {
			await connector.log({ level: "info", source: "Test", message });
		}
		await connector.flush();
		expect(requests).toHaveLength(1);

		response = {
			ok: true,
			status: 200,
			statusText: "OK",
			contentType: "application/json",
			payload: { errors: false, items: [] }
		};
		await connector.flush();

		// Only the throttled document is sent again: the indexed one is done, the conflict means an
		// earlier attempt already indexed it, and the malformed and blocked ones are rejections the
		// cluster would repeat for the same documents.
		expect(requests).toHaveLength(2);
		expect(documentsOf(requests[1].body).map(document => document.message)).toEqual(["throttled"]);
		await connector.stop();
	});

	test("redelivers a document the failed response has no result for", async () => {
		const connector = await makeConnector({ batchSize: 100, batchIntervalMs: 60000 });
		response = {
			ok: true,
			status: 200,
			statusText: "OK",
			contentType: "application/json",
			// Two documents were sent but the response only accounts for the first.
			payload: { errors: true, items: [{ create: { status: 201 } }] }
		};

		await connector.log({ level: "info", source: "Test", message: "accounted" });
		await connector.log({ level: "info", source: "Test", message: "unaccounted" });
		await connector.flush();

		response = {
			ok: true,
			status: 200,
			statusText: "OK",
			contentType: "application/json",
			payload: { errors: false, items: [] }
		};
		await connector.flush();

		expect(documentsOf(requests[1].body).map(document => document.message)).toEqual([
			"unaccounted"
		]);
		await connector.stop();
	});

	test("throws the delivery failure to the caller when batching is disabled", async () => {
		const connector = await makeConnector();
		response = {
			ok: false,
			status: 503,
			statusText: "Service Unavailable",
			contentType: "application/json",
			payload: {}
		};

		await expect(
			connector.log({ level: "info", source: "Test", message: "unbatched" })
		).rejects.toThrow("elkLoggingConnector.bulkRequestFailed");
		await connector.stop();
	});

	test("trims the oldest entries when a failed flush exceeds the cache limit", async () => {
		const connector = await makeConnector({
			batchSize: 100,
			batchIntervalMs: 60000,
			maxCacheSize: 2
		});
		response = {
			ok: false,
			status: 503,
			statusText: "Service Unavailable",
			contentType: "application/json",
			payload: {}
		};

		for (const message of ["one", "two", "three"]) {
			await connector.log({ level: "info", source: "Test", message });
		}
		await connector.flush();

		response = {
			ok: true,
			status: 200,
			statusText: "OK",
			contentType: "application/json",
			payload: { errors: false, items: [] }
		};
		await connector.flush();

		// Oldest first: "one" is dropped to bring the cache back to maxCacheSize.
		expect(documentsOf(requests[1].body).map(document => document.message)).toEqual([
			"two",
			"three"
		]);
		await connector.stop();
	});
});
