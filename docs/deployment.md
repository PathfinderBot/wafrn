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

If it doesn't work then alternatively download the latest release from https://codeberg.org/wafrn/wafrn-opentofu/releases/download/latest/wafrn-opentofu-latest.zip and go to https://cloud.oracle.com/resourcemanager/stacks/create to upload the templates as zip file.

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

Next you'll need to choose between one of the `docker-compose.*.yml` files:

1. ~~`simple`: Basic installation, this is the least resource heavy option.~~
2. ~~`simple.metrics`: Basic installation with Grafana support. Uses more resources.~~
3. `advanced`: Advanced installation with multiple separate workers running for better load distribution. Uses more resources.
4. `advanced.metrics`: Advanced installation with Grafana suppport. The most complete, but also more resource intense option.
5. `no-caddy`: Advanced installation without Caddy for those who want to place Wafrn behind an existing reverse proxy.
6. `no-caddy.metrics`: Advanced installation without Caddy with Grafana support for those who want to place Wafrn behind an existing reverse proxy.

<small>Note: as of version 2026.05.01, the simple configurations are no longer available.</small>

Make sure to list the name of the docker-compose you've chosen in your env. For example, if you wanted to use the advanced file, you would specify the following:

```sh
COMPOSE_FILENAME=docker-compose.advanced.yml
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

6. Run `./install/bsky/create-admin.sh`. This will create a user that the agent will use later and assign it to the admin account. If you use your admin account as your main (like on a single-user instance), then you can also provide a username to be generated (default is `wafrnadmin`), e.g. `./install/bsky/create-admin.sh myuser`. Make sure the username you chose is not one of the reserved names that cannot be used: https://github.com/bluesky-social/atproto/blob/main/packages/pds/src/handle/reserved.ts

7. If the previous call was successful now you can enable `ENABLE_BSKY=true` in your config

8. Update and restart your system: `docker compose up --build -d`

9. Check if everything is still running

10. Use `./install/bsky/add-insert-code.sh` to add a new bluesky insert code to your system. You'll need to have one for any account you wish to enable bluesky for.

11. Open up your selected account profile and click "Enable bluesky". If all goes well, this account will now be enabled and accessible on Bluesky. Do note that some names are reserved under Bluesky and you won't be able to create an account for them, even on a personal server. For the full list of reserved names please see https://github.com/bluesky-social/atproto/blob/main/packages/pds/src/handle/reserved.ts

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

### Frontend overrides

There is also a way to override any of the files in the `frontend` package without needing to fork or rebase the source code. For this to work create a folder called `packages/frontend/overrides`. Any file you put here will override anything in `packages/frontend/src` during build time. This directory is ignored by wafrn's update process, but you can and should init it as a separate git subrepository that you manage on your own:

```bash
mkdir packages/frontend/overrides
cd packages/frontend/overrides
git init
```

For example to override the site logo put your own logo into `packages/frontend/overrides/assets/logo.png` (and you'll also likely want to override `favicon.ico`, `logo_w.png`, `logo_mascot.png` the `icons` directory and others as well).

Or as another example to override the registration page and change the list of genders, copy `packages/frontend/src/app/pages/register/register.component.ts` into `packages/frontend/overrides/app/pages/register/register.component.ts` and then update the code over there.

Do note these overrides will persist any update you do on Wafrn, and - especially if you change the source code files - you'll need to manually make sure your updated code doesn't break with the updated source material.

You can find an example override repository that replaces the logo files and hides the registration functionality at https://codeberg.org/sztupy/wafrn-personal-overrides

### Default articles

Wafrn will create three posts for you for the following pages:

- A short welcome message that logged out users will see on the `Explore WAFRN` page (which has the same URL scheme as a normal post)
- `https://wafrn.example.com/about` is the contents of the About page, including site rules, and the list of banned and bubbled servers
- `https://wafrn.example.com/privacy` is the privacy policy

When logged in as the admin user you can customize these to your instance's needs.

## Running on servers with other web applications

The setup assumes that Wafrn and PDS will be the only things running on the server you're on. The frontend image uses ports `80` and `443` and to operate properly needs access to both those ports for TLS management, especially for Bluesky support. This means that if you want to install Wafrn to a server that already runs other web based applications running on either ports, you're going to have a conflict. Wafrn uses Caddy as the web-server, which is a modern, fast, secure-by-default web server. While you can technically run Wafrn on other web servers (like apache or nginx), Bluesky's PDS specifically requires Caddy (especially it's `on_demand_tls` feature), and access to ports `80` and `443` for proper operation.

### Installing Wafrn Without Caddy / Running Wafrn Behind an Existing Reverse Proxy

As of version 2026.05.01, the installer allows installation without Caddy if the option is selected. This allows you to place Wafrn behind an external reverse proxy rather than placing applications behind Wafrn's Caddy. If you are looking to use a version older than this or would prefer to use Wafrn's Caddy, please check the next section for how to host other applications behind Wafrn's Caddy.

After running the installer, set up your reverse proxy to point to `port 8080` for your Wafrn's `cdn` and `media` domains.

### Using Wafrn's Caddy in Front of Other Applications

To help people who want to install both Wafrn and other web applications on the same server, Wafrn's `Caddyfile` is set up in a way for you to allow adding extra configuration. You can use this feature either to use Wafrn's Caddy to host your other apps directly, ot at least to reverse proxy to your existing web server (albeit with TLS/HTTPS already taken care of by Wafrn's Caddy), which will then serve your existing apps.

To facilitate this Wafrn's Caddy includes a couple hooks, where you can add extra configuration. The two most important are:

- If you create a file in `packages/caddy/main_domain_pre`, e.g. `packages/caddy/main_domain_pre/website.conf`, you can add extra configuration to your main Wafrn domain. Example:

  ```bash
  handle_path /website* {
    reverse_proxy host.docker.internal:8888
  }
  ```

  This setting will route anything on `https://<your_wafrn_domain>/website` to anything that's running on port `8888` on your `localhost`. Note: Caddy is secure-by-default, so accessing this through `http` will always redirect to `https` by default. There is currently no way to disable this for subdomains.

  **Note:** Make sure to also allow access to this host and port in your docker-compose file, by adding `extra_hosts: ["host.docker.internal:host-gateway"]` to your `frontend` configuration.

- If you create a file in `packages/caddy/vhosts`, e.g. `packages/caddy/vhosts/website.example.com.conf`, you can add additional vhosts. Example:

  ```bash
  website.example.com {
    reverse_proxy host.docker.internal:8888
  }
  ```

  This setting will route anything on `https://website.example.com` to whatever's running on port `8888`. As above, `http` will be automatically redirected to `https`, and Caddy will take care of obtaining the TLS certificates for you through Let's Encrypt. If you want to disable this, you can specify `http://website.example.com` on the first line to force this setting for http only. Also see the caveats about networking as well.

- There are other hooks if you need to update the global Caddy config, or want to add something to the other domains (cache, monitoring, pds) as well. The full list of hooks can be found in the [Caddyfile](https://codeberg.org/wafrn/wafrn/src/commit/main/packages/frontend/Caddyfile.example).

Don't forget to rebuild your frontend container for the changes to be picked up.

> **Note:** while it is possible to put Wafrn itself behind a reverse proxy of your existing web server, this is currently not a supported configuration, especially if you want to have Bluesky support enabled as well.
>
> If you really-really-really want to go down this route you'll need to disable caddy's automatic https feature, by creating a file called `packages/caddy/global/disable_https.conf` with the single line content of `auto_https disable_redirects`, and then change your docker compose file to serve the frontend on a port different to `80`, like `8123`. Afterwards update your existing web server's setting to reverse proxy all of the the wafrn domains (main, cache, cdn, pds) to this port, and you should be done. Note that Bluesky support will likely fail, unless you set up your web server to do TLS termination either for the entire `*.<bluesky_domain>` domain you have set up, or at least for the usernames your Bluesky users will be using, like `admin.<bluesky_domain>`, etc.

[magic_button]: https://oci-resourcemanager-plugin.plugins.oci.oraclecloud.com/latest/deploy-to-oracle-cloud.svg
[magic_wafrn_basic_stack]: https://cloud.oracle.com/resourcemanager/stacks/create?zipUrl=https://codeberg.org/wafrn/wafrn-opentofu/releases/download/latest/wafrn-opentofu-latest.zip
