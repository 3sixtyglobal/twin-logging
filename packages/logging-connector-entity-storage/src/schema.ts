// Copyright 2024 IOTA Stiftung.
// SPDX-License-Identifier: Apache-2.0.
import { EntitySchemaFactory, EntitySchemaHelper } from "@twin.org/entity";
import { nameof } from "@twin.org/nameof";
import { LogEntry } from "./entities/logEntry.js";
import { LogEntryError } from "./entities/logEntryError.js";

/**
 * Initialize the schema for the logging connector entity storage.
 */
export function initSchema(): void {
	EntitySchemaFactory.register(nameof<LogEntry>(), () => EntitySchemaHelper.getSchema(LogEntry));
	EntitySchemaFactory.register(nameof<LogEntryError>(), () =>
		EntitySchemaHelper.getSchema(LogEntryError)
	);
}
