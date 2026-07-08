# TWIN Logging Connector File

File connector for persisting TWIN log events to size-limited files on disk with rotation and retention.

Entries are written as newline delimited JSON through a persistent file handle. The connector assumes a single writer per file: one owner (process) should be responsible for a given log file, as it does not coordinate rotation across separate processes.

## Installation

```shell
npm install @twin.org/logging-connector-file
```

## Examples

Usage of the APIs is shown in the examples [docs/examples.md](docs/examples.md)

## Reference

Detailed reference documentation for the API can be found in [docs/reference/index.md](docs/reference/index.md)

## Changelog

The changes between each version can be found in [docs/changelog.md](docs/changelog.md)
