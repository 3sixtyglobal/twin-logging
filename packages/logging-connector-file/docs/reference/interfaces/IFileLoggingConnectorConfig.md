# Interface: IFileLoggingConnectorConfig

Configuration for the File Logging Connector.

## Extends

- `ILoggingLevelsConfig`

## Properties

### directory {#directory}

> **directory**: `string`

The directory in which the log files are written, created if it does not exist.

***

### filename? {#filename}

> `optional` **filename?**: `string`

The name of the active log file within the directory.

#### Default

```ts
app.log
```

***

### maxFileSizeBytes? {#maxfilesizebytes}

> `optional` **maxFileSizeBytes?**: `number`

The maximum size in bytes the active log file can reach before it is rotated.
A value of 0 or less disables size based rotation, allowing the file to grow without bound.
A positive value below the minimum of 102400 (100 KB) throws on construction, to avoid
excessive rotation.

#### Default

```ts
10485760
```

***

### maxRetainedFiles? {#maxretainedfiles}

> `optional` **maxRetainedFiles?**: `number`

The maximum number of rotated log files to retain alongside the active file.
When the limit is reached the oldest rotated file is removed.
A value of 0 or less retains no rotated files, the active file is discarded on rotation.

#### Default

```ts
5
```

***

### mutexTimeoutMs? {#mutextimeoutms}

> `optional` **mutexTimeoutMs?**: `number`

The timeout in milliseconds to wait when acquiring the write lock before a log call fails.
Defaults to the Mutex default when not set.

***

### levels? {#levels}

> `optional` **levels?**: `LogLevel`[]

The log levels to display, will default to all.

#### Inherited from

`ILoggingLevelsConfig.levels`
