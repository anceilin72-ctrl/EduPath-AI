# Career Roadmap Generator

A MERN application that takes a target career and what somebody already knows, and produces an ordered, prerequisite-correct, dated plan for getting there — across any field, not just software.

Built as a college project. Everything here runs locally against MongoDB Atlas; the setup is in [SETUP.md](SETUP.md).

---

## First — what is a career roadmap?

A career roadmap is an ordered answer to the question *"I want to become X. What do I learn, in what order, and how long will it take?"*

The ordering is the whole point. Skills, exams and qualifications have **prerequisites**: you cannot usefully learn React before JavaScript, you cannot sit the CA Final before clearing CA Intermediate, and you cannot do clinical rotations before enrolling in a nursing degree. A list of things to learn is not a roadmap. A list where every item comes after the things it depends on, grouped into phases you can actually start on a Monday, is.

Most public roadmaps — roadmap.sh is the well-known one — are **static pictures**. Everyone who visits the frontend page sees the same diagram, including the person who has already spent two years writing JavaScript. There is nothing wrong with that; it is a reference chart. But it cannot answer *your* question, because it does not know anything about you.

This project's premise is that the useful version is **generated, not drawn**. The catalog of careers and skills is a graph held in the database. Your profile — your education, what you already know, how many hours a week you actually have, and your target date — is an input. A plan is computed from the two.

The concrete difference, from real engine output for the same target role (Full-Stack Developer, MERN):

| Learner | Steps | Hours | Duration | Phases |
| --- | --- | --- | --- | --- |
| School leaver, nothing known, 10 h/week | 19 | 730 | 75 weeks | 5 |
| Knows HTML/CSS, JavaScript and React, 20 h/week | 13 | 490 | 26 weeks | 3 |

Same role, same catalog, two-thirds less calendar time. Six steps were dropped for the second learner, and only three of those were the ones they claimed: the engine also inferred that somebody who knows React necessarily knows DOM manipulation, computer fundamentals and programming logic, and it says so, on the plan, so a wrong assumption can be corrected rather than silently applied.

---

## The idea the whole project is built around

Partway through building the catalog, the engine confidently told a prospective nurse that a B.Sc Nursing degree would take **eight months** — because it had 3,200 estimated hours and the learner had said 30 hours a week. That is arithmetically flawless and completely wrong. A four-year degree takes four years no matter how hard you work.

So the model distinguishes two kinds of time:

**Effort time** is time you can compress by working harder. Learning React is 60 hours; do 20 hours a week and it takes three weeks. Divide, and the answer is meaningful.

**Fixed time** is time set by an institution, not by you. A B.Sc Nursing degree is 208 weeks. A CA articleship is 104 weeks. Studying eighty hours a week does not shorten either. Thirteen of the 188 steps in the catalog carry a `fixedDurationWeeks`, and the engine schedules those by their declared duration — never by hours ÷ availability. They also get a phase to themselves, because a four-year commitment is not something you slot in beside two short courses.

Exams deliberately stay effort-based. How long it takes you to clear UPSC Prelims genuinely does depend on how hard you study, so those still divide.

This distinction runs all the way through to the interface. On the plan page, each phase is drawn to scale against its real duration, and the two kinds are drawn in different materials: **hatched amber for effort time**, **solid blue for fixed time** — hatched because effort is made of many separate sessions, solid because a degree is one unbroken commitment. Looking at a nursing plan, you see immediately that one blue block dwarfs everything else — which is the honest shape of that career, and the thing a generic roadmap chart cannot show you.

Here is the same nursing plan the engine actually produces at 10 hours a week:

```
P1  18 weeks   effort   Human Biology Basics · First Aid & BLS · Anatomy & Physiology
P2   6 weeks   effort   Patient Care & Clinical Procedures
P3 208 weeks   FIXED    B.Sc Nursing Degree
P4  52 weeks   FIXED    Clinical Rotations
P5   4 weeks   effort   State Nursing Council Registration
```

Seven steps, 288 weeks. Compare that with the developer path's nineteen steps in 75 weeks and you can see why counting steps is a bad measure of progress — which is why the plan page shows progress two ways at once.

---

## What the application does

The app is one guided path, not a set of screens to explore. A first-time visitor never has to work out where to go next.

**Land, sign up.** The landing page states the promise in one sentence — choose a career, say what you already know, get a step-by-step plan — and shows the six domains. Signing up takes a name, an email and a password, nothing else, because a wall of questions before the product has proved anything is how sign-up forms get abandoned.

**Set yourself up, in five short steps.** About you (what you are studying, your highest qualification, your current year, roughly where you are overall, and how many hours a *day* you can study), then the skills you already have, then the field that interests you, then the role inside it, then a short brief on that role with one button: **Generate My Roadmap**. A stepper across the top shows where you are and lets you go back. The earlier version asked for all of it on one long form, which is quicker to build and much harder to finish.

**Rate what you know, not just tick it.** Each skill you claim gets a level: beginner, intermediate or advanced. The level changes the plan rather than decorating it. Intermediate and advanced are pruned outright, exactly as a tick used to be. **Beginner keeps the step in your plan at half its usual hours, flagged as revision**, because "I've touched Python" and "I ship Python" are not the same claim and should not produce the same schedule. A calendar-bound step is never halved — you cannot revise your way through two years of articleship.

**See the gap on the plan itself.** *What you already know* sits at the top of the plan: skipped on the left, with anything that was assumed rather than claimed labelled as assumed, and what is left to learn on the right, with revision steps called out. It is read off the saved plan rather than fetched again, so the figure there is the plan's own figure by construction — two requests could disagree, and a gap screen that contradicts the plan below it is worse than no gap screen. Before you commit, the career page's preview shows the same arithmetic: steps left, study time, and how much your answers already took off.

**Read the plan as a shape, not a list.** Career readiness, estimated duration and your daily study time across the top, then phases running down the page as a chain, each drawn to scale against its real duration.

**Come back to a dashboard.** A returning learner lands on their goal, their progress bar, their readiness percentage, completed and remaining counts, their study streak, and one **Continue learning** card pointing at the next step they can actually start. Somebody who has not finished the wizard is sent to it instead — that fork is decided by one field, `profile.onboardedAt`, which the server sets when the wizard completes, rather than being inferred from whether some other response came back empty.

**Track progress** step by step: not started, in progress, completed, or skipped, with hours logged and your own notes. The plan page shows two progress meters, by steps done and by hours done, because on any plan containing a degree those two numbers disagree sharply and showing only the flattering one would be a small lie told repeatedly.

**Upload a resume** (text-based PDF or plain text), from its own page off the dashboard rather than as a step in the wizard. The server reads it against the catalog and proposes matches with a confidence level and the sentence from your resume that triggered each one. Nothing is written to your profile until you tick it. A scan proposes; you confirm. Silently trusting a scan is worse than not scanning at all, because a wrong match prunes the exact step you needed and shortens your plan without telling you.

**Browse 30 careers** across technology, business, creative, healthcare, government and education, each with its requirements, minimum education, demand level and typical salary range in INR.

**Compare careers.** The inverse question: given what you know, which of the 30 roles are you closest to? Ranked by hours of work remaining rather than by requirements ticked, so somebody who meets nine of ten requirements but is missing a three-year degree is not told they are ninety per cent ready.

### The interface

Dark by default. Surfaces are deep indigo-slate rather than black, which keeps them related to the navy in the printed diagrams and stops the two accent colours vibrating the way they do on pure black.

Two colours are load-bearing and are never spent on decoration: **amber means time you control** and **blue means time you cannot compress**. Because those two carry meaning in the data, buttons deliberately do not use them — the ordinary main action is a light chip on dark, and amber is spent on exactly one button in the whole app, the one that starts a plan. Every measured quantity is set in a monospace face with tabular figures, so a number always looks like a number and columns of them line up.

Long text is not deleted, it is folded away. The career page has one primary action and puts the full step list, the entry paths and the pacing controls behind disclosures, so the page you land on is short and the detail is one click away rather than gone.

---

## Architecture

Three diagrams are in [`docs/`](docs), as both `.svg` (sharp at any size) and `.png` (easier to paste into a report): [`architecture`](docs/architecture.svg) for the layers below, [`engine-pipeline`](docs/engine-pipeline.svg) for the seven steps, and [`er-diagram`](docs/er-diagram.svg) for the data model. `docs/make_diagrams.py` regenerates all three and needs nothing installed.

```
Browser (React 18 + Vite, port 3000)
   │
   │  fetch('/api/...')  →  Vite dev-server proxy
   ▼
Express 4 API (port 5000)
   │
   ├── middleware   JWT auth · multer upload · error handler
   ├── routes       thin: validate with Zod, call a service, respond
   ├── services     roadmap · progress · resume · narrative
   ├── engine       graph · phasePacker · generate      ← pure, no I/O
   └── data         188 nodes / 30 roles + validateCatalog()
   │
   ▼
MongoDB Atlas (Mongoose 8)
   users · careernodes · roles · roadmaps · progress
```
The engine is deliberately **pure**: `generateRoadmap({ role, nodes, profile, now })` takes plain objects and returns a plain object. It touches no database, no clock it was not handed, and no network. That is what makes it testable without a running Mongo, and it is why the test suites below can run on a machine with no `node_modules` at all.

The generation pipeline, in order:

1. **Collect** every node the target role requires, propagating importance down through prerequisites (`core` > `recommended` > `optional`). Only `optional` is dropped by default — so in this catalog `optional` means *genuinely not needed to get hired*, like a PhD for a lecturer.
2. **Expand what you know** transitively, so knowing React credits its prerequisites too.
3. **Prune the overlap**, keeping an auditable reason for every removal — "you marked this known", "you rated yourself intermediate", or "assumed known because you already know React". A step you rated **beginner** is not pruned: it stays at half its hours, marked `isRevision`, with `fullHours` kept beside the halved figure. A beginner rating outranks both the tick and the inference, so the most cautious claim you made about a skill is the one the plan believes. Calendar-bound steps are exempt — you cannot revise your way through two years of articleship.
4. **Topologically sort** the remainder (Kahn's algorithm) so no step precedes its prerequisites.
5. **Measure depth** — longest path from a root — which is what guarantees prerequisite order survives being split across phase boundaries.
6. **Pack into phases** of 3–6 content items, giving each calendar-bound step a phase of its own.
7. **Schedule**, projecting a finish date and, if you gave a target date, checking whether it is reachable and what weekly commitment would make it so.

### Tech stack

Node 18+ · Express 4 · MongoDB Atlas with Mongoose 8 · React 18 · React Router 6 · Vite 5 · Tailwind 3 · Zod for request validation · bcryptjs + jsonwebtoken for auth · multer + pdf-parse for resumes · optional `@google/generative-ai`.

Written in **plain ESM JavaScript, not TypeScript**, on purpose: the engine and its tests then run under bare `node` with no build step and no dependencies, which is what made the verification below possible.

### Folder layout

```
career-roadmap-generator/
├── docs/                   architecture · engine-pipeline · er-diagram (svg + png)
├── server/
│   ├── src/
│   │   ├── data/           the catalog: 188 nodes across 6 domains, 30 roles
│   │   ├── engine/         graph.js · phasePacker.js · generate.js
│   │   ├── models/         User · CareerNode · Role · Roadmap · Progress
│   │   ├── routes/         8 routers under /api
│   │   ├── services/       roadmap · progress · resume · narrative
│   │   ├── middleware/     auth · upload · errorHandler
│   │   ├── app.js          builds the Express app (no I/O)
│   │   ├── index.js        env check → connect → listen
│   │   ├── seed.js         loads the catalog into Atlas
│   │   └── inspect.js      read-only: prints what is stored (npm run data)
│   ├── tests/              4 dependency-free suites, 122 assertions
│   └── uploads/            resumes, gitignored
└── client/
    ├── src/
    │   ├── pages/          Landing · About · Auth · Setup · Dashboard
    │   │                   Careers · CareerDetail · Compare
    │   │                   Plans · PlanDetail · Profile · Resume · NotFound
    │   ├── components/     Layout · Stepper · CareerBrief · SkillPicker
    │   │                   SkillGapPanel · PhaseSpine · PhaseChain
    │   │                   PhaseCard · StepRow · ui.jsx
    │   ├── context/        AuthContext — token in localStorage
    │   └── lib/            api.js · format.js
    └── tools/
        └── check-client.mjs   static checks for imports and class names
```

---

## Getting it running

Full walkthrough, including MongoDB Atlas: **[SETUP.md](SETUP.md)**. The short version, from PowerShell:

```powershell
cd "C:\Users\ANCEILIN\Desktop\fsd\career-roadmap-generator\server"
```

```powershell
npm install
```

```powershell
Copy-Item .env.example .env
```

Open `.env`, paste your Atlas connection string into `MONGODB_URI`, put any long random string in `JWT_SECRET`, and leave `GEMINI_API_KEY` blank. Then:

```powershell
npm run seed
```

```powershell
npm run dev
```

Leave that window running, open a **second** PowerShell window, and:

```powershell
cd "C:\Users\ANCEILIN\Desktop\fsd\career-roadmap-generator\client"
```

```powershell
npm install
```

```powershell
npm run dev
```

Then open <http://localhost:3000>.

---

## What the AI does, and what it does not

`GEMINI_API_KEY` is optional and ships blank. With it blank, the app is fully functional — it prints `AI narration: off` at startup and everything works.

The deterministic engine does **all** the planning: which steps, in what order, in which phase, over how many weeks. The AI never touches any of that. Its only job is to reword the explanatory narrative — the paragraph introducing your plan and the note on each phase — in warmer prose than a template produces. A rule-based writer sits behind it and produces the same narrative from the same numbers when there is no key.

The AI's output is then **validated against the plan before it is shown to you.** Every number in the generated text that carries a unit ("four months", "120 hours") is checked against the plan's actual figure for that unit; if the model has invented or rounded a duration, the narrative is rejected and the rule-based version is used instead. The check is unit-aware rather than a flat list of allowed integers, because small integers legitimately appear in the text as phase numbers, and a flat allow-list would wave through a wrong timeline.

This is the part of the project most worth defending in a viva: an LLM that decided your timeline would be unfalsifiable and occasionally dangerous. An LLM that paraphrases a timeline computed elsewhere, and gets checked against it, is neither.

---

## Verification

The server's logic is pure and dependency-free, so its tests run with bare `node` — no `npm install` needed:

```powershell
cd "C:\Users\ANCEILIN\Desktop\fsd\career-roadmap-generator\server"
```

```powershell
npm test
```

Last run — **122 assertions, 0 failures** across four suites:

| Suite | Assertions | What it establishes |
| --- | --- | --- |
| `engine` | 46 | Prerequisite order holds for all 30 roles at 6 availability levels; calendar-bound steps are never divided by hours per week; distinct profiles produce materially different plans; self-rated levels prune, halve or leave a step alone in the way the spec says, and readiness in hours always adds up |
| `progress` | 30 | Status transitions, timestamps, hours logged, the two summary percentages, "next up" never suggesting a blocked step, and the study streak across timezones and gaps |
| `resume` | 20 | Match confidence, alias handling, and that a scan never writes to the profile |
| `narrative` | 26 | The validator rejects invented numbers and accepts the rule-based writer's own output for all 30 roles |

Sixteen of the engine's assertions exist only because of the skill-level rule, and the awkward cases are the point of them: that a beginner rating survives a contradicting tick, that halving one step never moves its neighbours' hours, that a calendar-bound step rated beginner keeps its full length, and that phase hours and plan totals still agree once steps have been adjusted. A feature that changes the arithmetic needs tests that check the arithmetic.

The catalog is checked separately by `validateCatalog()`, which every entry path calls before touching the database: **zero dangling prerequisites, zero cycles, zero orphan nodes** across 188 nodes and 30 roles. The seeder validates before it connects, so a typo in seed data can never leave the database half-written.

The client cannot be tested the same way — it needs a browser and a Tailwind compile. So it has a static checker for the two mistakes that a read-through misses: an import that does not resolve or names an export that isn't there, and a class name Tailwind does not know. The second matters more than it sounds, because a misspelled utility produces **no error at all** — `text-ink-fiant` simply emits no CSS. On a design where amber versus blue carries actual meaning, that is a wrong statement rather than a cosmetic slip.

```powershell
cd "C:\Users\ANCEILIN\Desktop\fsd\career-roadmap-generator\client"
```

```powershell
npm run check
```

Last run: **28 modules, 189 import bindings verified, 285 class tokens, 16 legal colour tokens, 19 component classes, no problems.** The checker's own ten failure modes were verified by deliberately introducing each bug and confirming it was caught.

Two things the checks cannot cover, and it is worth being straight about them: nothing here proves the app renders correctly in a browser, and nothing here talks to Atlas. `npm run dev` on your own machine is still the only real test of both.

---

## API

All routes are under `/api`. Authenticated routes need `Authorization: Bearer <token>`.

| Method | Route | Auth | Purpose |
| --- | --- | --- | --- |
| GET | `/health` | — | Liveness; the quickest confirmation that setup worked |
| POST | `/auth/register` | — | Create an account, returns a token |
| POST | `/auth/login` | — | Sign in, returns a token |
| GET | `/auth/me` | ✓ | Current user with profile and resume metadata |
| PATCH | `/auth/me/profile` | ✓ | Update profile fields, assigned one by one; `onboarded: true` stamps `onboardedAt` once |
| GET | `/dashboard` | ✓ | One snapshot for the home screen: goal, current plan, progress, streak, study time. Takes an optional `tzOffset` so day boundaries match the learner's clock |
| GET | `/roles` | — | Browse careers, filterable by domain and search |
| GET | `/roles/domains` | — | Domains with role counts, for the filters |
| GET | `/roles/:key` | — | One role with its requirements resolved to nodes |
| GET | `/nodes` | — | Catalog steps, for the skill picker |
| POST | `/nodes/resolve` | — | Resolve a list of keys to full nodes |
| GET | `/nodes/:key` | — | One step with prerequisites and resources |
| POST | `/roadmaps/preview` | ✓ | Generate without saving |
| POST | `/roadmaps` | ✓ | Generate and save |
| GET | `/roadmaps` | ✓ | The user's plans with progress summaries |
| GET | `/roadmaps/:id` | ✓ | One plan, its progress and a recalculated summary |
| POST | `/roadmaps/:id/regenerate` | ✓ | Rebuild from the current profile, reporting what changed |
| PATCH | `/roadmaps/:id/archive` | ✓ | Archive or restore |
| DELETE | `/roadmaps/:id` | ✓ | Delete a plan and its progress |
| GET | `/progress/:roadmapId` | ✓ | Progress rows for a plan |
| PUT | `/progress/:roadmapId/:nodeKey` | ✓ | Update one step; returns the recalculated summary |
| DELETE | `/progress/:roadmapId` | ✓ | Reset all progress on a plan |
| POST | `/resume/upload` | ✓ | Upload and scan; proposes matches, writes nothing |
| POST | `/resume/confirm` | ✓ | Commit the ticked matches to the profile |
| GET | `/resume` | ✓ | Current resume metadata and past detections |
| DELETE | `/resume` | ✓ | Unlink the file from disk; confirmed skills stay |
| POST | `/analysis/gap` | ✓ | Gap analysis against one role |
| GET | `/analysis/role-fit` | ✓ | Every role ranked by how close you are |

---

## Data model

Five collections. Two hold the catalog and are populated by the seeder; three hold user data.

**`careernodes`** — one step on the way to a career, which might be a skill, an exam, a certification, a qualification or a period of experience. Identified by a human-readable `key` slug. `prerequisites` is an array of other nodes' keys, which is what makes the catalog readable and editable as source files rather than as ObjectId soup. Carries `estimatedHours`, an optional `fixedDurationWeeks`, `difficulty`, `aliases` (used by resume matching), `resources`, `checkpoints` and `projectIdeas`.

**`roles`** — a target career. `requiredNodes` is a list of `{ nodeKey, importance, rationale }`, so the catalog records *why* a role needs a thing, not just that it does. Also `minimumEducation`, `salaryINR`, `demandLevel` and `typicalEntryPaths`.

**`users`** — credentials plus an embedded `profile` and an embedded `resume` (original name, stored name, detected keys). The profile is entirely engine input: education level and current year, current status, overall `experienceLevel`, `knownNodeKeys`, `skillLevels` (a map of node key → beginner | intermediate | advanced), `hoursPerDay` with the derived `hoursPerWeek`, an optional `targetDate`, `targetRoleKey`, city, and `onboardedAt`. `hoursPerWeek` is always `hoursPerDay × 7` and is written in one place only, so the figure the learner chose and the figure the engine plans with cannot drift apart. `passwordHash` is `select: false` and stripped in `toJSON`, so it cannot reach a response by accident.

**`roadmaps`** — a generated plan, stored as a **snapshot**: the phases embed copies of each step's title, hours, resources and description. That is deliberate denormalisation. If the catalog is edited next week, a plan somebody is halfway through does not silently change under them, and `engineVersion` records which version of the engine produced it. Each embedded step also carries `fullHours`, `isRevision` and `selfRatedLevel`, so a plan can always explain why one of its steps is shorter than the catalog says.

**`progresses`** — one row per `(userId, roadmapId, nodeKey)`, with status, hours logged, timestamps and notes. Kept separate from the plan so regenerating a plan does not lose what you have already done.

A full entity-relationship diagram is in [`docs/er-diagram.svg`](docs/er-diagram.svg), which shows all five collections, their embedded sub-documents, and — importantly — which relationships are true `ObjectId` references and which are string-key lookups.

### Seeing what is stored

The documents live in Atlas, in a database called `careerRoadmap`. Uploaded resume **files** do not: they stay on the machine running the server, in `server/uploads`, and only the filename is written to the database. A login token lives in the browser's `localStorage` and nowhere else.

Two ways to look. In a browser, Atlas → *Database* → *Browse Collections* shows the live documents with nothing to install. From a terminal, in the `server` folder:

```powershell
npm run data
```

That prints every collection with its document count, then each account with its profile, skill ratings, plans and progress, then any resume files on disk. Adding `-- --full` also dumps one complete document per collection as JSON. The script is read-only, and it reports the password field as a bcrypt hash of a given length and cost without ever printing it.

---

## Design decisions worth knowing about

**Prerequisites reference string keys, not ObjectIds.** Seed data stays human-readable and a team member can add a node by hand; keys resolve to a map once at load time.

**Implied-known pruning is an assumption, and is labelled as one.** If you know React, the engine credits DOM manipulation and JavaScript too. That is usually right and sometimes wrong, so every pruned step appears in a "skipped" section with the reason, and inferred credits are badged as inferred wherever they are shown.

**Blocked steps are marked, not disabled.** The graph's order is advice. Somebody who wants to start with the interesting thing and backfill is not making a mistake the interface should physically prevent.

**Phases are sized by content, not by calendar.** An earlier version time-boxed phases at four weeks, which at 10 hours a week produced ten phases of one item each — technically correct, useless as a plan. A phase is now 3–6 content items, and availability is a soft signal.

**Minimum education is reported, never used to hide a career.** If a role needs a degree you have not started, the plan says so plainly and continues. Aiming at something that needs a qualification you do not yet have is a plan, not an error.

**A skill level is a claim about strength, so it changes the plan.** Three levels rather than a checkbox, because "I've touched Python" and "I ship Python" cannot honestly produce the same schedule. Intermediate and advanced prune. Beginner halves. The halved step says so on its own row — a suspiciously short step that does not explain itself reads as a bug, and the learner has no way to tell the difference.

**The streak is real or it is zero.** Consecutive days on which a step was actually completed, counted across every plan, using the browser's UTC offset so a day ends when the learner's day ends. A fresh account shows 0. A fabricated streak would be the one number on the dashboard that could be manufactured, which is exactly why it isn't.

**One endpoint for the dashboard, not four.** The goal, the plan, the progress and the streak arrive together in one snapshot. Fetched separately they would be four round trips, four loading states, and four chances for two of the numbers to disagree because they were read a moment apart.

### Known limitations

The estimated hours are researched judgements, not measurements — they are plausible, not authoritative, and the app presents them as estimates throughout. Salary ranges are indicative INR figures for the Indian market and are not live data. Resume scanning is keyword-and-alias matching over extracted text; it will not read a scanned image, and it makes no attempt to judge how *well* you know something. The catalog covers 30 roles, which is a sample of the labour market, not a census.

The implied-known inference can be argued with, but only so far. Rating a skill **beginner** does override the inference — the step comes back at half its hours — so you can keep React and say your DOM knowledge is shaky. What you still cannot say is "I know React and I know nothing about the DOM", because there is no level below beginner. The halving factor is also a flat one-half for every subject, which is a reasonable average and certainly wrong in individual cases.

The study streak counts days on which a step was marked complete, which measures logging as much as studying. Somebody who studies for three hours and forgets to tick anything gets no credit, and that is a real limitation of measuring effort through an interface rather than observing it.

---

## Security notes

`.env` and `server/uploads/*` are gitignored — the second because uploads are real resumes. There is no fallback value for `JWT_SECRET`; the token signer throws if it is unset, because a default secret in source is worse than a crash. Passwords are bcrypt-hashed and the hash is unreadable through the API. Uploaded files are stored under a `crypto.randomUUID()` name, never a name taken from the request. `DELETE /api/resume` unlinks the file from disk rather than just dropping the reference. Login returns one identical message for an unknown email and a wrong password. The error handler hides stack traces and internal messages when `NODE_ENV` is `production`. CORS uses an explicit allow-list rather than reflecting any origin.
