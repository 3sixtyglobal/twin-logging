# Class: LogEntryV0

Entity representing a persisted log entry, version 0.

## Constructors

### Constructor

> **new LogEntryV0**(): `LogEntryV0`

#### Returns

`LogEntryV0`

## Properties

### id {#id}

> **id**: `string`

The id.

***

### level {#level}

> **level**: `LogLevel`

The level of the error being logged.

***

### source {#source}

> **source**: `string`

The source of the log entry.

***

### ts {#ts}

> **ts**: `number`

The timestamp of the log entry.

***

### message {#message}

> **message**: `string`

The message.

***

### error? {#error}

> `optional` **error?**: [`LogEntryError`](LogEntryError.md)[]

Associated error data.

***

### data? {#data}

> `optional` **data?**: `object`

Data for the message.

#### Index Signature

\[`key`: `string`\]: `unknown`
