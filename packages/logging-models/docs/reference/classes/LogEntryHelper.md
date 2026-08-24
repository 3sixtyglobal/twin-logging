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

***

### getMessageKey() {#getmessagekey}

> `static` **getMessageKey**(`logEntry`): `string` \| `undefined`

Gets the dictionary key that would be used to translate the log entry message.

#### Parameters

##### logEntry

[`ILogEntry`](../interfaces/ILogEntry.md)

The log entry to find the translation key for.

#### Returns

`string` \| `undefined`

The matching dictionary key, or undefined if no matching translation key exists.
