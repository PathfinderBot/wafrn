# Host Wafrn Yourself

## What will you need

If you need support you can also always find the latest Discord invite [on our website](https://wafrn.net)

Prerequisites:

1. Wafrn requires you to have a domain name you can fully configure. There are plenty of places to get one, and it's outside the scope of a guide like this to recommend any of them.
2. Time and dependent on the install method some or more knowledge of linux based systems.

To set up wafrn you have three options:

1. Use the automated scripts that set up wafrn on Oracle Cloud's Always Free infrastructure automatically. It may be free, BUT THEY ARE KNOWN TO TERMINATE ACCOUNTS ON A WHIM
2. Already have a Debian / Ubuntu based computer in the cloud, and use the installer script to set up wafrn
3. Have a modern Linux based box lying around somewhere and you want to install wafrn on it manually

<sup>\*</sup>: You do need to accept Oracle's T&C, which might or might not contain crazy stuff. Also you'll need a Debit/Credit card for verification.

## Oracle Cloud

Use the below button to set up a fully working Wafrn instance on Oracle Cloud's Always Free instances:

[![Deploy to Oracle Cloud][magic_button]][magic_wafrn_basic_stack]

If it doesn't work then alternatively download the latest release from <https://codeberg.org/wafrn/wafrn-opentofu/releases/download/latest/wafrn-opentofu-latest.zip> and go to <https://cloud.oracle.com/resourcemanager/stacks/create> to upload the templates as zip file.

Documentation for the OCI integration [can be found in a separate repository](https://codeberg.org/wafrn/wafrn-opentofu).

## Installer

Alternatively, you will need a Debian 12 VPS. The cheap Netcup ARM one can do the trick with no problem. Maybe even the OVH one that costs 3 euros too. But I advise as a minimum the Netcup ARM one. (Contabo is no longer recomended)

You will also need a way of sending emails to the people registering. An SMTP server or a free Brevo account with SMTP enabled can do the trick.

First, point the domain to your Debian VPS. Once that is done, we download the installer and execute it.

The installer will ask a few questions, then install docker and set up the application. It will be installed for the current logged in user.

```bash
wget https://codeberg.org/wafrn/wafrn/raw/branch/main/install/installer.sh
bash installer.sh
```

Once this has been run successfully you should be able to login to your website using the credentials displayed. If you lost the values or there were issues displaying them, you can find them in the `~/wafrn/.env` file.

Note: due to the installer installing new user groups in the system and setting up some temporary environment variables it is **highly** advised to log out and log back in to avoid potential issues with your groups and environments.

## Manual install

If you don't wish to run a random bash script obtained from the internet, you can also install wafrn manually.

Pre-requisites: A linux based system with bash, git, build essentials and docker pre-installed.

### Checkout project

You'll need to get the project files ready in a directory of your choice:

```bash
git clone https://codeberg.org/wafrn/wafrn.git
cd wafrn
```

### Configure environment

There is a convenience script that will generate secret values appropriately. To run type

```bash
bash install/env_secret_setup.sh
```

Next you'll need to fill in all of the details of your domain. For example if you're trying to run your website under `wafrn.example.com` (and your DNS is already pointing to the computer running docker) you'll need to update the following details:

```sh
DOMAIN_NAME=wafrn.example.com
CACHE_DOMAIN=cache.wafrn.example.com
MEDIA_DOMAIN=media.wafrn.example.com
PDS_DOMAIN_NAME=bsky.example.com

# use the same domains as set above for MEDIA and CACHE
FRONTEND_MEDIA_URL="https://media.wafrn.example.com"
FRONTEND_CACHE_URL="https://cache.wafrn.example.com/api/cache?media="

ACME_EMAIL=admin@example.com
```

Note: even if you don't intend to run the Bluesky integration you'll need to set a `PDS_DOMAIN_NAME` that is different to the main domain you use. You can however make this a fake one, like `bsky.example.com`. Also it's advised to set `COMPOSE_PROFILES=default` in your `.env` file, so docker compose will not run the bluesky related containers.

You'll also need to fill in the `SMTP` settings for emails to work.

### Run

Next to run the setup just call

```bash
docker compose up --build -d
```

Once the scripts run and everything is okay you should be able to access your website at `https://wafrn.example.com`

## Bluesky integraton

If you used the OCI integration or the installer and enabled Bluesky then it should already work you.

If you set up wafrn manually, then follow the steps below:

1. Make sure to have `ENABLE_BSKY=false` for now, as the system will break otherwise

2. Create a new domain for your Bluesky service. For example we'll use `bsky.example.com`

3. Make sure in your DNS host both `bsky.example.com` and `*.bsky.example.com` points to the computer you're running docker compose (we also recomend \*.example.com)

4. Make sure `COMPOSE_PROFILES=bluesky` is set in your `.env` file

5. Run `docker compose up` to make sure everything is running

6. Run `./install/bsky/create-admin.sh`. This will create a user that the agent will use later and assign it to the admin account. If you use your admin account as your main (like on a single-user instance), then you can also provide a username to be generated (default is `wafrnadmin`), e.g. `./install/bsky/create-admin.sh myuser`. Make sure the username you chose is not one of the reserved names that cannot be used: <https://github.com/bluesky-social/atproto/blob/main/packages/pds/src/handle/reserved.ts>

7. If the previous call was successful now you can enable `ENABLE_BSKY=true` in your config

8. Update and restart your system: `docker compose up --build -d`

9. Check if everything is still running

10. Use `./install/bsky/add-insert-code.sh` to add a new bluesky insert code to your system. You'll need to have one for any account you wish to enable bluesky for.

11. Open up your selected account profile and click "Enable bluesky". If all goes well, this account will now be enabled and accessible on Bluesky. Do note that some names are reserved under Bluesky and you won't be able to create an account for them, even on a personal server. For the full list of reserved names please see <https://github.com/bluesky-social/atproto/blob/main/packages/pds/src/handle/reserved.ts>

## Customizing your instance

Wafrn currently allows the following customizations:

### Environment variables

The following environment variables can be used to easily change the title and description of your website:

```bash
FRONTEND_SHORT_TITLE=Wafrn
FRONTEND_LONG_TITLE=Wafrn, the social media that respects you
FRONTEND_DESCRIPTION=Wafrn is a federated social media inspired by tumblr that connects with the fediverse and bluesky
```

Once updated you'll need to rebuild your containers to get these picked up.

### Frontend overrides  (NEW, BETTER, FASTER)

There is a folder called `packages/frontend/runtime-overrides`. Any file you put here will override anything in the wafrn frontend files.

For example to override the site logo put your own logo into `packages/frontend/runtime-overrides/assets/logo.png` (and you'll also likely want to override `favicon.ico`, `logo_w.png`, `logo_mascot.png` the `icons` directory and others as well).

Do note these overrides will persist any update you do on Wafrn. Its important to understand, this method does not work for the source code, only for static files.

#### Add a default theme to your instance

Create the file `packages/frontend/runtime-overrides/assets/instanceTheme.css` and put your css in there.

Restart your instance. You can experiment with your own custom theme and paste the contents in there.

### Frontend overrides - LEGACY

#### If your instance is not going to edit code, use the previous override method, not the legacy one

There is also a way to override any of the files in the `frontend` package without needing to fork or rebase the source code. For this to work create a folder called `packages/frontend/overrides`. Any file you put here will override anything in `packages/frontend/src` during build time. This directory is ignored by wafrn's update process, but you can and should init it as a separate git subrepository that you manage on your own:

```bash
mkdir packages/frontend/overrides
cd packages/frontend/overrides
git init
```

For example to override the site logo put your own logo into `packages/frontend/overrides/assets/logo.png` (and you'll also likely want to override `favicon.ico`, `logo_w.png`, `logo_mascot.png` the `icons` directory and others as well).

Or as another example to override the registration page and change the list of genders, copy `packages/frontend/src/app/pages/register/register.component.ts` into `packages/frontend/overrides/app/pages/register/register.component.ts` and then update the code over there.

Do note these overrides will persist any update you do on Wafrn, and - especially if you change the source code files - you'll need to manually make sure your updated code doesn't break with the updated source material.

You can find an example override repository that replaces the logo files and hides the registration functionality at <https://codeberg.org/sztupy/wafrn-personal-overrides>

### Default articles

Wafrn will create three posts for you for the following pages:

- A short welcome message that logged out users will see on the `Explore WAFRN` page (which has the same URL scheme as a normal post)
- `https://wafrn.example.com/about` is the contents of the About page, including site rules, and the list of banned and bubbled servers
- `https://wafrn.example.com/privacy` is the privacy policy

When logged in as the admin user you can customize these to your instance's needs.

## Running on servers with other web applications

The setup assumes that Wafrn and PDS will be the only things running on the server you're on. The frontend image uses ports `80` and `443` and to operate properly needs access to both those ports for TLS management, especially for Bluesky support. This means that if you want to install Wafrn to a server that already runs other web based applications running on either ports, you're going to have a conflict. Wafrn uses Caddy as the web-server, which is a modern, fast, secure-by-default web server. While you can technically run Wafrn on other web servers (like apache or nginx), Bluesky's PDS specifically requires Caddy (especially it's `on_demand_tls` feature), and access to ports `80` and `443` for proper operation.

### Installing Wafrn Without Caddy / Running Wafrn Behind an Existing Reverse Proxy

This used to be realy hard. Not anymore!

In your .env file, add this at the end:

```
HTTP_PORT=127.0.0.1:8080
HTTPS_PORT=127.0.0.1:8433
PDS_HTTP_PORT=127.0.0.1:3000
AUTO_HTTPS_MODE="auto_https disable_redirects"
```

This will make wafrn listen in the port 8080 without forcing https. And the pds on the port 3000.

We recommend caddy for HTTPS reasons. If you are going to use any other software, base yourself in this config and if you get it working, please add a PR expanding on this config!

```
{
    on_demand_tls {
        ask http://localhost:3000/tls-check
    }
}

YOURINSTANCENAME, media.YOURINSTANCENAME, cdn.YOURINSTANCENAME, bullboard.YOURINSTANCENAME, monitoring.YOURINSTANCENAME {
    encode zstd gzip
    reverse_proxy http://localhost:8080
}

at.YOURINSTANCENAME, *.at.YOURINSTANCENAME {
   tls {
        on_demand
    }
   reverse_proxy http://localhost:3000
}
```

Then, you need to proxy it

### Wafrn with just 2gb of ram. And swap

Add swap. 4 or 8 GB just in case. Minimum real recomended is 4gb of ram, as its what gabboman.xyz is bein ran on

If you want to run Wafrn on a low-memory system (not recommended), you can modify your environment variables on the .env file, by adding at the end:

- `BACKEND_REPLICAS=1` to run only a single backend instance
- `WORKERS_REPLICAS=0` to disable background workers
- `BACKEND_HOST=wafrn-backend-1:9000` to point to the single backend instance
- `USE_WORKERS=true` to make most jobs to be on the main thread.

With this, a single user instance is using a total of 2700mb of ram, with a 7 month size database of lots of follows. You will be better than that at the begining. This is fine with some swap.


#### Do not do this unless there is no other option

Another option to reduce usage is to disable other services used by wafrn.

```docker compose stop bullboard``` is the only one on this list that is ok to do, but you wont be able to see the queues of your instance. This will free up 200 to 300mb of ram.

```docker compose stop websocket``` will stop the real time notifications from fedi. But will also disable IMPORTANT DB MAINTENANCE FEATURES. You can stop this for 100 or 200 extra mb of "free" ram, but some important maintenance tasks and future features wont run.

Bluesky pds worker is run in a separate thread. You can stop that service too but you will be forced to use the standard bsky appview as fallback mode. This will:

- Stop you from reciving notifications real time from bluesky and only while scrolling
- Forced to use their apis. If they're down you wont get any posts
- Forced to use their moderation. If they ban an account is banned for you too.

Just do ```docker compose stop pds_worker``` each time after updates. This will reduce ram usage in 200 or 300mb. You can also have bluesky totaly disabled. I mean that is ok.
