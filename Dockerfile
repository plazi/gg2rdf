FROM denoland/deno:1.43.3

# Install cron
RUN DEBIAN_FRONTEND=noninteractive apt update
RUN DEBIAN_FRONTEND=noninteractive apt install -y git openjdk-17-jre-headless
RUN git config --system http.postBuffer 1048576000
RUN git config --system --add safe.directory /workspaces/gg2rdf

# The port that your application listens to.
EXPOSE 4505

WORKDIR /app

# Prefer not to run as root.
# USER deno

ADD apache-jena-5.0.0-rc1.tar.gz jena

# Cache the dependencies as a layer (the following two steps are re-run only when deps.ts is modified).
# Ideally cache deps.ts will download and compile _all_ external files used in main.ts.
COPY src/deps.ts src/deps.ts
ADD deno.json deno.json
RUN deno cache --config deno.json src/deps.ts

# These steps will be re-run upon each file change in your working directory:
ADD config config
ADD src src

# Compile the main app so that it doesn't need to be compiled each startup/entry.
RUN deno cache  --config deno.json src/main.ts

CMD ["run", "--allow-net", "--allow-read", "--allow-write", "--allow-run", "--allow-env", "src/main.ts"]
