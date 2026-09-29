# Interface: IElkBatchEntry

A pending Elasticsearch document held in the batch cache.

## Properties

### id {#id}

> **id**: `string`

The document id.

***

### index {#index}

> **index**: `string`

The index the document is written to.

***

### document {#document}

> **document**: `object`

The document built from the log entry.

#### Index Signature

\[`key`: `string`\]: `unknown`
