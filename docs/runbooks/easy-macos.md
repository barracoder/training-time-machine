# Mac — step-by-step guide (no technical experience needed)

By the end you'll have a website on your own Mac showing every activity you've
ever recorded. Nothing is uploaded anywhere — it all stays on your Mac.

> **What you'll need (all free):**
> - **Node.js** (version 18 or newer) — runs the website
> - **Docker Desktop** — runs the database
> - A **Strava account** to request your data export
> - About 2 GB of free disk space
>
> Part 1 walks you through installing the first two.

## Part 1 — Install two free programs (one time only)

**Node.js** (runs the website):

1. Go to <https://nodejs.org> in Safari.
2. Click the big green **LTS** download button.
3. Open the downloaded `.pkg` file and click **Continue** through the
   installer.

**Docker Desktop** (runs the database):

1. Go to <https://www.docker.com/products/docker-desktop/>.
2. Download for Mac — pick **Apple Silicon** for newer Macs (M1/M2/M3/M4),
   **Intel** for older ones (check  → About This Mac if unsure).
3. Open the downloaded file and drag Docker into Applications.
4. Open **Docker** from Applications once — you can skip/close any sign-in
   screens. Leave it running (a whale icon appears in the menu bar).

## Part 2 — Get this project

1. On the project's GitHub page, click the green **Code** button, then
   **Download ZIP**.
2. Double-click the ZIP in Downloads to unpack it, and drag the resulting
   folder into your home folder (the one with the house icon).
3. Rename it to just `training-time-machine` if it has a longer name.

## Part 3 — Ask Strava for your data (free — it's your legal right)

1. Go to <https://www.strava.com/athlete/download_my_account> and log in.
2. Click **Request Your Archive**. (This does **not** delete anything.)
3. Wait for Strava's email — usually within a few hours — and use its
   download link. It saves a file like `export_1234567.zip`. Leave it in Downloads.

## Part 4 — Load your data

1. Open **Terminal**: press `⌘ + Space`, type `terminal`, press **Enter**.
   A plain window opens — this is just a place to type commands.
2. Copy this line, paste it into the window, and press **Enter**:

   ```
   cd ~/training-time-machine && .claude/skills/strava-extract/strava-extract.sh
   ```

   It automatically finds the Strava file in your Downloads. The first run
   takes a few minutes; it's done when you see **Done.**

## Part 5 — See your training history

In the same Terminal window, paste:

```
cd ~/training-time-machine/website && ./start.sh
```

Your browser opens <http://localhost:5178> with your dashboard, maps,
records and more. Keep the Terminal window open while browsing; press
`Ctrl+C` in it when you're finished.

## Later on

- **See the site again:** repeat Part 5 (it starts in seconds after the
  first time). Docker must be running (whale in the menu bar).
- **New data from Strava:** repeat Parts 3 and 4 — the new download
  replaces the old data automatically.

## If something goes wrong

| You see | Do this |
| --- | --- |
| `docker: command not found` | Docker Desktop isn't installed or hasn't finished starting — open it and wait for the whale icon |
| `Cannot connect ... database` | Same as above — start Docker, wait a minute, try again |
| `port is already allocated` or `Bind ... 3306 failed` | Another database program is using port 3306 — close it, or ask a technical friend to change the port in `docker-compose.yml` |
| `npm: command not found` | Node.js isn't installed — redo Part 1, then close and reopen Terminal |
| The page says "can't connect to server" | The Terminal window from Part 5 must stay open — run `./start.sh` again |
| macOS says the app "can't be opened" | System Settings → Privacy & Security → click **Open Anyway** |
