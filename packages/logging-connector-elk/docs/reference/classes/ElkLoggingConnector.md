# Class: ElkLoggingConnector

Class for performing logging operations to an Elasticsearch endpoint.

Entries are converted to Elasticsearch documents and delivered through the bulk API, which
keeps one HTTP round trip per batch. Batching is on by default; a flush is triggered by the
size threshold or when the interval timer is reached, stop() flushes whatever is still pending.
A size triggered flush runs detached, so log() never waits on the network.

A bulk request that fails outright returns the whole batch to the cache for the next attempt.
When the response reports per item failures only the transient ones are delivered again;
documents Elasticsearch rejects permanently are dropped, as repeating them would hold up every
entry behind them forever. While deliveries are failing the size threshold stops scheduling
flushes, so a struggling cluster sees one retry per interval rather than one per logging call.
The cache is bounded by maxCacheSize and the oldest entries are discarded first once it is
full, which is where entries are lost if the cluster stays unreachable.

## Implements

- `ILoggingConnector`

## Constructors

### Constructor

> **new ElkLoggingConnector**(`options`): `ElkLoggingConnector`

Create a new instance of ElkLoggingConnector.

#### Parameters

##### options

[`IElkLoggingConnectorConstructorOptions`](../interfaces/IElkLoggingConnectorConstructorOptions.md)

The options for the logging connector.

#### Returns

`ElkLoggingConnector`

#### Throws

GeneralError if the authentication options are conflicting or incomplete.

## Properties

### NAMESPACE {#namespace}

> `readonly` `static` **NAMESPACE**: `string` = `"elk"`

The namespace for the logging connector.

***

### CLASS\_NAME {#class_name}

> `readonly` `static` **CLASS\_NAME**: `string`

Runtime name for the class.

***

### DEFAULT\_INDEX\_NAME {#default_index_name}

> `readonly` `static` **DEFAULT\_INDEX\_NAME**: `string` = `"twin-logs"`

Default name for the index documents are written to.

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

### DEFAULT\_TIMEOUT\_MS {#default_timeout_ms}

> `readonly` `static` **DEFAULT\_TIMEOUT\_MS**: `number` = `30000`

Default timeout in milliseconds for a bulk request.

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

When batching is active the document is held in memory until a flush is triggered by
the size threshold or the interval timer; otherwise it is delivered immediately and
a delivery failure is thrown to the caller. A size triggered flush runs detached,
so this call never waits on the network.

#### Parameters

##### logEntry

`ILogEntry`

The entry to log.

#### Returns

`Promise`\<`void`\>

A promise that resolves when the entry is accepted (delivered or enqueued).

#### Throws

GeneralError if batching is disabled and the delivery fails.

#### Implementation of

`ILoggingConnector.log`

***

### flush() {#flush}

> **flush**(): `Promise`\<`void`\>

Deliver the cached documents to Elasticsearch in bulk requests. On return every entry cached
when this was called has been delivered, dropped as permanently rejected, or put back in the
cache after a failed delivery.

#### Returns

`Promise`\<`void`\>

A promise that resolves when those entries have been delivered.
