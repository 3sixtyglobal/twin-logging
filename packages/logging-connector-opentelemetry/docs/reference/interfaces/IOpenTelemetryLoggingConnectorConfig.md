# Interface: IOpenTelemetryLoggingConnectorConfig

Configuration for the OpenTelemetry logging connector.

## Extends

- `ILoggingLevelsConfig`

## Properties

### loggerName? {#loggername}

> `optional` **loggerName?**: `string`

The name of the OpenTelemetry logger used to emit records.

#### Default

```ts
twin-logging
```

***

### loggerVersion? {#loggerversion}

> `optional` **loggerVersion?**: `string`

The version reported by the OpenTelemetry logger.

#### Default

```ts
1.0.0
```

***

### resourceAttributes? {#resourceattributes}

> `optional` **resourceAttributes?**: `object`

Attributes describing the entity producing the logs, attached to the OTEL Resource
so backends can group records by service, e.g. `{ "service.name": "my-service" }`.
Omit for a resource with only the SDK defaults.

#### Index Signature

\[`key`: `string`\]: `string` \| `number` \| `boolean`

***

### exporters? {#exporters}

> `optional` **exporters?**: `object`

Named exporter configurations keyed by an arbitrary id.
Each entry's `type` field determines which exporter the connector instantiates
in start(). Omit or pass an empty object for a no-op provider (useful for tests) -
records are then mapped and emitted but not exported anywhere.

#### Index Signature

\[`id`: `string`\]: [`IOpenTelemetryOtlpExporterConfig`](IOpenTelemetryOtlpExporterConfig.md)

***

### levels? {#levels}

> `optional` **levels?**: `LogLevel`[]

The log levels to display, will default to all.

#### Inherited from

`ILoggingLevelsConfig.levels`
