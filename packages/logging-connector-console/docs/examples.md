# Logging Connector Console Examples

Use these snippets to wire console logging quickly with practical level filtering and message formatting settings.

## ConsoleLoggingConnector

```typescript
import { ConsoleLoggingConnector } from '@3sixty/logging-connector-console';

const connector = new ConsoleLoggingConnector({
  config: {
    levels: ['info', 'warn', 'error'],
    hideGroups: false,
    translateMessages: false
  }
});

const className = connector.className();

await connector.log({
  level: 'info',
  source: 'api-server',
  message: 'startupComplete',
  data: {
    port: 8080,
    environment: 'production'
  }
});
```

```typescript
import { ConsoleLoggingConnector } from '@3sixty/logging-connector-console';

const connector = new ConsoleLoggingConnector({
  config: {
    levels: ['error'],
    hideGroups: true,
    disableColor: true
  }
});

await connector.log({
  level: 'error',
  source: 'worker',
  message: 'jobFailed',
  error: new Error('Unable to process queue item'),
  data: {
    jobId: 'job-42',
    retries: 3
  }
});
```
