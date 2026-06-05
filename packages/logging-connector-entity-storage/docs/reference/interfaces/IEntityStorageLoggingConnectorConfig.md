# Interface: IEntityStorageLoggingConnectorConfig

Configuration for the Entity Storage Logging Connector.

## Extends

- `ILoggingLevelsConfig`

## Properties

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

Maximum number of entries to hold in the in-memory cache.
When a flush fails, re-queued entries are trimmed to this limit by dropping the oldest first.
Set to 0 to disable the limit.

#### Default

```ts
1000
```

***

### levels? {#levels}

> `optional` **levels?**: `LogLevel`[]

The log levels to display, will default to all.

#### Inherited from

`ILoggingLevelsConfig.levels`
