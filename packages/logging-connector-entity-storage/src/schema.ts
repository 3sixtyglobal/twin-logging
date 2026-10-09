// Copyright 2024 IOTA Stiftung.
// SPDX-License-Identifier: Apache-2.0.
import { EntitySchemaFactory, EntitySchemaHelper } from "@3sixty/entity";
import { nameof } from "@3sixty/nameof";
import { LogEntry } from "./entities/logEntry.js";
import { LogEntryError } from "./entities/logEntryError.js";

/**
 * Registers entity schemas for the logging connector entity storage with the schema factory.
 */
export function initSchema(): void {
	EntitySchemaFactory.register(nameof<LogEntry>(), () => EntitySchemaHelper.getSchema(LogEntry));
	EntitySchemaFactory.register(nameof<LogEntryError>(), () =>
		EntitySchemaHelper.getSchema(LogEntryError)
	);
}
