# Class: FileLoggingConnector

Class for performing logging operations to size-limited files on disk.

Entries are appended to an active file as newline delimited JSON through a file handle
that is opened once and kept open, avoiding an open and close on every write. Each entry
is written straight through to the file so it is durable as soon as log() resolves.
When the active file would exceed the configured size limit it is rotated: the active
file becomes the newest numbered file and any file beyond the retained file limit is
removed, keeping total on-disk usage predictable.

The connector assumes a single writer per file: one instance should own a given log file.
Its own writes and rotations are serialised with a mutex, but it does not coordinate with
other processes or external tools rotating the same file.

## Implements

- `ILoggingConnector`

## Constructors

### Constructor

> **new FileLoggingConnector**(`options`): `FileLoggingConnector`

Create a new instance of FileLoggingConnector.

#### Parameters

##### options

[`IFileLoggingConnectorConstructorOptions`](../interfaces/IFileLoggingConnectorConstructorOptions.md)

The options for the logging connector.

#### Returns

`FileLoggingConnector`

#### Throws

GeneralError if maxFileSizeBytes is a positive value below the minimum.

## Properties

### NAMESPACE {#namespace}

> `readonly` `static` **NAMESPACE**: `string` = `"file"`

The namespace for the logging connector.

***

### CLASS\_NAME {#class_name}

> `readonly` `static` **CLASS\_NAME**: `string`

Runtime name for the class.

***

### DEFAULT\_FILENAME {#default_filename}

> `readonly` `static` **DEFAULT\_FILENAME**: `string` = `"app.log"`

Default name for the active log file.

***

### DEFAULT\_MAX\_FILE\_SIZE\_BYTES {#default_max_file_size_bytes}

> `readonly` `static` **DEFAULT\_MAX\_FILE\_SIZE\_BYTES**: `number`

Default maximum size in bytes of the active log file before rotation (10 MB).

***

### MIN\_MAX\_FILE\_SIZE\_BYTES {#min_max_file_size_bytes}

> `readonly` `static` **MIN\_MAX\_FILE\_SIZE\_BYTES**: `number`

Minimum size in bytes that can be configured for the active log file before rotation (100 KB).

***

### DEFAULT\_MAX\_RETAINED\_FILES {#default_max_retained_files}

> `readonly` `static` **DEFAULT\_MAX\_RETAINED\_FILES**: `number` = `5`

Default number of rotated log files to retain.

## Methods

### className() {#classname}

> **className**(): `string`

Returns the class name of the component.

#### Returns

`string`

The class name of the component.

#### Implementation of

`ILoggingConnector.className`

***

### start() {#start}

> **start**(): `Promise`\<`void`\>

Start the connector; ensures the target directory exists and opens the file handle.

#### Returns

`Promise`\<`void`\>

A promise that resolves when the connector is ready to accept log entries.

#### Implementation of

`ILoggingConnector.start`

***

### stop() {#stop}

> **stop**(): `Promise`\<`void`\>

Stop the connector; closes the file handle, releasing the descriptor.
Calling stop() on a connector that has not been opened is a no-op.

#### Returns

`Promise`\<`void`\>

A promise that resolves when the handle has been closed.

#### Implementation of

`ILoggingConnector.stop`

***

### log() {#log}

> **log**(`logEntry`): `Promise`\<`void`\>

Log an entry to the connector.
The entry is appended to the active file as a single newline delimited JSON record;
when the active file exceeds the configured size limit it is rotated first.

#### Parameters

##### logEntry

`ILogEntry`

The entry to log.

#### Returns

`Promise`\<`void`\>

A promise that resolves when the entry has been written to disk.

#### Implementation of

`ILoggingConnector.log`
