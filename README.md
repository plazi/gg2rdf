# gg2rdf

Pipeline to transform GoldenGate XML into RDF.

This Docker Image exposes a server on port `4505` which:

- listens for github webhooks (`POST` requests) from the configured source repo
  (`plazi/treatments-xml`)
- processes the changed files to generate rdf
- pushes these into the configured target repo (`plazi/treatments-rdf`)

This webserver also exposes the follwing paths:

- `/status`: Serves a Badge (svg) to show the current pipeline status
- `/workdir/jobs/`: List of runs
- `/workdir/jobs/[id]/status.json`: Status of run with that id
- `/workdir/jobs/[id]/log.txt`: Log of run with that id
- `/update?from=[from-commit-id]&till=[till-commit-id]`: send a `POST` here to
  update all files modified since from-commit-id up till-commit-id or HEAD if
  not specified
- `/full_update`: send a `POST` here to run the full_update script. Note that
  this will not delete any files (yet).

## Usage

Build as a docker container.

```sh
docker build . -t gg2rdf
```

Requires a the environment-variable `GHTOKEN` as
`username:<personal-acces-token>` to authenticate the pushing into the
target-repo.

Then run using a volume

```sh
docker run --name gg2rdf --env GHTOKEN=username:<personal-acces-token> -p 4505:4505 -v gg2rdf:/app/workdir gg2rdf
```

Exposes port `4505`.

### Docker-Compose

```yml
services:
  gg2rdf:
    ...
    environment:
      - GHTOKEN=username:<personal-acces-token>
    volumes:
      - gg2rdf:/app/workdir
volumes:
  gg2rdf:
```

## Configuration

Edit the file `config/config.ts`. Should be self-explanatory what goes where.

## Development

The repo comes with vscode devcontaioner configurations. Some tweaks to allow
using git from inside the devcontainer.

To start from the terminal in vscode:

    set -a; source .env; set +a; deno run -A src/main.ts
