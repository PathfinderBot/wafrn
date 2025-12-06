#!/usr/bin/env bash
set -eo pipefail

SCRIPT_DIR=$( cd -- "$( dirname -- "${BASH_SOURCE[0]}" )" &> /dev/null && pwd )

source "${SCRIPT_DIR}/../.env"

BACKUP_ROOT_DIR=${BACKUP_ROOT_DIR:-$HOME/backup}
BACKUP_KEEP_DAYS=${BACKUP_KEEP_DAYS:-10}
BACKUP_POST_BACKUP_TOOL=${BACKUP_POST_BACKUP_TOOL:-$HOME/post_backup.sh}

declare -a docker_compose_files=("docker-compose.simple.yml" "docker-compose.simple.metrics.yml" "docker-compose.advanced.yml" "docker-compose.advanced.metrics.yml")

COMPOSE_FILENAME=

check_files_for_update () {
  PARAMS=$1

  COMPOSE_FILENAME="docker-compose."
  SHOULD_EXIT=0

  # figure out which docker compose file we were using
  for compose_filename in "${docker_compose_files[@]}"
  do
    if diff -q docker-compose.yml $compose_filename &>/dev/null; then
      COMPOSE_FILENAME=$compose_filename
    fi
  done

  # check if that docker compose file will change
  if git diff --name-only '@' '@{u}' | grep -q $COMPOSE_FILENAME; then
    echo "-------------------------------------------"
    echo " WARNING"
    echo
    echo " Docker compose files have changed!"
    echo "-------------------------------------------"
    echo

    # if we're using a nonstandard compose file we'll just throw an error
    if [ $COMPOSE_FILENAME == "docker-compose." ]; then
      echo "Please check the release notes, and review the changes,"
      echo "making sure to update your local config accordingly"
      echo
      echo "If you're happy with the changes please re-run the script with"
      echo "  ./install/manage.sh update -f"
      SHOULD_EXIT=1
    else
      echo "The following updates will be applied automatically after pulling:"
      echo
      git diff '@' '@{u}' -- $COMPOSE_FILENAME
      echo
    fi
  else
    COMPOSE_FILENAME=
  fi

  # check if the environment config will change
  if git diff --name-only '@' '@{u}' | grep -q '.env.example'; then
    echo "-------------------------------------------"
    echo " WARNING"
    echo
    echo " Environment example config has changed!"
    echo "-------------------------------------------"
    echo
    echo "Please check the release notes, and review the changes below"
    echo "making sure to update your local config accordingly:"
    echo
    git diff '@' '@{u}' -- .env.example
    echo
    echo "If you're happy with the changes please re-run the script with"
    echo "  ./install/manage.sh update -f"
    SHOULD_EXIT=1
  fi

  if [ "$PARAMS" != "-f" ]; then
    if [ "$SHOULD_EXIT" -eq 1 ]; then
      exit 1
    fi
  else
    echo
    echo "WARNING: Force flag found, continuing update"
    echo
  fi
}

case $1 in
  update)
    pushd "${SCRIPT_DIR}/.."
      OLD_SHA=$(git rev-parse HEAD)

      git fetch

      check_files_for_update $2

      git pull

      if [ ! -z "$COMPOSE_FILENAME" ]; then
        cp $COMPOSE_FILENAME docker-compose.yml
      fi
      $SCRIPT_DIR/_auto_updater.sh $OLD_SHA

      docker compose pull
      docker compose down
      rm -rf packages/backend/cache/ && mkdir packages/backend/cache/ && touch packages/backend/cache/.gitkeep
      docker system prune -f
      docker compose up --build -d
      docker compose logs -t -n 50 -f
    popd
    ;;
  backup)
    echo "Cleaning up backup directory"
    mkdir -p "$BACKUP_ROOT_DIR"
    find "$BACKUP_ROOT_DIR" -mtime +$BACKUP_KEEP_DAYS -type f -delete
    BACKUP_DIR=$BACKUP_ROOT_DIR/$(date +"%Y%m%dT%H%M%S")
    mkdir -p "$BACKUP_DIR"
    pushd "$BACKUP_DIR"
      echo "Backing up database"
      docker start wafrn-db-1
      docker exec wafrn-db-1 pg_dumpall -c | zstd -9 > db.sql.zst
      echo "Backing up uploads folder"
      tar --zstd -cf uploads.tar.zst -C "$SCRIPT_DIR/../packages/backend/uploads" .
      if [ "$ENABLE_BSKY" == "true" ]; then
        echo "Backing up bluesky data"
        docker run --rm -v "wafrn_pds:/pds" -v "$(pwd):/backup" -w /pds node:20-alpine tar c -f - . | zstd > pds.tar.zst
      fi
      echo "Done"
    popd
    if [ -f "$BACKUP_POST_BACKUP_TOOL" ]; then
      $BACKUP_POST_BACKUP_TOOL "$BACKUP_DIR"
    fi
    ;;
  restore)
    RESTORE_DIR=$2
    if [ -d "${RESTORE_DIR}" ] ; then
      pushd "$SCRIPT_DIR/.."
        echo "Stopping instance"
        docker compose stop
      popd
      pushd "$RESTORE_DIR"
        echo "Restoring database"
        docker start wafrn-db-1
        zstdcat db.sql.zst | docker exec -i wafrn-db-1 psql -X -f - -d postgres
        echo "Restoring uploads directory"
        rm -rf "$SCRIPT_DIR/../packages/backend/uploads/*"
        tar --zstd -xf uploads.tar.zst -C "$SCRIPT_DIR/../packages/backend/uploads"
        if [ "$ENABLE_BSKY" == "true" ]; then
          echo "Restoring pds data"
          zstdcat pds.tar.zst | docker run --rm -i -v "wafrn_pds:/pds" -w /pds node:20-alpine sh -c 'rm -rf * && tar x -f -'
        fi
      popd
      pushd "$SCRIPT_DIR/.."
        echo "Restarting intance"
        docker compose up --build -d
      popd
    else
      echo "Please provide a backup directory to restore"
    fi
    ;;
  clean)
    pushd "$SCRIPT_DIR/.."
    rm -rf packages/backend/cache/ && mkdir packages/backend/cache/
    popd
    ;;
  logs)
    pushd "${SCRIPT_DIR}/.."
    docker compose logs -t -n 50 -f
    popd
    ;;
  *)
    echo "Valid options:"
    echo "  update: Download latest wafrn from repository, update and restart"
    echo "  backup: Create backup of the current wafrn files"
    echo "  restore: Restore a specific backup"
    echo "  clean: Cleans the cache"
    echo "  logs: Starts tailing docker logs"
    exit 1
    ;;
esac
