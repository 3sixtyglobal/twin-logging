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

***

### DEFAULT\_RETENTION\_INTERVAL\_MS {#default_retention_interval_ms}

> `readonly` `static` **DEFAULT\_RETENTION\_INTERVAL\_MS**: `number` = `300000`

Default interval in milliseconds between retention cleanup runs, 5 minutes.

***

### DEFAULT\_RETAIN\_FOR\_MS {#default_retain_for_ms}

> `readonly` `static` **DEFAULT\_RETAIN\_FOR\_MS**: `number` = `172800000`

Default age threshold in milliseconds; entries older than this are deleted, 2 days.

***

### DEFAULT\_MAX\_ENTRIES {#default_max_entries}

> `readonly` `static` **DEFAULT\_MAX\_ENTRIES**: `number` = `10000`

Default maximum number of stored entries to keep before the oldest are removed.

***

### DEFAULT\_RETENTION\_BATCH\_SIZE {#default_retention_batch_size}

> `readonly` `static` **DEFAULT\_RETENTION\_BATCH\_SIZE**: `number` = `1000`

Default maximum number of entries to remove per removeBatch call during cleanup.

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

#### Returns

`Promise`\<`void`\>

A promise that resolves when the connector is ready to accept log entries.

#### Implementation of

`ILoggingConnector.start`

***

### stop() {#stop}

> **stop**(): `Promise`\<`void`\>

Stop the connector; flushes any remaining cached entries and clears the timer.

#### Returns

`Promise`\<`void`\>

A promise that resolves when the final flush completes and the timer is cleared.

#### Implementation of

`ILoggingConnector.stop`

***

### log() {#log}

> **log**(`logEntry`): `Promise`\<`void`\>

Log an entry to the connector.

When batching is active the entry is held in memory until a flush is triggered
by the size threshold or the interval timer; otherwise it is written immediately.
A size triggered flush runs detached, so this call never waits on a storage write.

#### Parameters

##### logEntry

`ILogEntry`

The entry to log.

#### Returns

`Promise`\<`void`\>

A promise that resolves when the entry is accepted (written or enqueued).

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

Write the cached entries to storage, grouping entries that share a tenant context into a
single setBatch call. On return every entry cached when this was called has been written,
or put back in the cache after a failed write.

#### Returns

`Promise`\<`void`\>

A promise that resolves when those entries have been written.
