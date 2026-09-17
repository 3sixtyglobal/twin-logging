// Copyright 2026 IOTA Stiftung.
// SPDX-License-Identifier: Apache-2.0.
import { Is } from "@twin.org/core";
import { EntitySchemaFactory, EntitySchemaHelper } from "@twin.org/entity";
import { MemoryEntityStorageConnector } from "@twin.org/entity-storage-connector-memory";
import { EntityStorageConnectorFactory } from "@twin.org/entity-storage-models";
import {
	SchemaVersionService,
	type SchemaVersion,
	initSchema as initSchemaVersionSchema
} from "@twin.org/entity-storage-service";
import { LogLevel } from "@twin.org/logging-models";
import { nameof } from "@twin.org/nameof";
import type { LogEntry } from "../src/entities/logEntry.js";
import type { LogEntryV0 } from "../src/entities/logEntryV0.js";
import { initSchema } from "../src/schema.js";

describe("initSchema", () => {
	beforeAll(() => {
		initSchema();
		initSchemaVersionSchema();
	});

	test("Registers the current and previous log entry versions under their conventional names", () => {
		const current = EntitySchemaFactory.get(nameof<LogEntry>());
		const previous = EntitySchemaFactory.get(nameof<LogEntryV0>());

		expect(current.type).toEqual("LogEntry");
		expect(previous.type).toEqual("LogEntryV0");
		expect(EntitySchemaHelper.getVersion(current)).toEqual(1);
		expect(EntitySchemaHelper.getVersion(previous)).toEqual(0);
	});

	test("Log entry versions differ only by the id bound, so the migration needs no data transform", () => {
		const current = EntitySchemaFactory.get(nameof<LogEntry>());
		const previous = EntitySchemaFactory.get(nameof<LogEntryV0>());

		const strip = (schema: typeof current): unknown[] =>
			(schema.properties ?? []).map(property => ({ ...property, maxLength: undefined }));

		expect(strip(current)).toEqual(strip(previous));
		expect(current.properties?.find(p => p.property === "id")?.maxLength).toEqual(255);
		expect(previous.properties?.find(p => p.property === "id")?.maxLength).toBeUndefined();
	});

	/**
	 * Seed a log entry store with version 0 rows and run the schema migration over it.
	 * @param key Unique storage key so each case gets its own buffers.
	 * @param storedVersion The version already recorded for LogEntry, or undefined when the node
	 * has never tracked schema versions.
	 * @returns The log entry and version stores after the migration has run.
	 */
	async function runMigration(
		key: string,
		storedVersion: number | undefined
	): Promise<{
		logStorage: MemoryEntityStorageConnector<LogEntry>;
		versionStorage: MemoryEntityStorageConnector<SchemaVersion>;
	}> {
		const logStorage = new MemoryEntityStorageConnector<LogEntry>({
			entitySchema: nameof<LogEntry>(),
			config: { storageKey: `log-entry-${key}` }
		});
		const versionStorage = new MemoryEntityStorageConnector<SchemaVersion>({
			entitySchema: nameof<SchemaVersion>(),
			config: { storageKey: `schema-version-${key}` }
		});

		EntityStorageConnectorFactory.register(`log-entry-${key}`, () => logStorage);
		EntityStorageConnectorFactory.register(`schema-version-${key}`, () => versionStorage);

		for (let i = 0; i < 5; i++) {
			await logStorage.set({
				id: `${i}`.repeat(64),
				level: LogLevel.Info,
				source: "test",
				ts: 1700000000000 + i,
				message: `message ${i}`
			});
		}

		if (!Is.undefined(storedVersion)) {
			await versionStorage.set({
				schemaName: nameof<LogEntry>(),
				version: storedVersion,
				updatedAt: new Date().toISOString()
			});
		}

		const service = new SchemaVersionService({
			schemaVersionStorageType: `schema-version-${key}`
		});
		await service.start();

		return { logStorage, versionStorage };
	}

	/**
	 * Assert a migrated log entry store still holds every seeded row intact.
	 * @param logStorage The store to check.
	 */
	async function expectRowsPreserved(
		logStorage: MemoryEntityStorageConnector<LogEntry>
	): Promise<void> {
		const migrated = await logStorage.query();

		expect(migrated.entities).toHaveLength(5);
		expect(migrated.entities.map(e => e.message).sort()).toEqual([
			"message 0",
			"message 1",
			"message 2",
			"message 3",
			"message 4"
		]);
		expect(migrated.entities.map(e => e.ts).sort()).toEqual([
			1700000000000, 1700000000001, 1700000000002, 1700000000003, 1700000000004
		]);
		expect(migrated.entities.every(e => e.level === LogLevel.Info)).toEqual(true);
	}

	test("Migrates log entries from a recorded version 0 to version 1 preserving existing rows", async () => {
		const { logStorage, versionStorage } = await runMigration("recorded", 0);

		expect((await versionStorage.get(nameof<LogEntry>()))?.version).toEqual(1);
		await expectRowsPreserved(logStorage);
	});

	test("Migrates log entries to version 1 when no version has ever been recorded", async () => {
		const { logStorage, versionStorage } = await runMigration("unrecorded", undefined);

		expect((await versionStorage.get(nameof<LogEntry>()))?.version).toEqual(1);
		await expectRowsPreserved(logStorage);
	});
});
