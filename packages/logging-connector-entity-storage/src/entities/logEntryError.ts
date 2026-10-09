// Copyright 2024 IOTA Stiftung.
// SPDX-License-Identifier: Apache-2.0.
import { entity, property } from "@3sixty/entity";

/**
 * Entity representing a flattened error captured within a log entry.
 */
@entity()
export class LogEntryError {
	/**
	 * The name for the error.
	 */
	@property({ type: "string", maxLength: 256 })
	public name!: string;

	/**
	 * The message for the error.
	 */
	@property({ type: "string", maxLength: 4096 })
	public message!: string;

	/**
	 * The source of the error.
	 */
	@property({ type: "string", maxLength: 256, optional: true })
	public source?: string;

	/**
	 * Any additional information for the error.
	 */
	@property({ type: "object", optional: true })
	public properties?: {
		[id: string]: unknown;
	};

	/**
	 * The stack trace for the error.
	 */
	@property({ type: "string", optional: true })
	public stack?: string;
}
