#!/usr/bin/env bash
set -e

cp environment.example.ts environment.ts
perl -pi -e 's/\$\{\{([_A-Z]+):-(.*)\}\}/$ENV{$1}||$2/ge' environment.ts
perl -pi -e 's/\$\{\{([_A-Z]+)\}\}/$ENV{$1}/g' environment.ts

unset $(compgen -v | grep "_SECRET$")
unset $(compgen -v | grep "_PASSWORD$")
unset $(compgen -v | grep "_PRIVATE$")

exec "$@"
