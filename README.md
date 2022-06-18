# gg2rdf
This repo provides a GitHub action to transform golden gate XML (GG_XML) to RDF turtle. It also includes an XSLT to transform GG-XML to RDF/XML.

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
    
    # Deploy key to be passed as `ssh-key` to actions/checkout@v2 for the destination-repo
    deploy-key: ""
```
