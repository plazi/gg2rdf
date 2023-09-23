# gg2rdf

Pipeline to transform GoldenGate XML into RDF.

This Docker Image exposes a server on port `4505` which:

- listens for github webhooks (`POST` requests) from the configured source repo
  (`plazi/treatments-xml`)
- processes the changed files to generate rdf
- pushes these into the configured target repo (`plazi/treatments-rdf`)

This webserver also exposes the follwing paths:

- `/status`: Serves a Badge (svg) to show the current pipeline status
- `/logs`: List of logs of past runs
- `/logs/[id]`: Log of past run with that id.
- `/full_update`: send a `POST` here to run the full_update script. (Not
  implemented yet, continue using the scripts in the "manual run" directory)

## Usage

Build and run as a docker container.

Exposes port `4505`.

## Configuration

Edit the file `config/config.ts`. Should be self-explanatory what goes where.
