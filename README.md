# TWIN Logging

This repository provides reusable logging building blocks for applications and services across the TWIN ecosystem. The packages are designed to work together so teams can model log events consistently, route messages to different destinations, and expose or consume logging capabilities through service interfaces.

Together, these components help standardise how operational and domain events are captured, transported, and persisted. This supports clearer observability, easier integration between services, and a more maintainable approach to logging as systems grow.

## Packages

- [logging-models](packages/logging-models/README.md) - Defines shared logging contracts, event shapes, and connector interfaces used across the repository.
- [logging-connector-console](packages/logging-connector-console/README.md) - Sends log events to the console for local development, debugging, and lightweight runtime diagnostics.
- [logging-connector-entity-storage](packages/logging-connector-entity-storage/README.md) - Persists log events to entity storage for durable retention, querying, and downstream processing.
- [logging-connector-opentelemetry](packages/logging-connector-opentelemetry/README.md) - Forwards log events to OpenTelemetry-compatible observability pipelines via OTLP.
- [logging-connector-file](packages/logging-connector-file/README.md) - Persists log events to size-limited files on disk with rotation and retention.
- [logging-connector-elk](packages/logging-connector-elk/README.md) - Delivers log events to an Elasticsearch endpoint using the bulk API for ELK-based observability pipelines.
- [logging-service](packages/logging-service/README.md) - Exposes logging operations through service routes and API contracts for server-side integration.
- [logging-rest-client](packages/logging-rest-client/README.md) - Provides a client for interacting with logging service endpoints from applications and services.

## Contributing

To contribute to this package see the guidelines for building and publishing in [CONTRIBUTING](./CONTRIBUTING.md)
