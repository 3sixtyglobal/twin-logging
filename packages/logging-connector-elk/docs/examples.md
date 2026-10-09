# Logging Connector ELK Examples

These examples show how to deliver TWIN log events into an ELK pipeline. Entries are converted
to Elasticsearch documents and sent to the bulk API (`POST /_bulk`) as newline delimited JSON,
so a batch of entries costs a single HTTP round trip. This connector writes entries but does not
implement `query()`; read them back with Kibana or the Elasticsearch search API.

## Basic Setup

Only `endpoint` is required. Elasticsearch is the direct ingestion target; a Logstash HTTP input
that accepts the same bulk payload can be used instead by pointing `endpoint` at it.

```typescript
import { ElkLoggingConnector } from '@3sixty/logging-connector-elk';

const connector = new ElkLoggingConnector({
  config: {
    endpoint: 'http://localhost:9200',
    indexName: 'twin-logs',
    indexDateRolling: true
  }
});

// start() begins the interval timer used for time-based flushes.
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

// Deliver anything still pending, then release the timer.
await connector.stop();
```

## Indexed Document Shape

Each entry becomes one document with a stable field mapping, so Kibana views and Elastic alerts
can be built against fixed names:

```json
{
  "@timestamp": "2026-08-03T09:15:00.000Z",
  "level": "info",
  "source": "api-server",
  "node": "node-1",
  "tenant": "tenant-a",
  "message": "startupComplete",
  "data": { "port": 8080, "environment": "production" },
  "error": [{ "name": "GeneralError", "message": "queue.itemFailed" }]
}
```

`node` and `tenant` come from the `ContextIdStore` context that was active when `log()` was
called. They are read per call, so entries keep their own attribution even though a
batch is flushed later, from a timer or another caller's stack. Entries logged outside any tenant
context omit both fields. `data` and `error` are omitted when not supplied.

## Batching

Batching is on by default: entries accumulate and are flushed when either threshold is reached
first, whichever comes sooner.

```typescript
const connector = new ElkLoggingConnector({
  config: {
    endpoint: 'http://localhost:9200',
    batchSize: 50, // flush once 50 entries are cached, 1 or below disables the size trigger
    batchIntervalMs: 2000, // flush every 2s, 0 or below disables the timer
    maxCacheSize: 5000 // cap on entries held after a failed flush
  }
});
```

A batch that reaches `batchSize` is delivered on a stack of its own, so `log()` returns as soon
as the entry is cached and never waits on the network. Set `batchSize` to 1 and `batchIntervalMs`
to 0 to disable batching entirely, in which case each `log()` call delivers a single-document
bulk request and waits for it. `flush()` can also be called directly, and `stop()` always flushes
what is pending.

## Delivery Failures

Every document is given an id when it is logged and delivered with a `create` action under that
id, so a document that reached the cluster before the response was lost is reported as a conflict
on the next attempt rather than indexed twice.

A **request** that fails — a transport error, a timeout, or a non-success status — means no
document in it reached the cluster, so the whole batch goes back to the head of the cache and is
delivered again.

A **response reporting per-item failures** is handled per document:

| Item status  | Behaviour                                                                                     |
| ------------ | --------------------------------------------------------------------------------------------- |
| 2xx          | Delivered.                                                                                    |
| 409 conflict | Delivered by an earlier attempt, so not sent again.                                           |
| 429, 5xx     | Transient (throttling, etc): sent again.                                                      |
| Other 4xx    | Rejected by the cluster for the document itself, a mapping conflict for example. **Dropped.** |

While deliveries are failing the size threshold stops scheduling flushes, so a struggling cluster
gets one retry per `batchIntervalMs` rather than one request per logging call.

Entries are also dropped, oldest first, when the cache passes `maxCacheSize`. That bound is what stops
an unreachable cluster from growing the cache without limit; set `maxCacheSize` to 0 to keep everything instead.

Set `retryCount` above 1 to have a failed request retried within a single flush, with exponential
backoff from `retryDelayMs`, before the batch is returned to the cache. The retries happen inside
the detached flush, so they do not delay any `log()` call.

## Authentication

API key and basic authentication are both supported, and are mutually exclusive; configuring
both throws. HTTPS endpoints work unchanged.

```typescript
const apiKeyConnector = new ElkLoggingConnector({
  config: {
    endpoint: 'https://elastic.example.com:9200',
    apiKey: 'VnVhQ2ZHY0JDZGJrU...'
  }
});

const basicAuthConnector = new ElkLoggingConnector({
  config: {
    endpoint: 'https://elastic.example.com:9200',
    username: 'elastic',
    password: 'changeme'
  }
});
```

## Composing With Other Connectors

The connector composes through `MultiLoggingConnector` like any other, so entries can go to the
console during development while also being indexed.

```typescript
import { ConsoleLoggingConnector } from '@3sixty/logging-connector-console';
import { LoggingConnectorFactory, MultiLoggingConnector } from '@3sixty/logging-models';

LoggingConnectorFactory.register('console', () => new ConsoleLoggingConnector());
LoggingConnectorFactory.register(
  'elk',
  () => new ElkLoggingConnector({ config: { endpoint: 'http://localhost:9200' } })
);

const multi = new MultiLoggingConnector({
  loggingConnectorTypes: ['console', 'elk']
});
```
