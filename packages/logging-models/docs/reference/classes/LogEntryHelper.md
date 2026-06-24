# Class: LogEntryHelper

Helper class for log entry operations.

## Constructors

### Constructor

> **new LogEntryHelper**(): `LogEntryHelper`

#### Returns

`LogEntryHelper`

## Methods

### translate() {#translate}

> `static` **translate**(`logEntry`): `string` \| `undefined`

Translates the message of a log entry using the current locale.

#### Parameters

##### logEntry

[`ILogEntry`](../interfaces/ILogEntry.md)

The log entry whose message should be translated.

#### Returns

`string` \| `undefined`

The translated message string, or undefined if no matching translation key exists.
