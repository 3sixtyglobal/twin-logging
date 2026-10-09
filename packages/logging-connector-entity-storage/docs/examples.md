# Logging Connector Entity Storage Examples

These examples show how to persist log entries, query them back, and shape the storage entities used by the connector.

## EntityStorageLoggingConnector

```typescript
import { MemoryEntityStorageConnector } from '@3sixty/entity-storage-connector-memory';
import { EntityStorageConnectorFactory } from '@3sixty/entity-storage-models';
import { nameof } from '@3sixty/nameof';
import {
  EntityStorageLoggingConnector,
  initSchema,
  type LogEntry
} from '@3sixty/logging-connector-entity-storage';

initSchema();

EntityStorageConnectorFactory.register(
  'log-entry',
  () =>
    new MemoryEntityStorageConnector<LogEntry>({
      entitySchema: nameof<LogEntry>()
    })
);

const connector = new EntityStorageLoggingConnector({
  config: {
    levels: ['info', 'error']
  }
});

const className = connector.className();

await connector.log({
  level: 'error',
  source: 'ingestion-service',
  message: 'payloadRejected',
  ts: Date.now(),
  data: {
    recordId: 'r-1001',
    reason: 'invalid schema'
  },
  error: new Error('Validation failed')
});
```

```typescript
import {
  ComparisonOperator,
  LogicalOperator,
  SortDirection,
  type EntityCondition
} from '@3sixty/entity';
import type { ILogEntry } from '@3sixty/logging-models';
import { EntityStorageLoggingConnector } from '@3sixty/logging-connector-entity-storage';

const connector = new EntityStorageLoggingConnector();

const conditions: EntityCondition<ILogEntry> = {
  logicalOperator: LogicalOperator.And,
  conditions: [
    {
      property: 'level',
      comparison: ComparisonOperator.Equals,
      value: 'error'
    }
  ]
};

const queryResult = await connector.query(
  conditions,
  [{ property: 'ts', sortDirection: SortDirection.Descending }],
  ['level', 'source', 'message', 'ts'],
  'cursor-1',
  25
);
```

## LogEntry

```typescript
import type { LogEntry } from '@3sixty/logging-connector-entity-storage';

const logEntry: LogEntry = {
  id: '80f9b61a',
  level: 'warn',
  source: 'scheduler',
  ts: Date.now(),
  message: 'slowExecution',
  data: {
    durationMs: 1275,
    thresholdMs: 1000
  }
};
```

## LogEntryError

```typescript
import type { LogEntryError } from '@3sixty/logging-connector-entity-storage';

const logEntryError: LogEntryError = {
  name: 'ValidationError',
  message: 'The payload did not pass validation',
  source: 'payload-validator',
  properties: {
    field: 'age',
    expected: '>= 18'
  },
  stack: 'ValidationError: The payload did not pass validation'
};
```
