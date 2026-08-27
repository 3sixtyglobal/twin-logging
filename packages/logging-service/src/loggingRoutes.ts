// Copyright 2024 IOTA Stiftung.
// SPDX-License-Identifier: Apache-2.0.
import type {
	IRouteAuthorization,
	IHttpRequestContext,
	INoContentResponse,
	IRestRoute,
	ITag
} from "@twin.org/api-models";
import { ComponentFactory, Coerce, Guards } from "@twin.org/core";
import type {
	ILoggingComponent,
	ILoggingCreateRequest,
	ILoggingListRequest,
	ILoggingListResponse
} from "@twin.org/logging-models";
import { nameof } from "@twin.org/nameof";
import { HttpStatusCode } from "@twin.org/web";

/**
 * The source used when communicating about these routes.
 */
const ROUTES_SOURCE = "loggingRoutes";

/**
 * The tag to associate with the routes.
 */
export const tagsLogging: ITag[] = [
	{
		name: "Logging",
		description: "Endpoints which are modelled to access a logging contract."
	}
];

/**
 * The default authorization for the routes, used to seed authorization rules.
 */
const DEFAULT_AUTHORIZATION_READER: IRouteAuthorization = {
	permission: "logging:read",
	role: "devops"
};

const DEFAULT_AUTHORIZATION_WRITER: IRouteAuthorization = {
	permission: "logging:write",
	role: "devops",
	inherits: [DEFAULT_AUTHORIZATION_READER.permission]
};

/**
 * The REST routes for logging.
 * @param baseRouteName Prefix to prepend to the paths.
 * @param componentName The name of the component to use in the routes stored in the ComponentFactory.
 * @returns The generated routes.
 */
export function generateRestRoutesLogging(
	baseRouteName: string,
	componentName: string
): IRestRoute[] {
	const createRoute: IRestRoute<ILoggingCreateRequest, INoContentResponse> = {
		operationId: "loggingEntryCreate",
		summary: "Create a log entry",
		tag: tagsLogging[0].name,
		method: "POST",
		path: `${baseRouteName}/`,
		handler: async (httpRequestContext, request) =>
			loggingCreate(httpRequestContext, componentName, request),
		requestType: {
			type: nameof<ILoggingCreateRequest>(),
			examples: [
				{
					id: "loggingEntryCreateInfoExample",
					request: {
						body: {
							level: "info",
							message: "This is an information message",
							source: "source",
							ts: 1715252922273
						}
					}
				},
				{
					id: "loggingEntryCreateErrorExample",
					request: {
						body: {
							level: "info",
							message: "This is an error message",
							source: "source",
							ts: 1715252922273,
							error: {
								name: "GeneralError",
								message: "component.error",
								properties: {
									foo: "bar"
								}
							}
						}
					}
				}
			]
		},
		responseType: [
			{
				type: nameof<INoContentResponse>()
			}
		],
		defaultAuthorization: DEFAULT_AUTHORIZATION_WRITER
	};

	const listRoute: IRestRoute<ILoggingListRequest, ILoggingListResponse> = {
		operationId: "loggingListEntries",
		summary: "Get a list of the log entries",
		tag: tagsLogging[0].name,
		method: "GET",
		path: `${baseRouteName}/`,
		handler: async (httpRequestContext, request) =>
			loggingList(httpRequestContext, componentName, request),
		requestType: {
			type: nameof<ILoggingListRequest>(),
			examples: [
				{
					id: "loggingListRequestExample",
					request: {
						query: {
							level: "info"
						}
					}
				}
			]
		},
		responseType: [
			{
				type: nameof<ILoggingListResponse>(),
				examples: [
					{
						id: "listResponseExample",
						response: {
							body: {
								entities: [
									{
										level: "info",
										message: "This is an information message",
										source: "source",
										ts: 1715252922273
									}
								],
								cursor: "1"
							}
						}
					}
				]
			}
		],
		defaultAuthorization: DEFAULT_AUTHORIZATION_READER
	};

	return [createRoute, listRoute];
}

/**
 * Create a new log entry.
 * @param httpRequestContext The request context for the API.
 * @param componentName The name of the component to use in the routes.
 * @param request The request.
 * @returns A promise that resolves to a no-content response when the entry has been logged.
 */
export async function loggingCreate(
	httpRequestContext: IHttpRequestContext,
	componentName: string,
	request: ILoggingCreateRequest
): Promise<INoContentResponse> {
	Guards.object<ILoggingCreateRequest>(ROUTES_SOURCE, nameof(request), request);
	Guards.object<ILoggingCreateRequest["body"]>(ROUTES_SOURCE, nameof(request.body), request.body);
	const component = ComponentFactory.get<ILoggingComponent>(componentName);
	await component.log(request.body);
	return {
		statusCode: HttpStatusCode.noContent
	};
}

/**
 * Get a list of the logging entries.
 * @param httpRequestContext The request context for the API.
 * @param componentName The name of the component to use in the routes.
 * @param request The request.
 * @returns A promise that resolves to the matching log entries and an optional pagination cursor.
 */
export async function loggingList(
	httpRequestContext: IHttpRequestContext,
	componentName: string,
	request: ILoggingListRequest
): Promise<ILoggingListResponse> {
	const component = ComponentFactory.get<ILoggingComponent>(componentName);

	const itemsAndCursor = await component.query(
		request?.query?.level,
		request?.query?.source,
		Coerce.number(request?.query?.timeStart),
		Coerce.number(request?.query?.timeEnd),
		request?.query?.cursor,
		Coerce.number(request?.query?.limit)
	);
	return {
		body: itemsAndCursor
	};
}
