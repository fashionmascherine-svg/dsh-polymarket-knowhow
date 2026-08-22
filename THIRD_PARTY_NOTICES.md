# Third-party notices

This package contains material derived from the following projects. All are MIT licensed.

## atompilot/polymarket-skill

The bundled knowledge modules under `knowledge/` are adapted from
[polymarket-skill](https://github.com/atompilot/polymarket-skill)
(MIT License © atompilot), which distills Polymarket's official developer
documentation into skill modules. Each adapted file carries an attribution
header. Corrections and new modules in this distribution were verified
against docs.polymarket.com OpenAPI specs and live API responses on the
release date.

## DeepSeek Harness

Developed as a [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness)
plugin bundle. Peer dependencies (`@deepseek-ai/cordis`, `@deepseek-ai/dsh-tools`,
`@deepseek-ai/dsh-skill`, `@deepseek-ai/schemastery`) are provided by the host
installation and are not distributed here.

## Optional runtime dependency

Order placement delegates to [`@polymarket/clob-client`](https://github.com/Polymarket/python-clob-client)
(TypeScript SDK, MIT © Polymarket) when installed by the deployment. It is an
optional integration and is not bundled.
