#!/usr/bin/fish

# argv: [path to xml file]

# config
set xmlDir "../plazi-playground/treatments-xml/data"
set ttlReferenceDir "../plazi-playground/treatments-rdf/data"
set tmpDir "../plazi-playground/noxslt"

set xml {$argv[1]}
set ref (string replace {$xmlDir} {$ttlReferenceDir} (path change-extension ttl $xml))

if test ! -e {$ref}
  echo "File $ref doesn't exist! Aborting"
  exit 1
end

deno run --allow-write --allow-read src/gg2rdf.ts -i {$xml} -o {$tmpDir}/test.ttl
rapper -rq -i turtle {$tmpDir}/test.ttl | sort > {$tmpDir}/test.n3
rapper -rq -i turtle {$ref} | sort > {$tmpDir}/ref.n3

# all lines unique to {$tmpDir}/ref.n3
comm -23 {$tmpDir}/ref.n3 {$tmpDir}/test.n3

# all changed lines
# comm -3 {$tmpDir}/ref.n3 {$tmpDir}/test.n3
