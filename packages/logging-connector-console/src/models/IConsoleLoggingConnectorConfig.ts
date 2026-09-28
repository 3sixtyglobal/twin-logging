// Copyright 2024 IOTA Stiftung.
// SPDX-License-Identifier: Apache-2.0.
import type { ILoggingLevelsConfig } from "@twin.org/logging-models";

/**
 * Configuration for the Console Logging Connector.
 */
export interface IConsoleLoggingConnectorConfig extends ILoggingLevelsConfig {
	/**
	 * Translate message using the current locale.
	 */
	translateMessages?: boolean;

	/**
	 * Hide the group display.
	 */
	hideGroups?: boolean;

	/**
	 * Disable colour in the output.
	 * @default false
	 */
	disableColor?: boolean;
}
