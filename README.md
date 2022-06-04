# gg2rdf
A n action to transform golden gate XML to RDF turtle

## Usage

```yaml
- uses: plazi/gg2rdf@v0
  with:
    # Where to take the GGXML from
    # (Repository name with owner. For example, plazi/treatments-xml)
    # Default: ${{ github.repository }}
    source-repo: ""

    # Where to put the generated TTL
    # (Repository name with owner. For example, plazi/treatments-rdf)
    destination-repo: ""
    
    # Deploay key to be passed as `ssh-key` to actions/checkout@v2 for the destination-repo
    deploy-key: ""
```
