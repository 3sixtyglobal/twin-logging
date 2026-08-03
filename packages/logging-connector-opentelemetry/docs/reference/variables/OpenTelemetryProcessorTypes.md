# Variable: OpenTelemetryProcessorTypes

> `const` **OpenTelemetryProcessorTypes**: `object`

The types of log record processors.

## Type Declaration

### Batch {#batch}

> `readonly` **Batch**: `"batch"` = `"batch"`

Accumulates records and flushes on a schedule or when the buffer fills.

### Simple {#simple}

> `readonly` **Simple**: `"simple"` = `"simple"`

Exports each record as it is emitted, useful for tests and local development.
