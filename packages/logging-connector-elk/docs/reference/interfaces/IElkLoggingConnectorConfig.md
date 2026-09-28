# Interface: IElkLoggingConnectorConfig

Configuration for the ELK Logging Connector.

## Extends

- `ILoggingLevelsConfig`

## Properties

### endpoint {#endpoint}

> **endpoint**: `string`

The base URL of the Elasticsearch endpoint, e.g. http://localhost:9200.

***

### indexName? {#indexname}

> `optional` **indexName?**: `string`

The name of the index documents are written to.

#### Default

```ts
twin-logs
```

***

### indexDateRolling? {#indexdaterolling}

> `optional` **indexDateRolling?**: `boolean`

Append a UTC date suffix to the index name, e.g. twin-logs-2026.08.03, so that
index lifecycle management can roll indices by day.

#### Default

```ts
false
```

***

### apiKey? {#apikey}

> `optional` **apiKey?**: `string`

The API key to authenticate with, sent as an ApiKey authorization header.
Mutually exclusive with username and password.

***

### username? {#username}

> `optional` **username?**: `string`

The user name for basic authentication, requires password.
Mutually exclusive with apiKey.

***

### password? {#password}

> `optional` **password?**: `string`

The password for basic authentication, requires username.
Mutually exclusive with apiKey.

***

### batchSize? {#batchsize}

> `optional` **batchSize?**: `number`

Flush the cache once this many entries have accumulated.
Set to 1 or below to disable size-based flushing.
When combined with batchIntervalMs, whichever threshold is reached first triggers the flush.

#### Default

```ts
10
```

***

### batchIntervalMs? {#batchintervalms}

> `optional` **batchIntervalMs?**: `number`

Flush the cache after this many milliseconds have elapsed since the last flush.
Set to 0 or below to disable time-based flushing.
When combined with batchSize, whichever threshold is reached first triggers the flush.

#### Default

```ts
5000
```

***

### maxCacheSize? {#maxcachesize}

> `optional` **maxCacheSize?**: `number`

Maximum number of entries to hold in the in-memory cache. Set to 0 to disable the limit.

#### Default

```ts
1000
```

***

### timeoutMs? {#timeoutms}

> `optional` **timeoutMs?**: `number`

Timeout in milliseconds for a bulk request.

#### Default

```ts
30000
```

***

### retryCount? {#retrycount}

> `optional` **retryCount?**: `number`

Number of attempts made for a bulk request before the entries are re-queued.

#### Default

```ts
1
```

***

### retryDelayMs? {#retrydelayms}

> `optional` **retryDelayMs?**: `number`

Number of milliseconds to delay before each retry.

***

### levels? {#levels}

> `optional` **levels?**: `LogLevel`[]

The log levels to display, will default to all.

#### Inherited from

`ILoggingLevelsConfig.levels`
