# Wafrn Management

**All commands should be run in the `wafrn` directory unless otherwise stated.**

## Backups

### Backing Up

Wafrn can be backed up using the following:

```sh
./install/manage.sh backup
```

If you used the installer to set up your Wafrn server, this script is automatically run every day using a cronjob.

You can [add post-backup scripts](https://codeberg.org/wafrn/wafrn-opentofu/src/branch/main/scripts/post_backup.template.sh) that you can configure to copy the backups to an off-site location, like any S3 compatible bucket. These will automatically be run every time a backup is made.

It is recommend to back up your instance before running an update or importing data.

### Restoring from Backup

You may restore your instance from backup:

```sh
./install/manage.sh restore /full/path/to/backup_directory
```

## Updating / Upgrading

Before updating, check release notes to ensure you are aware of any breaking changes or additional instructions.

Wafrn may be updated with the following script:

```sh
./install/manage.sh update
```

## Exporting / backing up users

If any user asks you to backup their data, or you want to create a backup for yourself, you can run the following command:

```sh
docker exec -ti wafrn-backend-1 npm exec tsx utils/maintenanceTasks/exportActivityPubBackup.ts <username> <exportType>
```

The `exportType` can be one of the following:

* `1`: *Basic:* Only export the named blog, and local media files attached to the main blog. Result will be mostly compatible with what Mastodon would export as a backup. This is the default
* `2`: *Threaded:* Export the named blog, and all conversation information (post threads) related to the main blog. Also include all local media files for the blog and threads.
* `3`: *All-inclusive:* Same as `2`, but also downloads all linked remote media files and includes them in the backup.

> **Note:** Only the default option (`1`) will generate a backup file compatible with some Mastodon import tools, although if Bluesky is enabled it will also contain Bluesky posts that these importers might choke on. All options are supported by Wafrn's own importer however, including importing Bluesky data.

Once export is finished this tool will write out a randomized URL to the console where the user can download their backup file. Once downloaded this file should be deleted manually from the server.

## Clearing Remote Cache

The following can be used to clear the remote cache:

```
docker compose down
docker volume rm wafrn_cache
docker compose up -d
```
The remote cache is also cleared when updating Wafrn.

## Importing Fedinuke and IFTAS DNI Blocklists

Wafrn supports importing [seirdy's FediNuke](https://seirdy.one/posts/2023/05/02/fediverse-blocklists/) and [IFTAS DNI](https://about.iftas.org/library/iftas-dni-list/) using the following script:

```sh
docker exec -ti wafrn-backend-1 npm exec  tsx updateDatabase/blockHosts.ts
```

## Migrating to a New Server

If you need to move your Wafrn to a new server, here is an overview of the process:

* Install Wafrn on the new server with dummy information. This will be overwritten later.
* Create a backup of your instance on the old server.
* Upload this backup to the new server.
* Overwrite the new server's .env with the old server's information.
* Use the restore from backup script outlined in the Backups section to overwrite the new server's data.
* If all succeeds, your Wafrn install is now migrated to a new server!

## Sending Custom Mass Emails

Wafrn automatically sends basic emails like password resets or email verification emails when configured. This section is for sending custom mass emails to users, such as announcements or security notices.

1. Enter a backend container. For example, if you want to enter wafrn-backend-1:
```sh
docker exec -it wafrn-backend-1 sh
```
2. Edit the `utils/maintenanceTasks/mailCampaing.ts` file (if sending a campaign email) or the `utils/maintenanceTasks/emergenciEmail` (if sending an emergency email) file to match the content of the email you want to send.
3. Run the command to send the email.

If sending a campaign email:
```sh
npx tsx utils/maintenanceTasks/mailCampaing.ts
```

If sending an emergency email:
```sh
npx tsx utils/maintenanceTasks/emergenciEmail.ts
```
If this fails, check to make sure modifications have been made.

The emergency email script ignores user email preferences and should only be used for legitimate concerns such as a security notice. The mail campaign script respects user preferences and should be used for all other purposes.