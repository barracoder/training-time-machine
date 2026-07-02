# Windows — step-by-step guide (no technical experience needed)

By the end you'll have a website on your own computer showing every ride
you've ever recorded. Nothing is uploaded anywhere — it all stays on your PC.

> **What you'll need (all free):**
> - **Node.js** (version 18 or newer) — runs the website
> - **Docker Desktop** — runs the database
> - A **Strava account** to request your data export
> - About 2 GB of free disk space
>
> Part 1 walks you through installing the first two.

## Part 1 — Install two free programs (one time only)

**Node.js** (runs the website):

1. Go to <https://nodejs.org> in your browser.
2. Click the big green **LTS** download button.
3. Open the downloaded file and click **Next** through the installer,
   accepting all the suggestions.

**Docker Desktop** (runs the database):

1. Go to <https://www.docker.com/products/docker-desktop/>.
2. Click **Download for Windows** and run the installer.
3. Restart the computer if it asks, then open **Docker Desktop** from the
   Start menu once — you can skip/close any sign-in screens. Leave it
   running (a little whale icon appears near the clock).

## Part 2 — Get this project

1. On the project's GitHub page, click the green **Code** button, then
   **Download ZIP**.
2. In your Downloads folder, right-click the ZIP → **Extract All…** →
   extract it to your home folder (e.g. `C:\Users\YourName`).
3. Rename the extracted folder to just `training-time-machine` if it has a
   longer name.

## Part 3 — Ask Strava for your data (free — it's your legal right)

1. Go to <https://www.strava.com/athlete/download_my_account> and log in.
2. Click **Request Your Archive**. (This does **not** delete anything.)
3. Wait for Strava's email — usually within a few hours — and use its
   download link. It saves a file like `export_1234567.zip`. Leave it in Downloads.

## Part 4 — Load your data

1. Press the **Windows key**, type `powershell`, press **Enter**. A blue
   window opens — this is just a place to type commands.
2. Copy this line, paste it into the blue window (right-click pastes), and
   press **Enter**:

   ```
   cd $HOME\training-time-machine; .claude\skills\strava-extract\strava-extract.ps1
   ```

   It automatically finds the Strava file in your Downloads. The first run
   takes a few minutes; it's done when you see **Done.**

   > If you see an error about "running scripts is disabled", run this
   > once, then try again:
   > `Set-ExecutionPolicy -Scope CurrentUser RemoteSigned`

## Part 5 — See your riding history

In the same blue window, paste:

```
cd $HOME\training-time-machine\website; .\start.ps1
```

Your browser opens <http://localhost:5178> with your dashboard, maps,
records and more. Keep the blue window open while browsing; close it (or
press `Ctrl+C` in it) when you're finished.

## Later on

- **See the site again:** repeat Part 5 (it starts in seconds after the
  first time). Docker Desktop must be running.
- **New data from Strava:** repeat Parts 3 and 4 — the new download
  replaces the old data automatically.

## If something goes wrong

| You see | Do this |
| --- | --- |
| `docker : The term 'docker' is not recognized` | Docker Desktop isn't installed or hasn't finished starting — open it and wait for the whale icon |
| `Cannot connect ... database` | Same as above — start Docker Desktop, wait a minute, try again |
| `port is already allocated` or `Bind ... 3306 failed` | Another database program is using port 3306 — close it, or ask a technical friend to change the port in `docker-compose.yml` |
| `npm : The term 'npm' is not recognized` | Node.js isn't installed — redo Part 1, then close and reopen PowerShell |
| The page says "site can't be reached" | The blue window from Part 5 must stay open — run `.\start.ps1` again |
