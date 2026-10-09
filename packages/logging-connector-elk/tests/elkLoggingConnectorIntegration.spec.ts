// Copyright 2026 IOTA Stiftung.
// SPDX-License-Identifier: Apache-2.0.
import { ContextIdKeys, ContextIdStore } from "@3sixty/context";
import { TEST_ELASTICSEARCH_ENDPOINT, TEST_ELASTICSEARCH_INDEX } from "./setupTestEnv.js";
import { ElkLoggingConnector } from "../src/elkLoggingConnector.js";

// These tests need a real Elasticsearch, started by the setup-test-env action in CI. They fail
// rather than skip when it is absent, so a container that never came up cannot pass for green.

async function deleteIndex(): Promise<void> {
	const response = await fetch(
		`${TEST_ELASTICSEARCH_ENDPOINT}/_cat/indices/${TEST_ELASTICSEARCH_INDEX}*?h=index&format=json`
	);
	const indices = response.ok ? ((await response.json()) as { index: string }[]) : [];

	for (const index of indices) {
		await fetch(`${TEST_ELASTICSEARCH_ENDPOINT}/${index.index}`, { method: "DELETE" });
	}
}

async function searchDocuments(
	index: string = `${TEST_ELASTICSEARCH_INDEX}*`
): Promise<{ [key: string]: unknown }[]> {
	await fetch(`${TEST_ELASTICSEARCH_ENDPOINT}/${index}/_refresh`, { method: "POST" });
	const response = await fetch(`${TEST_ELASTICSEARCH_ENDPOINT}/${index}/_search?size=100`);
	const body = (await response.json()) as {
		hits?: { hits?: { _index: string; _source: { [key: string]: unknown } }[] };
	};
	return (body.hits?.hits ?? []).map(hit => ({ ...hit._source, _index: hit._index }));
}

/**
 * Create the test index and block writes to it, so a bulk request is rejected.
 */
async function blockWrites(): Promise<void> {
	await fetch(`${TEST_ELASTICSEARCH_ENDPOINT}/${TEST_ELASTICSEARCH_INDEX}`, { method: "PUT" });
	await fetch(`${TEST_ELASTICSEARCH_ENDPOINT}/${TEST_ELASTICSEARCH_INDEX}/_block/write`, {
		method: "PUT"
	});
}

/**
 * Lift the write block from the test index.
 */
async function unblockWrites(): Promise<void> {
	await fetch(`${TEST_ELASTICSEARCH_ENDPOINT}/${TEST_ELASTICSEARCH_INDEX}/_settings`, {
		method: "PUT",
		headers: { "content-type": "application/json" },
		body: JSON.stringify({ "index.blocks.write": false })
	});
}

describe("ElkLoggingConnector Integration", () => {
	beforeEach(async () => {
		await deleteIndex();
	});

	afterAll(async () => {
		await deleteIndex();
	});

	test("delivers a log entry to Elasticsearch", async () => {
		const connector = new ElkLoggingConnector({
			config: {
				endpoint: TEST_ELASTICSEARCH_ENDPOINT,
				indexName: TEST_ELASTICSEARCH_INDEX,
				batchSize: 1,
				batchIntervalMs: 0
			}
		});
		await connector.start();
		await connector.log({
			level: "info",
			source: "IntegrationTest",
			message: "delivered",
			ts: 1700000000000,
			data: { port: 8080 }
		});
		await connector.stop();

		const documents = await searchDocuments();
		expect(documents).toHaveLength(1);
		expect(documents[0]["@timestamp"]).toEqual(new Date(1700000000000).toISOString());
		expect(documents[0].level).toEqual("info");
		expect(documents[0].source).toEqual("IntegrationTest");
		expect(documents[0].message).toEqual("delivered");
		expect(documents[0].data).toEqual({ port: 8080 });
	});

	test("delivers a batch in one bulk request with per-entry tenant attribution", async () => {
		const connector = new ElkLoggingConnector({
			config: {
				endpoint: TEST_ELASTICSEARCH_ENDPOINT,
				indexName: TEST_ELASTICSEARCH_INDEX,
				batchSize: 100,
				batchIntervalMs: 60000
			}
		});
		await connector.start();

		await ContextIdStore.run(
			{ [ContextIdKeys.Tenant]: "tenant-a", [ContextIdKeys.Node]: "node-1" },
			async () => connector.log({ level: "info", source: "IntegrationTest", message: "from-a" })
		);
		await ContextIdStore.run({ [ContextIdKeys.Tenant]: "tenant-b" }, async () =>
			connector.log({ level: "info", source: "IntegrationTest", message: "from-b" })
		);
		await connector.log({ level: "info", source: "IntegrationTest", message: "no-context" });

		// Nothing is indexed until the batch is flushed by stop().
		await connector.stop();

		const documents = await searchDocuments();
		const byMessage = new Map(documents.map(document => [document.message, document]));
		expect(byMessage.get("from-a")).toMatchObject({ tenant: "tenant-a", node: "node-1" });
		expect(byMessage.get("from-b")).toMatchObject({ tenant: "tenant-b" });
		expect(byMessage.get("from-b")).not.toHaveProperty("node");
		expect(byMessage.get("no-context")).not.toHaveProperty("tenant");
	});

	test("writes to a date rolled index", async () => {
		const connector = new ElkLoggingConnector({
			config: {
				endpoint: TEST_ELASTICSEARCH_ENDPOINT,
				indexName: TEST_ELASTICSEARCH_INDEX,
				indexDateRolling: true,
				batchSize: 1,
				batchIntervalMs: 0
			}
		});
		await connector.start();
		await connector.log({ level: "info", source: "IntegrationTest", message: "rolled" });
		await connector.stop();

		const now = new Date();
		const expected = `${TEST_ELASTICSEARCH_INDEX}-${now.getUTCFullYear()}.${`${now.getUTCMonth() + 1}`.padStart(2, "0")}.${`${now.getUTCDate()}`.padStart(2, "0")}`;
		const documents = await searchDocuments();
		expect(documents).toHaveLength(1);
		expect(documents[0]._index).toEqual(expected);
	});

	test("drops entries the cluster rejects rather than retrying them forever", async () => {
		await blockWrites();

		const connector = new ElkLoggingConnector({
			config: {
				endpoint: TEST_ELASTICSEARCH_ENDPOINT,
				indexName: TEST_ELASTICSEARCH_INDEX,
				batchSize: 100,
				batchIntervalMs: 60000
			}
		});
		await connector.start();
		await connector.log({ level: "info", source: "IntegrationTest", message: "blocked-one" });
		await connector.log({ level: "info", source: "IntegrationTest", message: "blocked-two" });

		// A write blocked index answers the bulk request with a per item 403, which is a rejection
		// the cluster would repeat for these documents, so they are not queued for another attempt.
		await connector.flush();
		expect(await searchDocuments()).toHaveLength(0);

		// Still nothing once writes are accepted again: the entries were dropped, not held back.
		await unblockWrites();
		await connector.stop();
		expect(await searchDocuments()).toHaveLength(0);
	});

	test("throws a delivery failure to the caller when batching is disabled", async () => {
		const connector = new ElkLoggingConnector({
			config: {
				// A port with nothing listening, so the request fails outright.
				endpoint: "http://127.0.0.1:9299",
				indexName: TEST_ELASTICSEARCH_INDEX,
				batchSize: 1,
				batchIntervalMs: 0,
				timeoutMs: 2000
			}
		});
		await connector.start();

		await expect(
			connector.log({ level: "info", source: "IntegrationTest", message: "undelivered" })
		).rejects.toThrow();
		await connector.stop();

		expect(await searchDocuments()).toHaveLength(0);
	});
});
