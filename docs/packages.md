# Logging Packages

## logging-models

The package provides the shared domain contracts for logging across this repository, including the event structures and interfaces that connectors and services depend on. It establishes a consistent foundation so logging components can interoperate without duplicating core definitions.

- [README](../packages/logging-models/README.md)
- [Examples](../packages/logging-models/docs/examples.md)
- [Changelog](../packages/logging-models/docs/changelog.md)

## logging-connector-console

This package provides a console-backed logging connector that is useful during local development and operational debugging. It enables applications to emit structured log events through a straightforward runtime destination with minimal setup.

- [README](../packages/logging-connector-console/README.md)
- [Examples](../packages/logging-connector-console/docs/examples.md)
- [Changelog](../packages/logging-connector-console/docs/changelog.md)

## logging-connector-entity-storage

This package provides an entity-storage-backed logging connector for durable log persistence. It supports scenarios where logs need to be retained, queried, and integrated with broader storage and processing workflows.

- [README](../packages/logging-connector-entity-storage/README.md)
- [Examples](../packages/logging-connector-entity-storage/docs/examples.md)
- [Changelog](../packages/logging-connector-entity-storage/docs/changelog.md)

## logging-connector-opentelemetry

This package provides an OpenTelemetry-backed logging connector that forwards logs to OTLP-compatible observability pipelines, such as an OpenTelemetry Collector and downstream backends. It lets services route logging through the same instrumentation and export path they already use for traces and metrics.

- [README](../packages/logging-connector-opentelemetry/README.md)
- [Examples](../packages/logging-connector-opentelemetry/docs/examples.md)
- [Changelog](../packages/logging-connector-opentelemetry/docs/changelog.md)

## logging-connector-file

This package provides a file-backed logging connector that persists logs to size-limited files on disk with rotation and retention. It suits service-style and self-hosted deployments that need recent operational logs available locally without depending on a remote store, while keeping total on-disk usage predictable.

- [README](../packages/logging-connector-file/README.md)
- [Examples](../packages/logging-connector-file/docs/examples.md)
- [Changelog](../packages/logging-connector-file/docs/changelog.md)

## logging-connector-elk

This package provides an Elasticsearch-backed logging connector that delivers log events through the bulk API for ELK-based observability pipelines.

- [README](../packages/logging-connector-elk/README.md)
- [Examples](../packages/logging-connector-elk/docs/examples.md)
- [Changelog](../packages/logging-connector-elk/docs/changelog.md)

## logging-service

This package provides service-side logging routes and API contract implementations so other components can submit and manage log events through consistent endpoints. It acts as the integration layer between logging clients and logging providers.

- [README](../packages/logging-service/README.md)
- [Examples](../packages/logging-service/docs/examples.md)
- [Changelog](../packages/logging-service/docs/changelog.md)

## logging-rest-client

This package provides a REST client for interacting with logging service endpoints from applications and backend services. It streamlines remote logging integration by encapsulating request and response handling behind a package-level API.

- [README](../packages/logging-rest-client/README.md)
- [Examples](../packages/logging-rest-client/docs/examples.md)
- [Changelog](../packages/logging-rest-client/docs/changelog.md)
