# 3Sixty Logging Connector ELK

ELK connector for delivering TWIN log events to an Elasticsearch endpoint for centralised search, dashboards, and alerting.

Entries are converted to Elasticsearch documents and delivered through the bulk API, so a batch costs one HTTP round trip rather than one per entry. Batching is enabled by default. A Logstash HTTP input can be used as the endpoint instead of Elasticsearch. This connector writes entries but does not implement `query()`.

## Docker

```shell
docker run -d --name 3sixty-logging-elasticsearch -p 9200:9200 -e "discovery.type=single-node" -e "xpack.security.enabled=false" -e "ES_JAVA_OPTS=-Xms1g -Xmx1g" -m 2g docker.elastic.co/elasticsearch/elasticsearch:9.4.3
```

Elasticsearch sizes its JVM heap from the memory it can see, which on a smaller Docker host overruns what the daemon will hand out and the container is killed during startup with exit code 137. Pinning the heap to 1g inside a 2g container leaves room for the off-heap usage. If the container is still killed, raise the memory available to Docker itself.

## Installation

```shell
npm install @3sixty/logging-connector-elk
```

## Examples

Usage of the APIs is shown in the examples [docs/examples.md](docs/examples.md)

## Reference

Detailed reference documentation for the API can be found in [docs/reference/index.md](docs/reference/index.md)

## Changelog

The changes between each version can be found in [docs/changelog.md](docs/changelog.md)

## Origin

This package is derived from the original [iotaledger/twin-logging](https://github.com/iotaledger/twin-logging/tree/next/packages/logging-connector-elk) repository.
