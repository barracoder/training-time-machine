# Linux: step-by-step guide (minimal experience needed)

By the end you'll have a website on your own computer showing every activity
you've ever recorded. Nothing is uploaded anywhere. It all stays local.

These steps are written for Ubuntu (and work on Mint, Pop!_OS and other
Ubuntu-family systems). You'll paste a few commands into a terminal.
Open it with `Ctrl+Alt+T`.

> **What you'll need (all free):**
> - **Node.js** (version 18 or newer): runs the website
> - **Docker**: runs the database
> - **unzip** and **curl**
> - A **Strava account** to request your data export
> - About 2 GB of free disk space
>
> Part 1 walks you through installing all of these.

## Part 1: Install the tools (one time only)

Paste each block and press **Enter** (you'll be asked for your password):

```sh
# Node.js (runs the website) and unzip
sudo apt update && sudo apt install -y curl unzip
curl -fsSL https://deb.nodesource.com/setup_lts.x | sudo -E bash -
sudo apt install -y nodejs
```

```sh
# Docker (runs the database)
curl -fsSL https://get.docker.com | sudo sh
sudo usermod -aG docker $USER
```

Now **log out and back in** (so the Docker permission takes effect).

## Part 2: Get this project

1. On the project's GitHub page, click the green **Code** button, then
   **Download ZIP**.
2. Then paste:

```sh
cd ~ && unzip ~/Downloads/*time-machine*.zip -d ~ && mv ~/*time-machine*/ ~/training-time-machine 2>/dev/null; cd ~/training-time-machine
```

(If your file manager already extracted it, just move the folder to your
home directory and rename it `training-time-machine`.)

## Part 3: Ask Strava for your data (free, and your legal right)

1. Go to <https://www.strava.com/athlete/download_my_account> and log in.
2. Click **Request Your Archive**. (This does **not** delete anything.)
3. Wait for Strava's email (usually within a few hours) and use its
   download link. It saves a file like `export_1234567.zip`. Leave it in Downloads.

## Part 4: Load your data

```sh
cd ~/training-time-machine && .claude/skills/strava-extract/strava-extract.sh
```

It automatically finds the Strava file in your Downloads. The first run
takes a few minutes; it's done when you see **Done.**

## Part 5: See your training history

```sh
cd ~/training-time-machine/website && ./start.sh
```

Your browser opens <http://localhost:5178> with your dashboard, maps,
records and more. Keep the terminal open while browsing; press `Ctrl+C`
in it when you're finished.

## Later on

- **See the site again:** repeat Part 5 (it starts in seconds after the
  first time).
- **New data from Strava:** repeat Parts 3 and 4. The new download
  replaces the old data automatically.

## If something goes wrong

| You see | Do this |
| --- | --- |
| `docker: command not found` | Redo the Docker block in Part 1 |
| `port is already allocated` or `Bind ... 3306 failed` | Another database program is using port 3306. Close it, or change the port in `docker-compose.yml` |
| `container name "/strava-mysql" is already in use` | An earlier copy of this project already created the database. Run `docker rm -f strava-mysql`, then try again (your data lives in a volume and is not deleted) |
| `container strava-mysql is unhealthy` or it gives up while "waiting" | The database sets itself up on the very first run, which can take a couple of minutes on slower machines. Wait a minute and run the same command again |
| `permission denied ... docker.sock` | You skipped the log-out/log-in after Part 1 |
| `npm: command not found` | Redo the Node.js block in Part 1 |
| The page says "unable to connect" | The terminal from Part 5 must stay open. Run `./start.sh` again |
