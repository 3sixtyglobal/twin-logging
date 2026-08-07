# Class: OpenTelemetryLoggingConnector

Class for performing logging operations using OpenTelemetry.

## Implements

- `ILoggingConnector`

## Constructors

### Constructor

> **new OpenTelemetryLoggingConnector**(`options?`): `OpenTelemetryLoggingConnector`

Create a new instance of OpenTelemetryLoggingConnector.

#### Parameters

##### options?

[`IOpenTelemetryLoggingConnectorConstructorOptions`](../interfaces/IOpenTelemetryLoggingConnectorConstructorOptions.md)

The options for the logging connector.

#### Returns

`OpenTelemetryLoggingConnector`

## Properties

### NAMESPACE {#namespace}

> `readonly` `static` **NAMESPACE**: `string` = `"open-telemetry"`

The namespace for the logging connector.

***

### CLASS\_NAME {#class_name}

> `readonly` `static` **CLASS\_NAME**: `string`

Runtime name for the class.

## Methods

### className() {#classname}

> **className**(): `string`

Returns the class name of the component.

#### Returns

`string`

The class name of the component.

#### Implementation of

`ILoggingConnector.className`

***

### start() {#start}

> **start**(`nodeLoggingComponentType?`): `Promise`\<`void`\>

Validate the configured exporters and mark the connector as running.
LoggerProvider instances are created lazily on the first log() call per tenant context.
Calling start() on a connector that has already been started is a no-op.

#### Parameters

##### nodeLoggingComponentType?

`string`

The node logging component type.

#### Returns

`Promise`\<`void`\>

A promise that resolves when the connector is ready to receive log entries.

#### Implementation of

`ILoggingConnector.start`

***

### stop() {#stop}

> **stop**(`nodeLoggingComponentType?`): `Promise`\<`void`\>

Shut down all LoggerProvider instances and release resources.
Each provider flushes its buffered records before tearing down.
Calling stop() on a connector that has not been started is a no-op.

#### Parameters

##### nodeLoggingComponentType?

`string`

The node logging component type.

#### Returns

`Promise`\<`void`\>

A promise that resolves when all LoggerProviders have shut down.

#### Implementation of

`ILoggingConnector.stop`

***

### log() {#log}

> **log**(`logEntry`): `Promise`\<`void`\>

Log an entry to the connector.
The current ContextIdStore context is read on every call. A dedicated Logger backed by a
LoggerProvider whose Resource carries the context IDs (tenant, node, etc.) is resolved or
created for that context, ensuring every emitted OTel log record is stamped with the
correct tenant attributes automatically.

#### Parameters

##### logEntry

`ILogEntry`

The entry to log.

#### Returns

`Promise`\<`void`\>

A promise that resolves when the entry has been emitted.

#### Implementation of

`ILoggingConnector.log`
