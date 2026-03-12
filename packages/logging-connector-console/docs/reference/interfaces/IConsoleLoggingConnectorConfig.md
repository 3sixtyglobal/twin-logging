# Interface: IConsoleLoggingConnectorConfig

Configuration for the Console Logging Connector.

## Extends

- `ILoggingLevelsConfig`

## Properties

### translateMessages? {#translatemessages}

> `optional` **translateMessages**: `boolean`

Translate message using the current locale.

***

### hideGroups? {#hidegroups}

> `optional` **hideGroups**: `boolean`

Hide the group display.

***

### levels? {#levels}

> `optional` **levels**: `LogLevel`[]

The log levels to display, will default to all.

#### Inherited from

`ILoggingLevelsConfig.levels`
