# Logging Connector OpenTelemetry Examples

These examples show how to forward TWIN log events to an OpenTelemetry pipeline. The
connector maps each entry to an OpenTelemetry `LogRecord` and emits it to a
`LoggerProvider`; the configured exporters then push the records to an OpenTelemetry
Collector (or any OTLP-compatible endpoint), which routes them on to backends such as
Grafana Loki or Datadog.

This connector is a pure forwarder — it does not persist entries and therefore does not
implement `query()`.

## Basic Setup with an OTLP Exporter

Pass an `exporters` config map to the connector constructor. The connector instantiates
the exporter internally when `start()` is called — no manual `LoggerProvider` wiring is
needed. The default batch processor accumulates records and flushes them on a schedule.

```typescript
import { OpenTelemetryLoggingConnector } from '@3sixty/logging-connector-opentelemetry';

const connector = new OpenTelemetryLoggingConnector({
  config: {
    loggerName: 'my-service',
    loggerVersion: '1.0.0',
    resourceAttributes: {
      'service.name': 'my-service'
    },
    exporters: {
      collector: {
        type: 'otlp',
        endpoint: 'http://localhost:4318/v1/logs'
      }
    }
  }
});

// start() initialises the LoggerProvider and exporters.
await connector.start();
```

## Logging Entries

```typescript
await connector.log({
  level: 'info',
  source: 'api-server',
  message: 'startupComplete',
  data: {
    port: 8080,
    environment: 'production'
  }
});

await connector.log({
  level: 'error',
  source: 'worker',
  message: 'jobFailed',
  error: {
    name: 'GeneralError',
    message: 'queue.itemFailed'
  },
  data: {
    jobId: 'job-42',
    retries: 3
  }
});
```

The log level maps to the OpenTelemetry severity (`trace`, `debug`, `info`, `warn`,
`error`), `message` becomes the record body, `source` and scalar `data` values become
attributes, and an `error` is mapped to the `exception.*` semantic-convention attributes.

## Shutting Down

Always call `stop()` during a graceful shutdown. It flushes any records still buffered by
the batch processor before tearing down the provider, so the most recent entries are not
lost when the process exits.

```typescript
await connector.stop();
```

## Filtering Levels and Immediate Export

Limit which levels are forwarded with `levels`, and use the `simple` processor to export
each record as soon as it is emitted (useful for local development, at the cost of more
network round-trips):

```typescript
const connector = new OpenTelemetryLoggingConnector({
  config: {
    levels: ['warn', 'error'],
    exporters: {
      collector: {
        type: 'otlp',
        endpoint: 'http://localhost:4318/v1/logs',
        processor: 'simple'
      }
    }
  }
});

await connector.start();
```
