# Function: loggingCreate()

> **loggingCreate**(`httpRequestContext`, `componentName`, `request`): `Promise`\<`INoContentResponse`\>

Create a new log entry.

## Parameters

### httpRequestContext

`IHttpRequestContext`

The request context for the API.

### componentName

`string`

The name of the component to use in the routes.

### request

`ILoggingCreateRequest`

The request.

## Returns

`Promise`\<`INoContentResponse`\>

A promise that resolves to a no-content response when the entry has been logged.
