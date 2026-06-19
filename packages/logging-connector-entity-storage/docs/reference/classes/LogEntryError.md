# Class: LogEntryError

Entity representing a flattened error captured within a log entry.

## Constructors

### Constructor

> **new LogEntryError**(): `LogEntryError`

#### Returns

`LogEntryError`

## Properties

### name {#name}

> **name**: `string`

The name for the error.

***

### message {#message}

> **message**: `string`

The message for the error.

***

### source? {#source}

> `optional` **source?**: `string`

The source of the error.

***

### properties? {#properties}

> `optional` **properties?**: `object`

Any additional information for the error.

#### Index Signature

\[`id`: `string`\]: `unknown`

***

### stack? {#stack}

> `optional` **stack?**: `string`

The stack trace for the error.
