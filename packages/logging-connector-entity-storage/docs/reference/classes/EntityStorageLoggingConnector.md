# Class: EntityStorageLoggingConnector

Class for performing logging operations in entity storage.

## Implements

- `ILoggingConnector`

## Constructors

### Constructor

> **new EntityStorageLoggingConnector**(`options?`): `EntityStorageLoggingConnector`

Create a new instance of EntityStorageLoggingConnector.

#### Parameters

##### options?

[`IEntityStorageLoggingConnectorConstructorOptions`](../interfaces/IEntityStorageLoggingConnectorConstructorOptions.md)

The options for the connector.

#### Returns

`EntityStorageLoggingConnector`

## Properties

### NAMESPACE {#namespace}

> `readonly` `static` **NAMESPACE**: `string` = `"entity-storage"`

The namespace for the logging connector.

***

### CLASS\_NAME {#class_name}

> `readonly` `static` **CLASS\_NAME**: `string`

Runtime name for the class.

***

### DEFAULT\_BATCH\_SIZE {#default_batch_size}

> `readonly` `static` **DEFAULT\_BATCH\_SIZE**: `number` = `10`

Default number of entries to accumulate before flushing.

***

### DEFAULT\_BATCH\_INTERVAL\_MS {#default_batch_interval_ms}

> `readonly` `static` **DEFAULT\_BATCH\_INTERVAL\_MS**: `number` = `5000`

Default interval in milliseconds between automatic flushes.

***

### DEFAULT\_MAX\_CACHE\_SIZE {#default_max_cache_size}

> `readonly` `static` **DEFAULT\_MAX\_CACHE\_SIZE**: `number` = `1000`

Default maximum number of entries to hold in the in-memory cache.

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

> **start**(): `Promise`\<`void`\>

Start the connector; sets up the interval timer when batchIntervalMs is configured.
The timer is also started lazily by the first batched write if this method is not called.

#### Returns

`Promise`\<`void`\>

Nothing.

#### Implementation of

`ILoggingConnector.start`

***

### stop() {#stop}

> **stop**(): `Promise`\<`void`\>

Stop the connector; flushes any remaining cached entries and clears the timer.

#### Returns

`Promise`\<`void`\>

Nothing.

#### Implementation of

`ILoggingConnector.stop`

***

### log() {#log}

> **log**(`logEntry`): `Promise`\<`void`\>

Log an entry to the connector.

When batching is active the entry is held in memory until a flush is triggered
by the size threshold or the interval timer; otherwise it is written immediately.

#### Parameters

##### logEntry

`ILogEntry`

The entry to log.

#### Returns

`Promise`\<`void`\>

Nothing.

#### Implementation of

`ILoggingConnector.log`

***

### query() {#query}

> **query**(`conditions?`, `sortProperties?`, `properties?`, `cursor?`, `limit?`): `Promise`\<\{ `entities`: `Partial`\<`ILogEntry`\>[]; `cursor?`: `string`; \}\>

Query the log entries.
Any pending batched entries are flushed before the query executes so results are always current.

#### Parameters

##### conditions?

`EntityCondition`\<`ILogEntry`\>

The conditions to match for the entities.

##### sortProperties?

`object`[]

The optional sort order.

##### properties?

keyof `ILogEntry`[]

The optional keys to return, defaults to all.

##### cursor?

`string`

The cursor to request the next chunk of entities.

##### limit?

`number`

Limit the number of entities to return.

#### Returns

`Promise`\<\{ `entities`: `Partial`\<`ILogEntry`\>[]; `cursor?`: `string`; \}\>

All the entities for the storage matching the conditions,
and a cursor which can be used to request more entities.

#### Implementation of

`ILoggingConnector.query`

***

### flush() {#flush}

> **flush**(): `Promise`\<`void`\>

Write all cached entries to storage and clear the cache.
Entries sharing the same tenant context are grouped into a single setBatch call.
If the mutex cannot be acquired the call returns without writing.
On a storage write failure the entries are returned to the head of the cache for the next attempt.

#### Returns

`Promise`\<`void`\>

Nothing.
