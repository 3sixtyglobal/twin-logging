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

> `readonly` `static` **NAMESPACE**: `string` = `"opentelemetry"`

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

Initialise the LoggerProvider and configured exporters.
Calling start() on a connector that has already been started is a no-op.

#### Parameters

##### nodeLoggingComponentType?

`string`

The node logging component type.

#### Returns

`Promise`\<`void`\>

A promise that resolves when the LoggerProvider is running.

#### Implementation of

`ILoggingConnector.start`

***

### stop() {#stop}

> **stop**(`nodeLoggingComponentType?`): `Promise`\<`void`\>

Shut down the LoggerProvider and release resources.
shutdown() flushes any buffered records before tearing down, so records held by a
batch processor are exported before the process exits.
Calling stop() on a connector that has not been started is a no-op.

#### Parameters

##### nodeLoggingComponentType?

`string`

The node logging component type.

#### Returns

`Promise`\<`void`\>

A promise that resolves when the LoggerProvider has shut down.

#### Implementation of

`ILoggingConnector.stop`

***

### log() {#log}

> **log**(`logEntry`): `Promise`\<`void`\>

Log an entry to the connector.
The entry is mapped to an OpenTelemetry LogRecord and emitted to the LoggerProvider,
which buffers and exports it via the configured exporters. Entries whose level is not
in the configured levels are skipped, as are entries received before start() (or after
stop()) since there is no provider to forward them to.

#### Parameters

##### logEntry

`ILogEntry`

The entry to log.

#### Returns

`Promise`\<`void`\>

A promise that resolves when the entry has been emitted.

#### Implementation of

`ILoggingConnector.log`
