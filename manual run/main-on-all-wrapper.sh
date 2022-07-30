#! /bin/bash

#TODO VARS
GITHUB_WORKSPACE=`pwd`
GITHUB_ACTION_PATH=`pwd`

echo "GG-XML input : $GITHUB_WORKSPACE/xml"
echo "Turtle output: $GITHUB_WORKSPACE/ttl"
echo "xslt         : $GITHUB_WORKSPACE/gg2rdf.xslt"

[[ ! -d "$GITHUB_WORKSPACE/xml" ]] && echo -e "\e[1;31mno exists: $GITHUB_WORKSPACE/xml\e[0m" && exit 1
[[ -d "$GITHUB_WORKSPACE/ttl" ]] && echo -e "\e[1;31mexists: $GITHUB_WORKSPACE/ttl\e[0m" && exit 1
[[ ! -f "$GITHUB_WORKSPACE/gg2rdf.xslt" ]] && echo -e "\e[1;31mno exists: $GITHUB_WORKSPACE/gg2rdf.xslt\e[0m" && exit 1

mkdir "$GITHUB_WORKSPACE/ttl"

docker run -ti -v "$GITHUB_WORKSPACE"/xml:/workspace/xml -v "$GITHUB_WORKSPACE"/ttl:/workspace/ttl -v "$GITHUB_WORKSPACE"/gg2rdf.xslt:/workspace/gg2rdf.xslt ubuntu /workspace/main-on-all.sh
