# TWIN Logging Connector ELK

ELK connector for delivering TWIN log events to an Elasticsearch endpoint for centralised search, dashboards, and alerting.

Entries are converted to Elasticsearch documents and delivered through the bulk API, so a batch costs one HTTP round trip rather than one per entry. Batching is enabled by default. A Logstash HTTP input can be used as the endpoint instead of Elasticsearch. This connector writes entries but does not implement `query()`.

## Delivery

Each document carries an id assigned when it was logged, so a redelivery after a lost response cannot index it twice. A failed request returns the whole batch to the cache; a response reporting per-item failures returns only the transient ones (429, 5xx) and drops documents the cluster rejects outright.

## Installation

```shell
npm install @twin.org/logging-connector-elk
```

## Examples

Usage of the APIs is shown in the examples [docs/examples.md](docs/examples.md)

## Reference

Detailed reference documentation for the API can be found in [docs/reference/index.md](docs/reference/index.md)

## Changelog

The changes between each version can be found in [docs/changelog.md](docs/changelog.md)
