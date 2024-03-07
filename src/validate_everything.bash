DIR=/workdir/repo/target

rm "/workdir/log/validate/*"
mkdir /workdir/log/validate

for dir in "$DIR"/data/*; do
  echo "$dir" >>/workdir/log/validate/log
  find "$dir" -type f -name '*.ttl' \
    -exec bash -c 'echo "$0" >/workdir/log/validate/current && jena/apache-jena-5.0.0-rc1/bin/riot --validate "$0" &>>/workdir/log/validate/log || echo "In $0" >>/workdir/log/validate/log' '{}' \;
done
