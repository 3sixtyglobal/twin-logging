# 3Sixty Logging Connector OpenTelemetry

OpenTelemetry connector for forwarding TWIN log events to OTEL-compatible observability pipelines (e.g. an OpenTelemetry Collector via OTLP, and on to backends such as Grafana Loki or Datadog).

## Installation

```shell
npm install @3sixty/logging-connector-opentelemetry
```

## Local Development

A local observability backend is required to receive and inspect exported spans. Start the Grafana LGTM stack in Docker:

```shell
docker run -d --name 3sixty-opentelemetry -p 4317:4317 -p 4318:4318 -p 3123:3000 -p 3200:3200 grafana/otel-lgtm
```

Grafana is available at <http://localhost:3123> (credentials: admin/admin). Spans appear in the Tempo data source. Port 3200 exposes the Tempo HTTP query API used by the integration tests.

## Examples

Usage of the APIs is shown in the examples [docs/examples.md](docs/examples.md)

## Reference

Detailed reference documentation for the API can be found in [docs/reference/index.md](docs/reference/index.md)

## Changelog

The changes between each version can be found in [docs/changelog.md](docs/changelog.md)

## Origin

This package is derived from the original [iotaledger/twin-logging](https://github.com/iotaledger/twin-logging/tree/next/packages/logging-connector-opentelemetry) repository.
