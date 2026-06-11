# Interface: IEntityStorageLoggingConnectorConstructorOptions

The options for the entity storage logging connector.

## Properties

### logEntryStorageConnectorType? {#logentrystorageconnectortype}

> `optional` **logEntryStorageConnectorType?**: `string`

The type of the entity storage connector to use.

#### Default

```ts
log-entry
```

***

### platformComponentType? {#platformcomponenttype}

> `optional` **platformComponentType?**: `string`

The type of the platform component to use for partitioning.

#### Default

```ts
platform
```

***

### config? {#config}

> `optional` **config?**: [`IEntityStorageLoggingConnectorConfig`](IEntityStorageLoggingConnectorConfig.md)

The configuration for the entity storage logging connector.
