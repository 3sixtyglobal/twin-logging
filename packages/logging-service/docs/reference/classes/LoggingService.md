# Class: LoggingService

Service for performing logging operations to a connector.

## Implements

- `ILoggingComponent`

## Constructors

### Constructor

> **new LoggingService**(`options?`): `LoggingService`

Create a new instance of LoggingService.

#### Parameters

##### options?

[`ILoggingServiceConstructorOptions`](../interfaces/ILoggingServiceConstructorOptions.md)

The options for the connector.

#### Returns

`LoggingService`

## Properties

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

`ILoggingComponent.className`

***

### log() {#log}

> **log**(`logEntry`): `Promise`\<`void`\>

Log an entry to the connector.

#### Parameters

##### logEntry

`ILogEntry`

The entry to log.

#### Returns

`Promise`\<`void`\>

A promise that resolves when the underlying connector has accepted the entry.

#### Implementation of

`ILoggingComponent.log`

***

### query() {#query}

> **query**(`level?`, `source?`, `timeStart?`, `timeEnd?`, `cursor?`, `limit?`): `Promise`\<\{ `entities`: `ILogEntry`[]; `cursor?`: `string`; \}\>

Query the log entries.

#### Parameters

##### level?

`LogLevel`

The level of the log entries.

##### source?

`string`

The source of the log entries.

##### timeStart?

`number`

The inclusive time as the start of the log entries.

##### timeEnd?

`number`

The inclusive time as the end of the log entries.

##### cursor?

`string`

The cursor to request the next chunk of entities.

##### limit?

`number`

Limit the number of entities to return.

#### Returns

`Promise`\<\{ `entities`: `ILogEntry`[]; `cursor?`: `string`; \}\>

All the entities for the storage matching the conditions,
and a cursor which can be used to request more entities.

#### Implementation of

`ILoggingComponent.query`
