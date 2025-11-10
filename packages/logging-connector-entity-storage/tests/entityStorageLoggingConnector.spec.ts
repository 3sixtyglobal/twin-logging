// Copyright 2024 IOTA Stiftung.
// SPDX-License-Identifier: Apache-2.0.
import { MemoryEntityStorageConnector } from "@twin.org/entity-storage-connector-memory";
import { EntityStorageConnectorFactory } from "@twin.org/entity-storage-models";
import { nameof } from "@twin.org/nameof";
import type { LogEntry } from "../src/entities/logEntry.js";
import { EntityStorageLoggingConnector } from "../src/entityStorageLoggingConnector.js";
import { initSchema } from "../src/schema.js";

describe("EntityStorageLoggingConnector", () => {
	beforeAll(() => {
		initSchema();
		EntityStorageConnectorFactory.register(
			"log-entry",
			() =>
				new MemoryEntityStorageConnector<LogEntry>({
					entitySchema: nameof<LogEntry>()
				})
		);
	});

	test("can construct", async () => {
		const logging = new EntityStorageLoggingConnector();
		expect(logging).toBeDefined();
	});
});
