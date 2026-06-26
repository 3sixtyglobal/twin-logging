# Interface: IOpenTelemetryOtlpExporterConfig

Configuration for an OTLP-over-HTTP log record exporter.
The connector instantiates an OTLPLogExporter from these options in start().

## Properties

### type {#type}

> **type**: `"otlp"`

Type.

***

### endpoint {#endpoint}

> **endpoint**: `string`

The full URL of the OTLP logs endpoint to push records to, e.g.
"http://localhost:4318/v1/logs". Required: a missing endpoint is rejected at start().

***

### headers? {#headers}

> `optional` **headers?**: `object`

Additional headers to attach to each export request, e.g. for authentication.

#### Index Signature

\[`key`: `string`\]: `string`

***

### processor? {#processor}

> `optional` **processor?**: `"batch"` \| `"simple"`

Which log record processor to wrap the exporter with.
"batch" accumulates records and flushes on a schedule or when the buffer fills.
"simple" exports each record as it is emitted (useful for tests and local development).

#### Default

```ts
batch
```

***

### scheduledDelayMs? {#scheduleddelayms}

> `optional` **scheduledDelayMs?**: `number`

The delay interval in milliseconds between two consecutive batch exports.
Only applies when processor is "batch".

#### Default

```ts
5000
```

***

### maxExportBatchSize? {#maxexportbatchsize}

> `optional` **maxExportBatchSize?**: `number`

The maximum number of records exported in a single batch.
Only applies when processor is "batch".

#### Default

```ts
512
```

***

### maxQueueSize? {#maxqueuesize}

> `optional` **maxQueueSize?**: `number`

The maximum number of records held in the queue before records are dropped.
Only applies when processor is "batch".

#### Default

```ts
2048
```

***

### exportTimeoutMs? {#exporttimeoutms}

> `optional` **exportTimeoutMs?**: `number`

How long a single export may run before it is cancelled, in milliseconds.
Only applies when processor is "batch".

#### Default

```ts
30000
```

***

### concurrencyLimit? {#concurrencylimit}

> `optional` **concurrencyLimit?**: `number`

The maximum number of concurrent export requests the exporter will make.

***

### timeoutMs? {#timeoutms}

> `optional` **timeoutMs?**: `number`

How long an OTLP request may run before it times out, in milliseconds.
