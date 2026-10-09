// Copyright 2026 IOTA Stiftung.
// SPDX-License-Identifier: Apache-2.0.
import { GuardError } from "@3sixty/core";
import type { ILogEntry } from "@3sixty/logging-models";
import { LogLevel } from "@3sixty/logging-models";
import { HttpMethod } from "@3sixty/web";
import { LoggingRestClient } from "../src/loggingRestClient.js";
import {
	jsonResponse,
	noContentResponse,
	setupFetchMock,
	teardownFetchMock
} from "./helpers/restClientTestHelpers.js";

// OpenAPI spec: ../../logging-service/docs/open-api/spec.json
const ENDPOINT = "http://localhost:8080";
const PREFIX = "logging";

const TEST_LOG_ENTRY: ILogEntry = {
	level: LogLevel.Info,
	source: "TestSource",
	ts: 1700000000000,
	message: "Test log message"
};

const TEST_LOG_ENTRY_ERROR: ILogEntry = {
	level: LogLevel.Error,
	source: "TestSource",
	ts: 1700000001000,
	message: "Test error message",
	error: {
		name: "TestError",
		message: "Something went wrong"
	}
};

const TEST_LIST_RESPONSE = {
	entities: [TEST_LOG_ENTRY, TEST_LOG_ENTRY_ERROR],
	cursor: "next-page-cursor"
};

const TEST_LIST_RESPONSE_NO_CURSOR = {
	entities: [TEST_LOG_ENTRY],
	cursor: undefined
};

const fetchMock = vi.fn();

describe("LoggingRestClient", () => {
	let client: LoggingRestClient;

	beforeEach(() => {
		setupFetchMock(fetchMock);
		client = new LoggingRestClient({ endpoint: ENDPOINT });
	});

	afterEach(() => {
		teardownFetchMock(fetchMock);
	});

	describe("log", () => {
		test("throws when logEntry is undefined", async () => {
			await expect(client.log(undefined as never)).rejects.toMatchObject({
				name: GuardError.CLASS_NAME,
				message: "guard.objectUndefined"
			});
		});

		test("sends POST to /{prefix}", async () => {
			fetchMock.mockResolvedValueOnce(noContentResponse());

			await client.log(TEST_LOG_ENTRY);

			const [url, options] = fetchMock.mock.calls[0];
			expect(url).toBe(`${ENDPOINT}/${PREFIX}`);
			expect(options.method).toBe(HttpMethod.POST);
		});

		test("sends the log entry as the request body", async () => {
			fetchMock.mockResolvedValueOnce(noContentResponse());

			await client.log(TEST_LOG_ENTRY);

			const [, options] = fetchMock.mock.calls[0];
			const body = JSON.parse(options.body);
			expect(body.level).toBe(LogLevel.Info);
			expect(body.source).toBe("TestSource");
			expect(body.message).toBe("Test log message");
		});

		test("resolves without a return value", async () => {
			fetchMock.mockResolvedValueOnce(noContentResponse());

			await expect(client.log(TEST_LOG_ENTRY)).resolves.toBeUndefined();
		});

		test("rejects an entry with no message without sending a request", async () => {
			await expect(
				client.log({ level: LogLevel.Info, source: "client" } as never)
			).rejects.toMatchObject({
				name: GuardError.CLASS_NAME,
				message: "guard.string",
				properties: { property: "logEntry.message" }
			});
			expect(fetchMock).not.toHaveBeenCalled();
		});

		test("rejects an entry with a non-string source without sending a request", async () => {
			await expect(
				client.log({ level: LogLevel.Info, source: 42, message: "hello" } as never)
			).rejects.toMatchObject({
				name: GuardError.CLASS_NAME,
				message: "guard.string",
				properties: { property: "logEntry.source" }
			});
			expect(fetchMock).not.toHaveBeenCalled();
		});

		test("rejects an entry with an unknown level without sending a request", async () => {
			await expect(
				client.log({ level: "critical", source: "client", message: "hello" } as never)
			).rejects.toMatchObject({
				name: GuardError.CLASS_NAME,
				message: "guard.arrayOneOf",
				properties: { property: "logEntry.level" }
			});
			expect(fetchMock).not.toHaveBeenCalled();
		});
	});

	describe("query", () => {
		test("sends GET to /{prefix}", async () => {
			fetchMock.mockResolvedValueOnce(jsonResponse(TEST_LIST_RESPONSE_NO_CURSOR));

			await client.query();

			const [url, options] = fetchMock.mock.calls[0];
			expect(url).toBe(`${ENDPOINT}/${PREFIX}`);
			expect(options.method).toBe(HttpMethod.GET);
		});

		test("returns entities from the response body", async () => {
			fetchMock.mockResolvedValueOnce(jsonResponse(TEST_LIST_RESPONSE_NO_CURSOR));

			const result = await client.query();

			expect(result.entities).toEqual(TEST_LIST_RESPONSE_NO_CURSOR.entities);
		});

		test("returns cursor from the response body when present", async () => {
			fetchMock.mockResolvedValueOnce(jsonResponse(TEST_LIST_RESPONSE));

			const result = await client.query();

			expect(result.cursor).toBe("next-page-cursor");
		});

		test("returns undefined cursor when not present in response body", async () => {
			fetchMock.mockResolvedValueOnce(jsonResponse(TEST_LIST_RESPONSE_NO_CURSOR));

			const result = await client.query();

			expect(result.cursor).toBeUndefined();
		});

		test("includes level as a query parameter when provided", async () => {
			fetchMock.mockResolvedValueOnce(jsonResponse(TEST_LIST_RESPONSE_NO_CURSOR));

			await client.query(LogLevel.Error);

			const [url] = fetchMock.mock.calls[0];
			expect(url).toContain("level=error");
		});

		test("includes source as a query parameter when provided", async () => {
			fetchMock.mockResolvedValueOnce(jsonResponse(TEST_LIST_RESPONSE_NO_CURSOR));

			await client.query(undefined, "MyService");

			const [url] = fetchMock.mock.calls[0];
			expect(url).toContain("source=MyService");
		});

		test("includes timeStart as a query parameter when provided", async () => {
			fetchMock.mockResolvedValueOnce(jsonResponse(TEST_LIST_RESPONSE_NO_CURSOR));

			await client.query(undefined, undefined, 1700000000000);

			const [url] = fetchMock.mock.calls[0];
			expect(url).toContain("timeStart=1700000000000");
		});

		test("includes timeEnd as a query parameter when provided", async () => {
			fetchMock.mockResolvedValueOnce(jsonResponse(TEST_LIST_RESPONSE_NO_CURSOR));

			await client.query(undefined, undefined, undefined, 1700000099999);

			const [url] = fetchMock.mock.calls[0];
			expect(url).toContain("timeEnd=1700000099999");
		});

		test("includes cursor as a query parameter when provided", async () => {
			fetchMock.mockResolvedValueOnce(jsonResponse(TEST_LIST_RESPONSE_NO_CURSOR));

			await client.query(undefined, undefined, undefined, undefined, "page2");

			const [url] = fetchMock.mock.calls[0];
			expect(url).toContain("cursor=page2");
		});

		test("includes limit as a query parameter when provided", async () => {
			fetchMock.mockResolvedValueOnce(jsonResponse(TEST_LIST_RESPONSE_NO_CURSOR));

			await client.query(undefined, undefined, undefined, undefined, undefined, 10);

			const [url] = fetchMock.mock.calls[0];
			expect(url).toContain("limit=10");
		});
	});
});
