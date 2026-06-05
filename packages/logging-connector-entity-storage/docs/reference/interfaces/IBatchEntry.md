# Interface: IBatchEntry

A pending log entry held in the batch cache, preserving the tenant context
captured at the time log() was called so it can be faithfully replayed on flush.

## Properties

### entity {#entity}

> **entity**: [`LogEntry`](../classes/LogEntry.md)

The storage entity built from the log entry at the time log() was called.

***

### contextIds {#contextids}

> **contextIds**: `IContextIds`

Full context IDs snapshot taken at log() time; used to restore context on flush.

***

### perTenant {#pertenant}

> **perTenant**: `boolean`

True when the entry was produced outside any tenant context and must be
written to every tenant via runPerTenant on flush.
