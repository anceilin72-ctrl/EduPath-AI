# Setup guide (Windows / PowerShell)

Everything you need to get the Career Roadmap Generator running on a fresh Windows machine. Follow it in order. It takes about twenty minutes, most of which is waiting for downloads.

Commands are given **one per code block**. Copy and run them one at a time — pasting several lines at once into PowerShell can drag continuation characters along with them and produce confusing errors.

The database runs **on your own machine**. That is a deliberate choice: many college, hostel and office networks block outbound port 27017, which is the port every MongoDB client needs, and when that happens a cloud database is unreachable no matter how its settings are configured. A local server has no network in the way, works offline, and cannot fail during a demonstration because the Wi-Fi is restricted. If you would rather use MongoDB Atlas in the cloud, the app supports it unchanged — see *Using Atlas instead* near the end.

---

## What you need first

**Node.js 18 or newer.** Check with:

```powershell
node --version
```

If that prints a version below 18, or errors, install the LTS build from <https://nodejs.org> and reopen PowerShell.

**MongoDB Community Server.** Free, no account needed. Step 2 walks through it.

You do **not** need a Google AI key — the app generates complete roadmaps without one.

---

## Step 1 — Get into the project folder

```powershell
cd "C:\Users\ANCEILIN\Desktop\fsd\career-roadmap-generator"
```

Confirm you are in the right place — you should see `client`, `server` and `README.md`:

```powershell
dir
```

The quotes around the path matter whenever a path contains spaces. This one doesn't, but keep the habit.

---

## Step 2 — Install MongoDB on your machine

Do the download in a browser; then there are two commands to check it worked.

1. Go to <https://www.mongodb.com/try/download/community>. Choose the current version, platform **Windows**, package **msi**, and download it. It is around 350 MB.
2. Run the installer. Choose **Complete** rather than Custom.
3. On the service screen, leave **Install MongoDB as a Service** ticked, with *Run service as Network Service user* and the default service name `MongoDB`. This is the setting that matters most: it means the database starts automatically whenever Windows boots, so you never have to start it by hand.
4. Leave **Install MongoDB Compass** ticked. Compass is a window that shows you the contents of your database, and it is the easiest way to prove to an examiner that your data is really being stored.
5. Finish the installer. Nothing else needs configuring — a fresh install listens on port 27017, accepts connections only from your own machine, and has no username or password.

Now confirm the service is running:

```powershell
Get-Service MongoDB
```

You want `Status` to read `Running`. If it says `Stopped`, start it — this one needs an Administrator PowerShell window:

```powershell
Start-Service MongoDB
```

And confirm something is actually listening on the port:

```powershell
Test-NetConnection 127.0.0.1 -Port 27017
```

`TcpTestSucceeded : True` means you are ready. This is the same test that failed against Atlas on a restricted network; against your own machine there is no firewall in between.

You do not create a database or any collections by hand. MongoDB creates `careerRoadmap` the first time the app writes to it, in step 5.

---

## Step 3 — Install the backend dependencies

```powershell
cd "C:\Users\ANCEILIN\Desktop\fsd\career-roadmap-generator\server"
```

```powershell
npm install
```

This pulls down Express, Mongoose, Zod, multer and the rest. A few warnings about deprecated transitive packages are normal and can be ignored.

---

## Step 4 — Configure the environment

Create your own `.env` from the template:

```powershell
Copy-Item .env.example .env
```

Open it in Notepad:

```powershell
notepad .env
```

Fill in two things and save.

**`MONGODB_URI`** — the template already contains the right value for a local server, so there is usually nothing to change:

```
MONGODB_URI=mongodb://127.0.0.1:27017/careerRoadmap
```

Use `127.0.0.1` and **not** `localhost`. On Windows, `localhost` resolves to the IPv6 address `::1` first, while MongoDB listens on IPv4 by default, so `localhost` produces a connection-refused error that looks like the database is broken when it is running perfectly. There is no username or password because a default local install has none, and it accepts connections only from your own machine.

**`JWT_SECRET`** — any long random string. If you want one generated for you, run this in a *different* PowerShell window and paste the result:

```powershell
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

**`GEMINI_API_KEY`** — **leave it empty.** The app is designed to run without it. The deterministic engine does all the planning either way; the key only changes who writes the explanatory prose. If you do want the AI narration later, get a free key from <https://aistudio.google.com/apikey> and paste it in, then restart the server.

The remaining values (`PORT=5000`, `CLIENT_ORIGIN=http://localhost:3000`, `JWT_EXPIRES_IN=7d`) already match what the frontend expects. Leave them alone unless something else on your machine is using port 5000.

`.env` is gitignored. Your settings will not end up in a commit or a submission zip.

---

## Step 5 — Load the career catalog

```powershell
npm run seed
```

You should see the catalog validate, then connect, then write. Expected output:

```
Validating catalog... ok
  188 career steps across 6 domains
  30 target roles
  13 steps have a fixed institutional duration

Connecting to MongoDB on this machine (port 27017)... ok (careerRoadmap)

Writing catalog...
```

This is also the moment the `careerRoadmap` database comes into existence — MongoDB creates a database on first write, so there was nothing to set up by hand.

The seeder validates the whole catalog **before** it opens a database connection, so a bad edit to the seed data can never leave your database half-written. It also upserts rather than inserts, so running it again is safe — it updates the catalog and leaves user accounts, plans and progress untouched.

If you ever want to wipe the catalog and reload it from scratch:

```powershell
npm run seed -- --fresh
```

That clears nodes and roles only. User data survives.

---

## Step 6 — Start the API

```powershell
npm run dev
```

You should see:

```
AI narration: off (GEMINI_API_KEY is blank) — using the rule-based writer.

Database: MongoDB on this machine (port 27017)

API listening on http://localhost:5000
Health check:      http://localhost:5000/api/health
```

The "AI narration: off" line is expected and is not a problem. The `Database:` line is there so that if the app ever looks empty, you can see at a glance which database it is talking to.

**Leave this window running.** The server reloads itself whenever you edit a file.

Check it works by opening <http://localhost:5000/api/health> in a browser. You should get `{"status":"ok",...}`.

---

## Step 7 — Start the frontend

Open a **second PowerShell window**. Do not close or interrupt the first one; both servers need to run at the same time.

```powershell
cd "C:\Users\ANCEILIN\Desktop\fsd\career-roadmap-generator\client"
```

```powershell
npm install
```

```powershell
npm run dev
```

Vite will print a local address, which will be <http://localhost:3000>. Open it.

The frontend calls `/api/...` and Vite forwards those requests to the API on port 5000, so there are no hostnames hardcoded in the React code and no CORS problems in development.

---

## Step 8 — Confirm it actually works end to end

In the browser, the app leads you through this in order — you should not have to hunt for any of it.

1. **Sign up.** Name, email, and a password of at least eight characters. It is your own database.
2. **Complete the setup wizard.** Five short steps: about you (including **how many hours a day** you can genuinely study — this sets every date in the plan), then your skills, then a field, then a role, then a brief on that role. Rate a few skills, and deliberately mark one *Strong* and one *Just started*, because those two behave differently and item 6 below is where you see it.
3. **Generate the plan** from the last step of the wizard.
4. **Look at the plan.** Career readiness, estimated duration and your daily study time across the top, then the phases running down the page with real week counts and a projected finish date. Open **What you already know** to see what was skipped and why, against what is left to learn.
5. **Compare two careers.** Open *Full-Stack Developer (MERN)* and also *Staff Nurse*. On the nursing plan the phase blocks are drawn very differently: hatched amber is effort time you can compress by studying harder, solid blue is fixed institutional time you cannot, and the blue block for the degree is enormous. That is the honest answer, and it is the point of the project.
6. **Find the skill you marked *Just started*.** It is still in the plan, at half its usual hours, with a *Revision* badge and a line saying why. The one you marked *Strong* is not in the plan at all — it is in the skipped list, with the reason. A plain checkbox could not have produced either of those.
7. **Tick a step complete.** Both progress meters should move, by different amounts.
8. **Go to the dashboard.** Your goal, progress, readiness, completed and remaining counts, a study streak that now reads 1 day because you completed something today, and a *Continue learning* card pointing at the next step you can actually start.
9. **Change your study hours on your profile, then regenerate the plan.** The number of weeks should change while the total hours stay the same. That is the whole premise of the project working.

---

## Running the tests

The server's logic is pure JavaScript with no dependencies, so its tests run under bare `node`. You can run them even before `npm install`.

From the `server` folder:

```powershell
npm test
```

Expect **122 assertions and 0 failures** across four suites. To run just one:

```powershell
npm run test:engine
```

The others are `test:progress`, `test:resume` and `test:narrative`.

The client has a static checker instead of a test suite, because testing it properly would need a browser. It verifies that every import resolves to something that is actually exported, and that every Tailwind class name is real — a misspelled utility class produces no error at all, just silently missing styling. From the `client` folder:

```powershell
npm run check
```

Expect `No problems found.`

---

## Starting it up again next time

Everything in steps 2 to 5 was **one-time setup**. You do not reinstall MongoDB, and you do not re-seed. Because MongoDB was installed as a Windows service, the database is already running before you open PowerShell — it starts with the machine.

So opening the project is two PowerShell windows and nothing else.

First window:

```powershell
cd "C:\Users\ANCEILIN\Desktop\fsd\career-roadmap-generator\server"
```

```powershell
npm run dev
```

Second window:

```powershell
cd "C:\Users\ANCEILIN\Desktop\fsd\career-roadmap-generator\client"
```

```powershell
npm run dev
```

Then open <http://localhost:3000> and log in. Both windows have to stay open while you use the app; closing the first one breaks every request the page makes. No internet connection is needed for any of this.

Two things can interrupt the routine, and neither means starting over.

**The service is not running.** Rare, but possible if you stopped it or something interfered with the install. The symptom is the API refusing to start with a message telling you to check the service. Confirm and fix:

```powershell
Get-Service MongoDB
```

```powershell
Start-Service MongoDB
```

**You edited the career catalog.** Only then do you re-run `npm run seed`. It upserts, so it updates the catalog and leaves user accounts, plans and progress untouched.

To check at any point that your data is still there:

```powershell
npm run data
```

---

## Where your data actually lives

Three separate places, and it is worth knowing which is which.

**Your documents are in MongoDB, on this machine.** The database is called `careerRoadmap` and holds five collections. Two of them are the career catalog, written by `npm run seed`: `careernodes` (188 steps) and `roles` (30 target roles). The other three are yours, written by the app as you use it: `users` (one document per account, including your profile and skill levels), `roadmaps` (one document per generated plan, stored as a full snapshot) and `progresses` (one row per step you tick complete). The files behind all of it sit in `C:\Program Files\MongoDB\Server\<version>\data` — you never touch that folder directly; the database owns it.

**Uploaded resume files stay outside the database**, in `server\uploads`. Only the filename is stored in MongoDB. That is deliberate — a resume is a personal document and there is no reason to put its contents in a database for a college project.

**Your login token lives in your browser**, in `localStorage`. Clearing your browser data logs you out and nothing else.

To look at any of it, you have two options.

**In a window, with Compass.** Open MongoDB Compass, which the installer put on your Start menu, and connect to:

```
mongodb://127.0.0.1:27017
```

Then click `careerRoadmap` on the left and pick a collection. You will see the real documents. This is the one to use in a viva, because it is visibly the live database rather than something the app is claiming.

**From PowerShell, in a readable form.** From the `server` folder:

```powershell
npm run data
```

That prints every collection with its document count, then each account with its profile, skill ratings, plans and progress, then any resume files sitting on disk. It only reads — nothing in it writes or deletes. To see the raw shape of the documents as well:

```powershell
npm run data -- --full
```

That adds one complete document per collection as JSON. Note what it says about your password: the `users` document holds a bcrypt hash, and the script reports the hash's length and cost without printing it. Passwords are never stored in a readable form, and the field is excluded from every API response as well.

---

## Using Atlas instead

Nothing in the application is tied to a local database — Mongoose speaks the same protocol to both, so only the `MONGODB_URI` line in `.env` changes. Use Atlas if you want the data in the cloud, or if you are asked to demonstrate a hosted database.

1. Sign up at <https://www.mongodb.com/cloud/atlas/register> and create a **free M0 cluster**. Any provider and the nearest region are fine.
2. **Create a database user.** *Database Access* → *Add New Database User*. Choose a password with **no `@ : / ? # %` characters** — those must be percent-encoded inside a connection string, and forgetting to do that is the most common setup failure.
3. **Allow your IP.** *Network Access* → *Add IP Address*. On a network that hands out a new address every few days, use *Allow Access from Anywhere* (`0.0.0.0/0`) — acceptable for local development only, never for anything real. Wait until the row reads `Active` rather than `Pending`; connecting during that window fails in a way that looks permanent.
4. **Copy the connection string** from *Database* → *Connect* → *Drivers*. Replace `<db_password>` with the real password and insert the database name before the `?`:

```
mongodb+srv://myuser:MyRealPassword@cluster0.ab1cd.mongodb.net/careerRoadmap?retryWrites=true&w=majority
```

5. Put that in `MONGODB_URI` in `server\.env`, then `npm run seed` and `npm run dev` as before. The startup line will read `Database: MongoDB Atlas (...)` so you can see which one you are on.

**Before you rely on this, test whether your network allows it.** Many college, hostel and office networks block outbound port 27017, and when they do, Atlas is unreachable regardless of your settings — the failure looks exactly like a wrong password or a missing allowlist entry, which is what makes it such a waste of an evening. Check first:

```powershell
$h = (Resolve-DnsName -Type SRV _mongodb._tcp.cluster0.ab1cd.mongodb.net | Select-Object -First 1).NameTarget; Test-NetConnection $h -Port 27017
```

`TcpTestSucceeded : True` means Atlas will work from this network. `False` means it cannot, and no connection string will change that — stay local, or use a phone hotspot for as long as the app is running.

---

## When something goes wrong

The server translates the common connection failures into plain-English messages at startup rather than showing you a raw driver stack trace, so read what it prints before searching for the error text.

**`Missing required environment variable(s): MONGODB_URI`**
You skipped step 4, or you created `.env` somewhere other than the `server` folder. It must sit next to `package.json` inside `server`. Check with `dir .env` from that folder.

**`Nothing is listening on that address, so the MongoDB server is probably not running`**
Exactly what it says. Check the service, and start it from an Administrator window if it is stopped:

```powershell
Get-Service MongoDB
```

```powershell
Start-Service MongoDB
```

If `Get-Service` reports that no service named MongoDB exists, the installer did not register it — re-run the MSI and make sure *Install MongoDB as a Service* is ticked.

**`Nothing answered on the IPv6 loopback address`**
Your `MONGODB_URI` says `localhost`. Change it to `127.0.0.1`. Windows resolves `localhost` to `::1` first and MongoDB listens on IPv4, so the two never meet. This costs people a surprising amount of time because everything about the setup is otherwise correct.

**The app runs but every plan is empty, or careers do not load**
The catalog was never seeded, or was seeded into a different database. Re-run `npm run seed` from the `server` folder and watch for the "188 career steps" line. Then check what actually landed:

```powershell
npm run data
```

If `careernodes` shows 0, the seed did not reach this database. Compare the `Database:` line the API prints at startup with the one `npm run data` prints — they must match.

**`EADDRINUSE: address already in use :::5000`**
Something else has port 5000, often a previous run of this server that did not shut down. Find and stop it:

```powershell
Get-Process -Id (Get-NetTCPConnection -LocalPort 5000).OwningProcess
```

Or change `PORT` in `.env` and update the `target` in `client/vite.config.js` to match.

**The frontend loads but every request fails**
The API window is not running, or it crashed. Look at the first PowerShell window. Both must be running at once. Vite prints `http proxy error ... ECONNREFUSED` once per failed request, which only ever means "nothing is listening on port 5000" — fix the API and Vite reconnects by itself, with no need to restart it.

**`npm run dev` in the client says port 3000 is taken**
Vite will offer another port. Accept it, but then also add that origin to `CLIENT_ORIGIN` in `server/.env` and restart the API, or CORS will reject the requests.

**Resume upload says the file is not supported**
It accepts PDF, `.txt` and `.md`, up to 2 MB. A PDF exported from Word works; a scanned or photographed page does not, because there is no text inside it to read. In Word, use *File → Save As* and choose PDF.

### If you are using Atlas

**`Atlas rejected the username or password`**
The password in the connection string is wrong, or you left the literal `<db_password>` placeholder in place, or the password contains a character that needs percent-encoding. Simplest fix: go to *Database Access* in Atlas, edit the user, set a password made only of letters and digits, and update `.env`.

**`Could not reach the cluster before timing out`**
Two causes, and they are easy to confuse. Usually the IP allowlist: Atlas → *Network Access* → *Add Current IP Address*, or *Allow Access from Anywhere* if your network keeps changing address, then wait for the row to read `Active`. But if the allowlist is already open and Active, the cause is your network blocking outbound port 27017 — run the `Test-NetConnection` check from *Using Atlas instead* above. A `False` there cannot be fixed with any setting; run MongoDB locally, which is what the main guide does.

**`querySrv ECONNREFUSED _mongodb._tcp.cluster0…`**
A `mongodb+srv://` string asks your network's DNS server for an **SRV record** first, and plenty of college, hostel and office networks refuse to answer that kind of query. The cluster is fine; the lookup never got out.

*First, check whether it is really the DNS.* Ask for the record yourself, substituting your own cluster hostname:

```powershell
Resolve-DnsName -Type SRV _mongodb._tcp.cluster0.ab1cd.mongodb.net
```

If that prints three `ac-…-shard-00-0X.ab1cd.mongodb.net` hosts on port `27017`, DNS is working and the problem is elsewhere. If it errors, that is your answer.

*Second, use the long-form connection string instead.* Every `mongodb+srv://` string is shorthand for a plain `mongodb://` one that names the servers directly and needs no SRV lookup at all. You can write it out by hand from two DNS queries — the hosts from the SRV record above, and the options from the TXT record:

```powershell
Resolve-DnsName -Type TXT cluster0.ab1cd.mongodb.net
```

That returns something like `authSource=admin&replicaSet=atlas-abc123-shard-0`. Put the pieces together into one line and paste it into `MONGODB_URI`, replacing the shard hostnames and `replicaSet` with your own:

```
mongodb://myuser:MyRealPassword@ac-xxxxxxx-shard-00-00.ab1cd.mongodb.net:27017,ac-xxxxxxx-shard-00-01.ab1cd.mongodb.net:27017,ac-xxxxxxx-shard-00-02.ab1cd.mongodb.net:27017/careerRoadmap?ssl=true&replicaSet=atlas-abc123-shard-0&authSource=admin&retryWrites=true&w=majority
```

It is ugly and it is pinned to today's cluster topology, which is exactly why `+srv` exists — but it connects on a network that blocks SRV lookups.

*Third, if that also times out, the network is blocking the database port itself.* Check directly:

```powershell
Test-NetConnection ac-xxxxxxx-shard-00-00.ab1cd.mongodb.net -Port 27017
```

`TcpTestSucceeded : True` means the port is open and the trouble was only ever DNS. `False` means outbound 27017 is firewalled, and no connection string will get through it. Either run MongoDB locally as the main guide describes, or tether to a phone hotspot for as long as the app is running.

**Atlas says the cluster is `Paused`**
A free M0 cluster is paused automatically after about sixty days with no connections. Click **Resume** and wait a couple of minutes; pausing does not delete data.

**A plan looks wrong or empty**
See "The app runs but every plan is empty" above — it is almost always an unseeded database.

---

## Handing this in

Before zipping the project for submission:

```powershell
cd "C:\Users\ANCEILIN\Desktop\fsd\career-roadmap-generator"
```

Delete both `node_modules` folders — they are large, reinstallable, and not your work:

```powershell
Remove-Item -Recurse -Force server\node_modules, client\node_modules
```

Then check that nothing private is in the folder. `.env` holds your `JWT_SECRET` — and your database password too, if you used Atlas — and `server\uploads` may hold real resumes. Both are gitignored, but a zip does not respect `.gitignore`:

```powershell
Get-ChildItem -Recurse -Force -Include .env, *.pdf | Select-Object FullName
```

Delete anything that turns up, and keep `server\.env.example` — that is the template your evaluator needs. Ship `README.md`, `SETUP.md`, `docs\` (the three diagrams), `client`, and `server`.

Your evaluator will need MongoDB on their own machine, which is what step 2 of this guide is for. Worth saying in your submission notes: the project runs entirely offline, with no cloud account and no API key required.
