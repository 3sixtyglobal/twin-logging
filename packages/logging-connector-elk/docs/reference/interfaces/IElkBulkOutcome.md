# Interface: IElkBulkOutcome

The result of one bulk request, describing what the Elasticsearch response said about each document.

## Properties

### retry {#retry}

> **retry**: [`IElkBatchEntry`](IElkBatchEntry.md)[]

The entries Elasticsearch failed on a transient basis, which should be delivered again.

***

### rejected {#rejected}

> **rejected**: `number`

The number of entries Elasticsearch rejected in a way that repeating the request cannot fix.

***

### reason? {#reason}

> `optional` **reason?**: `string`

The reason reported.
