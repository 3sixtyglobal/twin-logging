# Logging Rest Client Examples

These snippets show how to send entries to an HTTP endpoint and query filtered log data for operational dashboards.

## LoggingRestClient

```typescript
import { LoggingRestClient } from '@twin.org/logging-rest-client';

const client = new LoggingRestClient({
  endpoint: 'https://api.example.com'
});

const className = client.className();

await client.log({
  level: 'info',
  source: 'payment-service',
  message: 'authorisationAccepted',
  data: {
    paymentId: 'pay-1024',
    amount: 1999,
    currency: 'GBP'
  }
});
```

```typescript
import { LoggingRestClient } from '@twin.org/logging-rest-client';

const client = new LoggingRestClient({
  endpoint: 'https://api.example.com'
});

const queryResult = await client.query(
  'error',
  'payment-service',
  Date.now() - 60 * 60 * 1000,
  Date.now(),
  'cursor-13',
  50
);
```
