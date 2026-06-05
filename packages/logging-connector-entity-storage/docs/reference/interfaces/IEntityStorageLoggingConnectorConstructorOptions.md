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

### tenantComponentType? {#tenantcomponenttype}

> `optional` **tenantComponentType?**: `string`

The type of the tenant component to use for partitioning.

#### Default

```ts
tenant
```

***

### config? {#config}

> `optional` **config?**: [`IEntityStorageLoggingConnectorConfig`](IEntityStorageLoggingConnectorConfig.md)

The configuration for the entity storage logging connector.
