// Copyright 2024 IOTA Stiftung.
// SPDX-License-Identifier: Apache-2.0.
import { Factory } from "@twin.org/core";
import type { ILoggingConnector } from "../models/ILoggingConnector.js";

/**
 * Factory for creating logging connectors.
 */
// eslint-disable-next-line @typescript-eslint/naming-convention
export const LoggingConnectorFactory = Factory.createFactory<ILoggingConnector>("logging");
