# Logging Service Examples

Use these examples to route application logs through a configurable connector and query recent entries for troubleshooting.

## LoggingService

```typescript
import {
  LoggingConnectorFactory,
  type ILogEntry,
  type ILoggingConnector
} from '@twin.org/logging-models';
import { LoggingService } from '@twin.org/logging-service';

class MemoryLoggingConnector implements ILoggingConnector {
  private readonly entries: ILogEntry[] = [];

  public className(): string {
    return 'MemoryLoggingConnector';
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

LoggingConnectorFactory.register('logging', () => new MemoryLoggingConnector());

const service = new LoggingService();

const className = service.className();

await service.log({
  level: 'warn',
  source: 'worker-pool',
  message: 'queueDepthHigh',
  data: {
    depth: 125,
    threshold: 100
  }
});
```

```typescript
import {
  LoggingConnectorFactory,
  type ILogEntry,
  type ILoggingConnector
} from '@twin.org/logging-models';
import { LoggingService } from '@twin.org/logging-service';

class QueryableMemoryConnector implements ILoggingConnector {
  private readonly entries: ILogEntry[] = [
    {
      level: 'error',
      source: 'worker-pool',
      ts: Date.now() - 2_000,
      message: 'jobTimedOut'
    },
    {
      level: 'info',
      source: 'worker-pool',
      ts: Date.now() - 1_000,
      message: 'jobCompleted'
    }
  ];

  public className(): string {
    return 'QueryableMemoryConnector';
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

LoggingConnectorFactory.register('logging', () => new QueryableMemoryConnector());

const service = new LoggingService();

const queryResult = await service.query(
  'error',
  'worker-pool',
  Date.now() - 60_000,
  Date.now(),
  'cursor-21',
  20
);
```
