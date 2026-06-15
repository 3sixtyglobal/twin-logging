// Copyright 2024 IOTA Stiftung.
// SPDX-License-Identifier: Apache-2.0.
import type { IRestRouteEntryPoint } from "@twin.org/api-models";
import { generateRestRoutesLogging, tagsLogging } from "./loggingRoutes.js";

/**
 * REST entry points for the logging service.
 */
export const restEntryPoints: IRestRouteEntryPoint[] = [
	{
		name: "logging",
		defaultBaseRoute: "logging",
		tags: tagsLogging,
		generateRoutes: generateRestRoutesLogging
	}
];
