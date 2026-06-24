# Logging Models Examples

Use these examples to compose connectors, fan out entries, and translate message keys into locale-aware text.

## MultiLoggingConnector

```typescript
import {
  LoggingConnectorFactory,
  MultiLoggingConnector,
  SilentLoggingConnector,
  type ILogEntry,
  type ILoggingConnector
} from '@twin.org/logging-models';

class CaptureConnector implements ILoggingConnector {
  public readonly entries: ILogEntry[] = [];

  public className(): string {
    return 'CaptureConnector';
  }

  public async log(logEntry: ILogEntry): Promise<void> {
    this.entries.push(logEntry);
  }

  public async query(): Promise<{ entities: Partial<ILogEntry>[]; cursor?: string }> {
    return {
      entities: this.entries
    };
  }
}

LoggingConnectorFactory.register('silent', () => new SilentLoggingConnector());
LoggingConnectorFactory.register('capture', () => new CaptureConnector());

const connector = new MultiLoggingConnector({
  loggingConnectorTypes: ['capture', 'silent'],
  config: {
    levels: ['info', 'error']
  }
});

const className = connector.className();

await connector.log({
  level: 'info',
  source: 'orders',
  message: 'orderCreated',
  data: {
    orderId: 'ord-01',
    lineCount: 3
  }
});
```

```typescript
import {
  ComparisonOperator,
  LogicalOperator,
  SortDirection,
  type EntityCondition
} from '@twin.org/entity';
import { MultiLoggingConnector, type ILogEntry } from '@twin.org/logging-models';

const connector = new MultiLoggingConnector({
  loggingConnectorTypes: ['silent']
});

const conditions: EntityCondition<ILogEntry> = {
  logicalOperator: LogicalOperator.And,
  conditions: [
    {
      property: 'source',
      comparison: ComparisonOperator.Equals,
      value: 'orders'
    }
  ]
};

const queryResult = await connector.query(
  conditions,
  [{ property: 'ts', sortDirection: SortDirection.Descending }],
  ['level', 'source', 'message', 'ts'],
  'cursor-2',
  10
);
```

## SilentLoggingConnector

```typescript
import { SilentLoggingConnector } from '@twin.org/logging-models';

const connector = new SilentLoggingConnector();

const className = connector.className();

await connector.log({
  level: 'warn',
  source: 'batch-job',
  message: 'retryScheduled',
  data: {
    delayMs: 5000
  }
});
```

```typescript
import { SilentLoggingConnector } from '@twin.org/logging-models';
import { ComparisonOperator, LogicalOperator, SortDirection } from '@twin.org/entity';

const connector = new SilentLoggingConnector();

const queryResult = await connector.query(
  {
    logicalOperator: LogicalOperator.And,
    conditions: [
      {
        property: 'level',
        comparison: ComparisonOperator.Equals,
        value: 'warn'
      }
    ]
  },
  [{ property: 'ts', sortDirection: SortDirection.Descending }],
  ['level', 'source', 'message', 'ts'],
  'cursor-0',
  5
);
```

## LogEntryHelper

```typescript
import { LogEntryHelper, type ILogEntry } from '@twin.org/logging-models';

const logEntry: ILogEntry = {
  level: 'info',
  source: 'order-service',
  message: 'orderCreated',
  data: {
    orderId: 'ord-77'
  }
};

const translated = LogEntryHelper.translate(logEntry);
```
