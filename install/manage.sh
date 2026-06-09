#!/usr/bin/env bash
set -eo pipefail



SCRIPT_DIR=$( cd -- "$( dirname -- "${BASH_SOURCE[0]}" )" &> /dev/null && pwd )

source "${SCRIPT_DIR}/../.env"

COMPOSE_FILENAME="docker-compose.default.yml"


BACKUP_ROOT_DIR=${BACKUP_ROOT_DIR:-$HOME/backup}
BACKUP_KEEP_DAYS=${BACKUP_KEEP_DAYS:-10}
BACKUP_POST_BACKUP_TOOL=${BACKUP_POST_BACKUP_TOOL:-$HOME/post_backup.sh}

declare -a docker_compose_files=("docker-compose.default.yml")


check_files_for_update () {
  PARAMS=$1

  SHOULD_EXIT=0


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

      cp docker-compose.default.yml docker-compose.yml

      # Ensure required data volume directories exist
      VOLUMES=(dbpg pds frontend redis prometheus_data grafana_data)
      for vol in "${VOLUMES[@]}"; do
        if [ ! -d "data/$vol" ]; then
          # Try to copy existing docker volume data if available
          SRC="/var/lib/docker/volumes/wafrn_${vol}/_data"
            echo "Transferring existing volume data from $SRC to data/$vol (using sudo)"
            docker compose --profile "*" down
            mkdir -p "data/$vol"
            if sudo mv "$SRC/." "data/$vol/" 2>/dev/null; then
              echo "Moved data from $SRC to data/$vol"
            else
              echo "mv failed (possibly busy). Falling back to rsync copy + delete"
              if command -v rsync >/dev/null 2>&1; then
                sudo rsync -aHAX --numeric-ids --delete-during "$SRC/" "data/$vol/" || {
                  echo "rsync failed copying from $SRC to data/$vol"
                }
                # attempt to remove source files (best-effort)
                sudo rm -rf "$SRC/"* || {
                  echo "Failed to remove files from $SRC after rsync; leaving originals in place"
                }
              else
                echo "rsync not available; leaving empty directory. Install rsync, run the update again, and the old data will be transferred on the next attempt."
              fi
            fi
            # Ensure the current user owns the transferred data
            sudo chown --recursive "$USER":"$USER" "data/$vol" || {
              echo "Failed to chown data/$vol to $USER"
            }
        fi
      done

      $SCRIPT_DIR/_auto_updater.sh $OLD_SHA

      #docker compose down
      docker compose pull
      docker compose down
      docker system prune -f
      docker volume rm wafrn_cache
      docker compose up -d
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
      sleep 5
      docker exec wafrn-db-1 pg_dumpall -c | zstd -9 > db.sql.zst
      echo "Backing up uploads folder"
      tar --zstd -cf uploads.tar.zst -C "$SCRIPT_DIR/../packages/backend/uploads" .
      if [ "$ENABLE_BSKY" == "true" ]; then
        echo "Backing up bluesky data"
        docker run --rm -v "wafrn_pds:/pds" -v "$(pwd):/backup" -w /pds node:20-alpine tar c -f - . | zstd > pds.tar.zst
      fi
      cp ../../wafrn/.env environment
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
        echo "waiting 10 seconds for the database to start"
        sleep 10
        zstdcat db.sql.zst | docker exec -i wafrn-db-1 psql -X -f - -d postgres
        echo "VACUUM ANALYZE" | docker exec -i wafrn-db-1 psql -X -f - -d postgres
        echo "Restoring uploads directory"
        rm -rf "$SCRIPT_DIR/../packages/backend/uploads" && mkdir "$SCRIPT_DIR/../packages/backend/uploads"
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
    echo "Stoping wafrn to clean cache"
    docker compose down
    docker volume rm wafrn_cache
    docker compose up -d
    echo "Wafrn restarted"
    popd
    ;;
  logs)
    pushd "${SCRIPT_DIR}/.."
    docker compose logs -t -n 50 -f
    popd
    ;;
  build)
    pushd "${SCRIPT_DIR}/.."
    echo "Force building containers"
    docker compose up --build -d
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
    echo "  build: Force build containers"
    exit 1
    ;;
esac
