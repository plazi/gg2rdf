#!/usr/bin/fish

# This is an example fish script to run local transformations

# argv: [path to xml file]
# usage:
# find {$xmlDir} -type f -name '*.xml' -exec ./test_noxslt.fish '{}' \;

# usage (stops after first failure and opens the xml source in vscode)
# find {$xmlDir} -type f -name '*.xml' \( -exec ./test_noxslt.fish '{}' \; -o -exec code '{}' \; -a -quit \)

# config
set xmlDir "../plazi-playground/treatments-xml/data"
set ttlReferenceDir "../plazi-playground/treatments-rdf/data"
set tmpDir "../plazi-playground/noxslt"

# these have been manually determined to be non-errors
# i.e. changes that seem to (if anything) fix something
# set ignore $xmlDir"/00/00/87/000087F6E327FF95FD8CFB7FFAE4FA7B.xml" $xmlDir"/00/01/95/0001958C9E2ECB0BE45661F079449558.xml"

set xml {$argv[1]}

# if contains $xml $ignore
#    exit 0
# end

set ref (string replace {$xmlDir} {$ttlReferenceDir} (path change-extension ttl $xml))

if test ! -e {$ref}
  echo "File $ref doesn't exist! Aborting"
  exit 1
end

deno run --allow-write --allow-read src/gg2rdf.ts -i {$xml} -o {$tmpDir}/test.ttl
rapper -rq -i turtle {$tmpDir}/test.ttl | sort > {$tmpDir}/test.n3
rapper -rq -i turtle {$ref} | sed '/file:\/\/\//d' -  | sed '/hasParentName|creator|ID-CoL/d' - | sed '/hasRepresentation/d' - | sort > {$tmpDir}/ref.n3
# sed to remove all (originally) wrong links with missing baseUri
# also ignore all changes due to added intermediary taxon names into hierarchy

# all lines unique to {$tmpDir}/ref.n3
set fails (comm -23 {$tmpDir}/ref.n3 {$tmpDir}/test.n3)
if test -n "$fails"
  echo "In $xml:"
  # printf '%s\n' $fails
  diff {$tmpDir}/ref.n3 {$tmpDir}/test.n3
  read #wait for user acknowledgement
  exit 1
end

# all changed lines
# comm -3 {$tmpDir}/ref.n3 {$tmpDir}/test.n3
