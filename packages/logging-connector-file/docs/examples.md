# Logging Connector File Examples

These examples show how to persist TWIN log events to disk. The connector appends each
entry to an active log file as newline delimited JSON (one JSON object per line), a format
that is easy to inspect, grep, and ingest with external log collection agents.

When the active file reaches the configured size limit it is rotated, and only a configured
number of rotated files are retained, so total on-disk usage stays predictable. This
connector persists entries but does not implement `query()`.

The connector assumes a single writer per file: one instance should own a given log file. It
does not coordinate with separate processes or external tools rotating the same file.

## Basic Setup

Pass a `directory` for the log files to the connector constructor. The directory is created
if it does not already exist.

```typescript
import { FileLoggingConnector } from '@3sixty/logging-connector-file';

const connector = new FileLoggingConnector({
  config: {
    directory: './logs',
    filename: 'app.log',
    maxFileSizeBytes: 10 * 1024 * 1024,
    maxRetainedFiles: 5
  }
});

// start() ensures the directory exists.
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

Each entry is written as a single line, for example:

```text
{"level":"info","source":"api-server","timestamp":"2023-11-14T22:13:20.000Z","message":"startupComplete","data":{"port":8080,"environment":"production"}}
```

The timestamp is populated automatically when not supplied, and an `error` is flattened
into a serialisable array preserving the cause chain.

## Shutting Down

The connector keeps the log file open between writes. Call `stop()` during a graceful
shutdown to close the file handle and release the descriptor. Entries are written straight
through to the file, so there is nothing buffered to lose if `stop()` is not called.

```typescript
await connector.stop();
```

## Rotation and Retention

The active file is always `<filename>`. When a write would take it past `maxFileSizeBytes`,
the existing files are shifted up by one and a fresh active file is started:

```text
app.log    <- active file
app.1.log  <- most recently rotated
app.2.log
...
app.5.log  <- oldest retained (removed on the next rotation)
```

With `maxRetainedFiles` rotated files plus the active file, total on-disk usage is bounded
to roughly `(maxRetainedFiles + 1) * maxFileSizeBytes`. A single entry is
never split across files.

Set `maxFileSizeBytes` to `0` to disable size based rotation, or `maxRetainedFiles` to `0` to
keep no rotated files (the active file is discarded when it rotates). A positive
`maxFileSizeBytes` below 100 KB throws on construction to avoid excessive rotation.

## Filtering Levels

Limit which levels are written with `levels`:

```typescript
const connector = new FileLoggingConnector({
  config: {
    directory: './logs',
    levels: ['warn', 'error']
  }
});
```

## Composing with Other Connectors

The file connector can be combined with other connectors through `MultiLoggingConnector`,
for example to write to disk while also logging to the console:

```typescript
import { LoggingConnectorFactory, MultiLoggingConnector } from '@3sixty/logging-models';
import { ConsoleLoggingConnector } from '@3sixty/logging-connector-console';
import { FileLoggingConnector } from '@3sixty/logging-connector-file';

LoggingConnectorFactory.register('console', () => new ConsoleLoggingConnector());
LoggingConnectorFactory.register(
  'file',
  () => new FileLoggingConnector({ config: { directory: './logs' } })
);

const logging = new MultiLoggingConnector({
  loggingConnectorTypes: ['console', 'file']
});

await logging.log({ level: 'info', source: 'api-server', message: 'ready' });
```
