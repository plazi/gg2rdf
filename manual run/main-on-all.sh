#! /bin/bash

## ./xml ----> ./ttl

#TODO VARS
GITHUB_WORKSPACE=/workspace/
GITHUB_ACTION_PATH=/workspace/
GITHUB_ACTOR=retog

apt update
DEBIAN_FRONTEND=noninteractive apt install -y raptor2-utils openjdk-11-jdk git curl
  # This is assuming that /usr/bin is in the path
ls -l $GITHUB_ACTION_PATH
ls -l $GITHUB_WORKSPACE

#git clone --depth 1 git@github.com:plazi/treatments-xml.git $GITHUB_WORKSPACE/xml

# Run saxon on all files
cd $GITHUB_WORKSPACE/xml
mkdir $GITHUB_WORKSPACE/rdf
for file in $(find . -type f); do
  if [[ $file == *.xml ]]; then
    echo "$file is xml, applying saxon"
    mkdir -p $GITHUB_WORKSPACE/rdf/${file%/*}
    java -jar $GITHUB_ACTION_PATH/saxon-he-10.8.jar -s:$file -o:$GITHUB_WORKSPACE/rdf/${file:0:-4}.rdf -xsl:$GITHUB_ACTION_PATH/gg2rdf.xslt
  fi
done

# Convert all generated RDF-XML files to TTL
cd $GITHUB_WORKSPACE/rdf
mkdir -p $GITHUB_WORKSPACE/ttl
for file in $(find . -type f); do
  echo "$file in generated rdf-xml folder"
  relative_file=`realpath -m --relative-to=$GITHUB_WORKSPACE/rdf $file`
  mkdir -p $GITHUB_WORKSPACE/ttl/${relative_file%/*}
  # $file → $GITHUB_WORKSPACE/ttl/${file:0:-4}.ttl
  rapper -e -w -q $file --output turtle > $GITHUB_WORKSPACE/ttl/${file:0:-4}.ttl
done

#git clone --depth 1 git@github.com:plazi/treatments-rdf.git $GITHUB_WORKSPACE/ttl-repo
#
## Remove
#cd $GITHUB_WORKSPACE/ttl-repo
#rm -rf data
#
## Move
#cd $GITHUB_WORKSPACE
#mv ttl ttl-repo
#
#cd $GITHUB_WORKSPACE/ttl-repo
#git config user.name $GITHUB_ACTOR
#git config user.email $GITHUB_ACTOR@users.noreply.github.com
#git add -A
#git commit -m "manual conversion of all files"
#git push origin main
