#!/usr/bin/env python3
"""
Generates the three diagrams that accompany the Career Roadmap Generator README.

Hand-authored SVG rather than a Mermaid render, for two reasons: it needs no
dependencies (the sandbox cannot install mermaid-cli), and SVG drops straight
into a Word report at any size without going blurry.

Two rendering constraints shaped the code, both learned by looking at the output:

  * No <marker> arrowheads. Markers are valid SVG, but Word's renderer and
    ImageMagick both drop them, so every arrowhead here is an explicit polygon.
  * No <pattern> hatching. patternTransform is widely unsupported and the hatch
    made the text underneath unreadable anyway. The ochre "effort" emphasis is
    carried by a soft fill and a heavy border instead.

The diagrams keep a light palette even though the application itself is dark. They
are read on paper and inside a report, where a dark page prints as a solid block of
ink. What carries over from the interface is not the exact hex but the *meaning* of
the two load-bearing colours, so a reader who has used the app recognises them:
    effort  #A9660B  ochre — time you can compress by working harder
    fixed   #2E5AA8  blue  — time set by an institution, not by you
"""

import math
import os
import sys

INK = "#16223D"
INK_SOFT = "#3D4A69"
INK_FAINT = "#6C7791"
PAPER = "#F1F3F7"
CARD = "#FFFFFF"
RULE = "#D6DBE5"
EFFORT = "#A9660B"
EFFORT_SOFT = "#FBF1DE"
FIXED = "#2E5AA8"
FIXED_SOFT = "#E4EBF7"
DONE = "#1B6E52"
DONE_SOFT = "#E1F0E9"

SANS = "Archivo, 'Segoe UI', system-ui, sans-serif"
MONO = "'IBM Plex Mono', Consolas, ui-monospace, monospace"

# Measured against the rendered output rather than guessed: at these sizes the
# sans face averages a little under 0.55em per character.
CHAR_W = 0.55


def esc(s):
    return s.replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;")


def wrap(s, width_px, size):
    """Greedy wrap on an estimated character width. Returns a list of lines."""
    limit = max(8, int(width_px / (size * CHAR_W)))
    words, lines, current = s.split(), [], ""
    for word in words:
        candidate = f"{current} {word}".strip()
        if len(candidate) <= limit:
            current = candidate
        else:
            if current:
                lines.append(current)
            current = word
    if current:
        lines.append(current)
    return lines


def head(w, h, title, subtitle):
    return (
        f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {w} {h}" '
        f'width="{w}" height="{h}" font-family="{SANS}">\n'
        f"  <title>{esc(title)}</title>\n"
        f'  <rect width="{w}" height="{h}" fill="{PAPER}"/>\n'
        f'  <text x="40" y="46" font-size="26" font-weight="700" fill="{INK}">{esc(title)}</text>\n'
        f'  <text x="40" y="70" font-size="14" fill="{INK_FAINT}">{esc(subtitle)}</text>\n'
    )


def box(x, y, w, h, fill=CARD, stroke=RULE, sw=1, r=6, dash=None):
    d = f' stroke-dasharray="{dash}"' if dash else ""
    return (
        f'  <rect x="{x:.0f}" y="{y:.0f}" width="{w:.0f}" height="{h:.0f}" rx="{r}" '
        f'fill="{fill}" stroke="{stroke}" stroke-width="{sw}"{d}/>\n'
    )


def text(x, y, s, size=13, fill=INK, weight="400", anchor="start", family=None):
    fam = f' font-family="{family}"' if family else ""
    return (
        f'  <text x="{x:.0f}" y="{y:.0f}" font-size="{size}" fill="{fill}" '
        f'font-weight="{weight}" text-anchor="{anchor}"{fam}>{esc(s)}</text>\n'
    )


def lines_at(x, y, items, size=11, fill=INK_SOFT, leading=None, **kw):
    lead = leading or size + 4
    out = ""
    for i, ln in enumerate(items):
        out += text(x, y + i * lead, ln, size, fill, **kw)
    return out


def eyebrow(x, y, s, fill=INK_FAINT):
    return (
        f'  <text x="{x:.0f}" y="{y:.0f}" font-size="10.5" fill="{fill}" font-weight="700" '
        f'letter-spacing="1.4">{esc(s.upper())}</text>\n'
    )


def head_poly(x, y, angle, colour, size=7):
    """An explicit arrowhead at (x, y), pointing along `angle` degrees."""
    a = math.radians(angle)
    tip = (x, y)
    back = (x - size * 1.9 * math.cos(a), y - size * 1.9 * math.sin(a))
    left = (back[0] - size * 0.7 * math.sin(a), back[1] + size * 0.7 * math.cos(a))
    right = (back[0] + size * 0.7 * math.sin(a), back[1] - size * 0.7 * math.cos(a))
    pts = " ".join(f"{p[0]:.1f},{p[1]:.1f}" for p in (tip, left, right))
    return f'  <polygon points="{pts}" fill="{colour}"/>\n'


def arrow(x1, y1, x2, y2, stroke=INK_SOFT, sw=1.6, dash=None, headed=True):
    """A straight connector with a real polygon head at the far end."""
    d = f' stroke-dasharray="{dash}"' if dash else ""
    out = (
        f'  <line x1="{x1:.0f}" y1="{y1:.0f}" x2="{x2:.0f}" y2="{y2:.0f}" '
        f'stroke="{stroke}" stroke-width="{sw}"{d}/>\n'
    )
    if headed:
        out += head_poly(x2, y2, math.degrees(math.atan2(y2 - y1, x2 - x1)), stroke)
    return out


def elbow(pts, stroke=INK_SOFT, sw=1.6, dash=None, headed=True):
    """An orthogonal polyline through pts, head at the last segment's direction."""
    d = f' stroke-dasharray="{dash}"' if dash else ""
    path = " ".join(f"{'M' if i == 0 else 'L'} {p[0]:.0f} {p[1]:.0f}" for i, p in enumerate(pts))
    out = f'  <path d="{path}" fill="none" stroke="{stroke}" stroke-width="{sw}"{d}/>\n'
    if headed:
        (ax, ay), (bx, by) = pts[-2], pts[-1]
        out += head_poly(bx, by, math.degrees(math.atan2(by - ay, bx - ax)), stroke)
    return out


# ===========================================================================
#  1. ARCHITECTURE
# ===========================================================================
def architecture():
    W = 1200
    L, R = 40, W - 40
    inner = R - L

    s = ""

    # ---------------- tier 1: browser ----------------
    y1, h1 = 100, 168
    s += box(L, y1, inner, h1, CARD, INK, 1.5)
    s += eyebrow(L + 18, y1 + 24, "Presentation tier")
    s += text(L + 18, y1 + 48, "Browser — React 18 · Vite 5 · Tailwind 3", 17, INK, "700")
    s += text(R - 18, y1 + 48, "localhost:3000", 12.5, INK_FAINT, anchor="end", family=MONO)

    cols = [
        ("pages/", ["Landing · About · Auth · 404", "Setup wizard · Dashboard",
                    "Careers · CareerDetail · Compare", "Plans · PlanDetail · Profile · Resume"]),
        ("components/", ["Layout · Stepper · CareerBrief", "PhaseSpine · PhaseChain · PhaseCard",
                         "StepRow · SkillPicker · SkillGapPanel", "ui.jsx — the small shared pieces"]),
        ("context/", ["AuthContext — the signed-in user,", "token kept in localStorage"]),
        ("lib/", ["api.js — one fetch wrapper", "format.js — hours, weeks, INR"]),
    ]
    cw = (inner - 36 - 3 * 12) / 4
    for i, (name, body) in enumerate(cols):
        bx = L + 18 + i * (cw + 12)
        s += box(bx, y1 + 62, cw, 90, PAPER, RULE)
        s += text(bx + 12, y1 + 81, name, 12.5, INK, "700", family=MONO)
        s += lines_at(bx + 12, y1 + 99, body, 10.5, INK_SOFT, leading=14)

    # ---------------- the proxy hop ----------------
    y2 = y1 + h1
    hop = 62
    s += arrow(W / 2, y2 + 2, W / 2, y2 + hop - 2)
    s += box(W / 2 + 16, y2 + 8, 500, 46, EFFORT_SOFT, EFFORT)
    s += text(W / 2 + 30, y2 + 27, "fetch('/api/…')  →  Vite dev-server proxy  →  :5000", 12, EFFORT, "700", family=MONO)
    s += text(W / 2 + 30, y2 + 44, "No hostname is hard-coded in React, and CORS never bites in development.", 10.5, INK_SOFT)

    # ---------------- tier 2: express ----------------
    y3 = y2 + hop
    layers = [
        ("middleware/", "auth.js verifies the JWT  ·  upload.js — multer, 2 MB cap, UUID filenames  ·  errorHandler.js hides internals in production", False),
        ("routes/", "auth · roles · nodes · roadmaps · progress · resume · analysis · dashboard      thin by design: validate with Zod, call a service, respond", False),
        ("services/", "roadmapService · progressService · resumeService · narrative      the only layer that talks to both Mongoose and the engine", False),
        ("engine/", "graph.js — topological sort, depth, transitive expansion  ·  phasePacker.js — grouping and scheduling  ·  generate.js", True),
        ("data/", "188 career steps across 6 domains  ·  30 target roles  ·  validateCatalog() — the gate every entry path calls first", False),
    ]
    lh, gap = 58, 9
    h3 = 66 + len(layers) * (lh + gap) + 40
    s += box(L, y3, inner, h3, CARD, INK, 1.5)
    s += eyebrow(L + 18, y3 + 24, "Application tier")
    s += text(L + 18, y3 + 48, "Express 4 API", 17, INK, "700")
    s += text(R - 18, y3 + 48, "localhost:5000", 12.5, INK_FAINT, anchor="end", family=MONO)

    for i, (name, body, is_engine) in enumerate(layers):
        by = y3 + 66 + i * (lh + gap)
        s += box(L + 18, by, inner - 36, lh, EFFORT_SOFT if is_engine else CARD,
                 EFFORT if is_engine else RULE, 2 if is_engine else 1)
        s += text(L + 34, by + 23, name, 13, EFFORT if is_engine else INK, "700", family=MONO)
        if is_engine:
            s += text(R - 34, by + 23, "PURE — NO I/O", 10.5, EFFORT, "700", anchor="end", family=MONO)
        s += text(L + 34, by + 42, body, 10.5, INK_SOFT)

    cap = ("Requests flow down; nothing below reaches back up. The engine imports nothing from routes, services or Mongoose — "
           "which is what lets 122 assertions run under bare node, with no database and no node_modules.")
    s += lines_at(L + 18, y3 + h3 - 22, wrap(cap, inner - 40, 11), 11, INK_FAINT, leading=14)

    # ---------------- tier 3: atlas ----------------
    y4 = y3 + h3
    hop2 = 56
    s += arrow(W / 2, y4 + 2, W / 2, y4 + hop2 - 2)
    s += text(W / 2 + 16, y4 + 34, "Mongoose 8", 12, INK_SOFT, "700", family=MONO)

    y5 = y4 + hop2
    h5 = 120
    s += box(L, y5, inner, h5, CARD, INK, 1.5)
    s += eyebrow(L + 18, y5 + 24, "Data tier")
    s += text(L + 18, y5 + 48, "MongoDB Atlas", 17, INK, "700")
    s += text(R - 18, y5 + 48, "M0 free cluster · database: careerRoadmap", 12.5, INK_FAINT, anchor="end", family=MONO)

    colls = [
        ("careernodes", "188 steps — the catalog", FIXED_SOFT, FIXED),
        ("roles", "30 target careers", FIXED_SOFT, FIXED),
        ("users", "credentials + profile", DONE_SOFT, DONE),
        ("roadmaps", "generated plans, snapshotted", DONE_SOFT, DONE),
        ("progress", "one row per step per plan", DONE_SOFT, DONE),
    ]
    cw2 = (inner - 36 - 4 * 10) / 5
    for i, (name, body, fill, stroke) in enumerate(colls):
        bx = L + 18 + i * (cw2 + 10)
        s += box(bx, y5 + 62, cw2, 42, fill, stroke)
        s += text(bx + 10, y5 + 80, name, 12, stroke, "700", family=MONO)
        s += text(bx + 10, y5 + 96, body, 10, INK_SOFT)

    # ---------------- legend ----------------
    ly = y5 + h5 + 16
    s += box(L, ly, 400, 46, FIXED_SOFT, FIXED)
    s += text(L + 14, ly + 20, "Seeded — npm run seed", 11.5, FIXED, "700", family=MONO)
    s += text(L + 14, ly + 36, "Read-only to the app. Safe to re-run at any time; it upserts.", 10.5, INK_SOFT)

    s += box(L + 416, ly, 400, 46, DONE_SOFT, DONE)
    s += text(L + 430, ly + 20, "Written by users", 11.5, DONE, "700", family=MONO)
    s += text(L + 430, ly + 36, "Never touched by the seeder, not even with --fresh.", 10.5, INK_SOFT)

    H = int(ly + 46 + 40)
    return W, H, head(W, H, "System architecture",
                      "Career Roadmap Generator — MERN stack, three tiers, one pure engine at the centre") + s + "</svg>\n"


# ===========================================================================
#  2. ER DIAGRAM
# ===========================================================================
ROW = 19


def entity(x, y, w, name, subtitle, fields, accent):
    """A table-style entity box. Returns (svg, height).

    The height is derived from the wrapped subtitle and the field count rather
    than assumed — a two-line subtitle used to land on top of the first field.
    """
    sub = wrap(subtitle, w - 28, 10.5)
    first_field = 52 + (len(sub) - 1) * 13 + 22   # baseline of row 0, relative to y
    h = first_field + (len(fields) - 1) * ROW + 16

    out = box(x, y, w, h, CARD, accent, 1.5)
    out += f'  <path d="M {x} {y+6} q 0 -6 6 -6 L {x+w-6} {y} q 6 0 6 6 L {x+w} {y+34} L {x} {y+34} Z" fill="{accent}"/>\n'
    out += text(x + 14, y + 23, name, 14, "#FFFFFF", "700", family=MONO)
    out += lines_at(x + 14, y + 52, sub, 10.5, INK_FAINT, leading=13)

    for i, (fname, ftype, kind) in enumerate(fields):
        fy = y + first_field + i * ROW
        colour, weight, indent = INK, "400", 0
        if kind == "pk":
            weight = "700"
        elif kind == "fk":
            colour, weight = DONE, "700"
        elif kind == "key":
            colour, weight = FIXED, "700"
        elif kind == "subkey":
            colour, weight, indent = FIXED, "700", 12
        elif kind == "emb":
            colour, weight = INK_SOFT, "700"
        elif kind == "sub":
            colour, indent = INK_SOFT, 12
        label = {"pk": "PK ", "fk": "FK ", "key": "ref ", "subkey": "ref "}.get(kind, "")
        if fname:
            out += text(x + 14 + indent, fy, f"{label}{fname}", 11.5, colour, weight, family=MONO)
        if ftype:
            out += text(x + w - 14, fy, ftype, 10.5, INK_FAINT, anchor="end", family=MONO)
    return out, h


def er():
    # The left margin is wide on purpose: careernodes.prerequisites points back at
    # careernodes, and that self-edge has to be routed somewhere it can be labelled.
    W = 1420
    s = ""

    CW = 340
    AX, BX, CX = 80, 620, 1020
    BW = CWID = 350

    # ---------------------------------------------- careernodes
    f_nodes = [
        ("_id", "ObjectId", "pk"),
        ("key", "String  unique", "pk"),
        ("title", "String", ""),
        ("type", "skill | exam | certification", ""),
        ("", "qualification | experience", ""),
        ("domain", "String  indexed", ""),
        ("estimatedHours", "Number", ""),
        ("fixedDurationWeeks", "Number  optional", ""),
        ("difficulty", "String", ""),
        ("prerequisites[]", "[String] → key", "key"),
        ("aliases[]", "[String]", ""),
        ("resources[]", "[Resource]", "emb"),
        ("checkpoints[]", "[String]", ""),
        ("projectIdeas[]", "[String]", ""),
    ]
    e, h_nodes = entity(AX, 110, CW, "careernodes", "One step towards a career. 188 rows, seeded.", f_nodes, FIXED)
    s += e
    nodes_bottom = 110 + h_nodes

    # ---------------------------------------------- roles
    f_roles = [
        ("_id", "ObjectId", "pk"),
        ("key", "String  unique", "pk"),
        ("title", "String", ""),
        ("domain", "String", ""),
        ("requiredNodes[]", "[RequiredNode]", "emb"),
        ("nodeKey", "String → key", "subkey"),
        ("importance", "core | recommended | optional", "sub"),
        ("rationale", "String", "sub"),
        ("minimumEducation", "String", ""),
        ("salaryINR", "{ min, max }", "emb"),
        ("demandLevel", "String", ""),
        ("aliases[]", "[String]", ""),
        ("typicalEntryPaths[]", "[String]", ""),
    ]
    roles_y = nodes_bottom + 74
    e, h_roles = entity(AX, roles_y, CW, "roles", "A target career. 30 rows, seeded.", f_roles, FIXED)
    s += e
    roles_bottom = roles_y + h_roles

    # ---------------------------------------------- users
    f_users = [
        ("_id", "ObjectId", "pk"),
        ("name", "String", ""),
        ("email", "String  unique", ""),
        ("passwordHash", "String  select:false", ""),
        ("profile", "Profile", "emb"),
        ("educationLevel", "String", "sub"),
        ("fieldOfStudy", "String", "sub"),
        ("currentYear", "String  '3rd-year'", "sub"),
        ("currentStatus", "String", "sub"),
        ("experienceLevel", "String  default level", "sub"),
        ("knownNodeKeys[]", "[String] → key", "subkey"),
        ("skillLevels", "Map  key → level", "subkey"),
        ("hoursPerDay", "Number  1..12", "sub"),
        ("hoursPerWeek", "Number  = day × 7", "sub"),
        ("targetDate", "Date  nullable", "sub"),
        ("targetRoleKey", "String → key", "subkey"),
        ("city", "String", "sub"),
        ("onboardedAt", "Date  nullable", "sub"),
        ("resume", "Resume  nullable", "emb"),
        ("originalName", "String", "sub"),
        ("storedName", "String  uuid", "sub"),
        ("uploadedAt", "Date", "sub"),
        ("detectedNodeKeys[]", "[String] → key", "subkey"),
    ]
    e, h_users = entity(BX, 110, BW, "users", "The account, plus everything the engine needs to know about them.", f_users, DONE)
    s += e
    users_bottom = 110 + h_users

    # ---------------------------------------------- roadmaps
    f_rm = [
        ("_id", "ObjectId", "pk"),
        ("userId", "ObjectId → users", "fk"),
        ("roleKey", "String → roles.key", "key"),
        ("roleTitle / roleDomain", "String", ""),
        ("engineVersion", "String", ""),
        ("generatedAt", "Date", ""),
        ("input", "the profile it was built from", "emb"),
        ("totals", "hours · weeks · months · steps", "emb"),
        ("readiness", "met · remaining · percent", "emb"),
        ("schedule", "finish · target · onTrack", "emb"),
        ("phases[]", "[Phase]", "emb"),
        ("index / title / focus", "1-based", "sub"),
        ("hours / weeks", "Number", "sub"),
        ("startWeek / endWeek", "Number", "sub"),
        ("calendarBound", "Boolean", "sub"),
        ("nodes[]", "snapshot of each step", "sub"),
        ("estimatedHours / fullHours", "Number", "sub"),
        ("isRevision", "Boolean", "sub"),
        ("selfRatedLevel", "beginner → half hours", "sub"),
        ("skipped[]", "nodeKey + reason", "emb"),
        ("notes[]", "type + message", "emb"),
        ("narrative", "summary + phaseNotes", "emb"),
        ("isArchived", "Boolean", ""),
    ]
    rm_y = users_bottom + 56
    e, h_rm = entity(BX, rm_y, BW, "roadmaps", "A generated plan, stored as a snapshot.", f_rm, DONE)
    s += e
    rm_bottom = rm_y + h_rm

    # ---------------------------------------------- progress
    f_pg = [
        ("_id", "ObjectId", "pk"),
        ("userId", "ObjectId → users", "fk"),
        ("roadmapId", "ObjectId → roadmaps", "fk"),
        ("nodeKey", "String", ""),
        ("status", "not-started | in-progress", ""),
        ("", "completed | skipped", ""),
        ("hoursLogged", "Number", ""),
        ("startedAt / completedAt", "Date  nullable", ""),
        ("notes", "String", ""),
    ]
    e, h_pg = entity(CX, rm_y, CWID, "progress", "One row per step of one plan. Unique on (userId, roadmapId, nodeKey).", f_pg, DONE)
    s += e

    # ============================== relationships ==============================
    # 1. careernodes.prerequisites → itself. Out of the bottom edge, around through
    #    the left margin, back into the top. The label is horizontal on purpose:
    #    rotated text is dropped by some renderers, including the one that matters
    #    if these end up pasted into a Word report.
    sx = 36
    loop_y = nodes_bottom + 30
    s += elbow([(AX + 40, nodes_bottom + 2), (AX + 40, loop_y), (sx, loop_y),
                (sx, 170), (AX - 2, 170)], INK_FAINT, 1.4)
    s += text(sx + 8, loop_y + 15, "prerequisites · self", 10, INK_FAINT, "700", family=MONO)

    # 2. roles.requiredNodes → careernodes.key, straight up the column gap.
    s += arrow(AX + 170, roles_y - 4, AX + 170, nodes_bottom + 6, FIXED, 1.8)
    s += text(AX + 184, roles_y - 44, "requiredNodes[].nodeKey", 10.5, FIXED, "700", family=MONO)
    s += text(AX + 184, roles_y - 30, "many-to-many, by string key", 10, INK_FAINT)
    s += text(AX + 184, roles_y - 16, "importance travels with the edge", 10, INK_FAINT)

    # 3. users.profile.knownNodeKeys → careernodes.key, across gutter 1.
    gy = 330
    s += arrow(BX - 4, gy, AX + CW + 6, gy, DONE, 1.8, dash="6 4")
    s += text((AX + CW + BX) / 2, gy - 22, "knownNodeKeys[]", 10.5, DONE, "700", anchor="middle", family=MONO)
    s += text((AX + CW + BX) / 2, gy - 8, "detectedNodeKeys[]", 10.5, DONE, "700", anchor="middle", family=MONO)
    s += text((AX + CW + BX) / 2, gy + 16, "by key, never by ObjectId", 10, INK_FAINT, anchor="middle")

    # 4. users 1 — N roadmaps
    s += arrow(BX + 150, users_bottom + 4, BX + 150, rm_y - 6, DONE, 1.8)
    s += text(BX + 164, users_bottom + 34, "1  ·  N", 11, DONE, "700", family=MONO)

    # 5. users 1 — N progress, over the top of the roadmaps/progress gutter.
    uy = users_bottom - 40
    s += elbow([(BX + BW + 4, uy), (CX + CWID - 40, uy), (CX + CWID - 40, rm_y - 6)], DONE, 1.8)
    s += text((BX + BW + CX) / 2 + 30, uy - 10, "1 · N", 11, DONE, "700", anchor="middle", family=MONO)

    # 6. roadmaps 1 — N progress
    ry = rm_y + 180
    s += arrow(BX + BW + 4, ry, CX - 6, ry, DONE, 1.8)
    s += text((BX + BW + CX) / 2, ry - 10, "1 · N", 11, DONE, "700", anchor="middle", family=MONO)

    # 7. roadmaps.roleKey → roles.key, back across gutter 1.
    ky = roles_y + 150
    s += arrow(BX - 4, ky, AX + CW + 6, ky, FIXED, 1.8, dash="6 4")
    s += text((AX + CW + BX) / 2, ky - 10, "roleKey → roles.key", 10.5, FIXED, "700", anchor="middle", family=MONO)
    s += text((AX + CW + BX) / 2, ky + 16, "the plan remembers the slug,", 10, INK_FAINT, anchor="middle")
    s += text((AX + CW + BX) / 2, ky + 29, "not a reference to the document", 10, INK_FAINT, anchor="middle")

    # ============================== key + notes ==============================
    body_bottom = max(rm_bottom, roles_bottom, rm_y + h_pg)
    ly = body_bottom + 38

    s += box(AX, ly, 300, 118, CARD, RULE)
    s += eyebrow(AX + 16, ly + 24, "Reading this diagram")
    legend = [
        ("PK", "primary key or unique slug", INK),
        ("FK", "true reference, by ObjectId", DONE),
        ("ref", "reference by string key", FIXED),
        ("indented", "embedded sub-document", INK_SOFT),
    ]
    for i, (tag, meaning, colour) in enumerate(legend):
        yy = ly + 46 + i * 18
        s += text(AX + 16, yy, tag, 10.5, colour, "700", family=MONO)
        s += text(AX + 86, yy, meaning, 10.5, INK_SOFT)

    nb = [
        (AX + 320, EFFORT, EFFORT_SOFT, "Why the catalog links by string key, not ObjectId",
         "Prerequisites and role requirements are written as slugs — 'javascript', 'bsc-nursing'. That keeps the "
         "188-node catalog readable and editable as source files, so a teammate can add a step by hand and review "
         "it in a diff. Keys resolve to a Map once at load time, not per query."),
        (AX + 320 + 500, FIXED, FIXED_SOFT, "Why roadmaps embed a copy of each step",
         "phases[].nodes[] duplicates each step's title, hours and resources. Deliberate denormalisation: if the "
         "catalog is edited next week, a plan somebody is halfway through does not silently change under them, and "
         "engineVersion records which engine built it."),
    ]
    for x, accent, fill, title, bodytext in nb:
        s += box(x, ly, 480, 118, fill, accent)
        s += text(x + 16, ly + 26, title, 12.5, accent, "700")
        s += lines_at(x + 16, ly + 48, wrap(bodytext, 448, 11), 11, INK_SOFT, leading=15)

    H = int(ly + 118 + 40)
    return W, H, head(W, H, "Entity relationship diagram",
                      "Five collections. Two are the seeded catalog, three hold user data. Embedded sub-documents are indented.") + s + "</svg>\n"


# ===========================================================================
#  3. ENGINE PIPELINE
# ===========================================================================
def pipeline():
    W = 1220
    L = 40
    COL = 780          # the steps column
    PANEL_X = L + COL + 40
    PANEL_W = W - PANEL_X - 40

    s = ""

    # ---------------- inputs ----------------
    iy, ih = 100, 122
    s += box(L, iy, 360, ih, CARD, INK, 1.5)
    s += eyebrow(L + 16, iy + 24, "Inputs")
    inputs = [
        ("role", "the target career and its requirements"),
        ("nodes", "the whole 188-step catalog"),
        ("profile", "skills + levels · hours per week · target date"),
        ("now", "injected clock, so tests are repeatable"),
    ]
    for i, (name, desc) in enumerate(inputs):
        yy = iy + 48 + i * 20
        s += text(L + 16, yy, name, 12, INK, "700", family=MONO)
        s += text(L + 92, yy, desc, 10.5, INK_SOFT)

    steps = [
        ("1", "Collect requirements",
         "Walk the role's requiredNodes and their prerequisites, propagating importance downwards.",
         "core > recommended > optional. Only optional is dropped by default, so in this catalog 'optional' means genuinely not needed to get hired.", False),
        ("2", "Expand what is already known",
         "Take the learner's ticked skills and self-rated levels, then close them transitively over prerequisites.",
         "Knowing React implies knowing the DOM and JavaScript. Usually right, occasionally wrong — which is exactly why step 3 keeps a reason.", False),
        ("3", "Prune the overlap, audibly — and halve the shaky steps",
         "Remove every required node the learner already has, recording why. A skill rated 'beginner' is kept instead, at half its hours, flagged as revision.",
         "Reasons read 'you marked this known', 'you rated yourself intermediate', or 'assumed known because you already know React'. Beginner outranks both a tick and an inference, and a calendar-bound step is never halved.", False),
        ("4", "Sort into a workable order",
         "Kahn's topological sort over the remaining sub-graph.",
         "Guarantees no step is scheduled before something it depends on. A cycle here would be a catalog bug, and validateCatalog() rejects cycles before anything is seeded.", False),
        ("5", "Measure prerequisite depth",
         "Longest path from a root, per node.",
         "This is what keeps prerequisite order intact when a level has to be split across a phase boundary in step 6.", False),
        ("6", "Pack into phases",
         "Group into phases of three to six content items — and give every calendar-bound step a phase of its own.",
         "THE FORK. Effort steps are scheduled as hours ÷ hoursPerWeek. Calendar-bound steps are scheduled by their declared fixedDurationWeeks and are never divided by availability.", True),
        ("7", "Schedule, and check it is possible",
         "Sum hours and weeks, project a finish date, and compare it with the target date if one was given.",
         "If the target is unreachable it says so, reports the shortfall in weeks, and states the weekly commitment that would close it — rather than quietly returning a plan that cannot happen.", False),
    ]

    y = iy + ih + 34
    s += arrow(205, iy + ih + 2, 205, y - 6)
    steps_top = y

    for num, title, what, why, is_fork in steps:
        wl = wrap(what, COL - 76, 11)
        yl = wrap(why, COL - 76, 10.5)
        h = 20 + 16 * len(wl) + 15 * len(yl) + 16
        s += box(L, y, COL, h, EFFORT_SOFT if is_fork else CARD, EFFORT if is_fork else RULE, 2 if is_fork else 1)
        s += f'  <circle cx="{L + 26}" cy="{y + h / 2:.0f}" r="14" fill="{EFFORT if is_fork else INK}"/>\n'
        s += text(L + 26, y + h / 2 + 4.5, num, 13, "#FFFFFF", "700", anchor="middle", family=MONO)
        s += text(L + 52, y + 22, title, 13.5, EFFORT if is_fork else INK, "700")
        s += lines_at(L + 52, y + 40, wl, 11, INK_SOFT, leading=16)
        s += lines_at(L + 52, y + 40 + 16 * len(wl) + 1, yl, 10.5, INK_FAINT, leading=15)
        y += h + 9

    steps_bottom = y - 9

    # ---------------- output panel ----------------
    s += box(PANEL_X, steps_top, PANEL_W, steps_bottom - steps_top, CARD, DONE, 1.5)
    s += eyebrow(PANEL_X + 16, steps_top + 24, "Returns a plain object", DONE)
    outs = [
        ("totals", "hours · weeks · months · steps"),
        ("readiness", "met vs remaining, hours saved"),
        ("schedule", "finish date · onTrack · shortfall"),
        ("phases[]", "each with weeks, and a calendarBound flag"),
        ("skipped[]", "a reason for every single removal"),
        ("notes[]", "e.g. the minimum education you lack"),
    ]
    oy = steps_top + 52
    for name, desc in outs:
        s += text(PANEL_X + 16, oy, name, 12, DONE, "700", family=MONO)
        s += lines_at(PANEL_X + 16, oy + 17, wrap(desc, PANEL_W - 32, 10.5), 10.5, INK_SOFT, leading=14)
        oy += 48

    # The closing note is pinned to the bottom of the panel rather than following
    # the list, so the panel's full height is used instead of trailing off blank.
    tail = ("No database, no network, and no clock it was not handed. That is what lets 122 assertions run under bare "
            "node with no install, and it is why the same inputs always produce the same plan.")
    tl = wrap(tail, PANEL_W - 32, 11)
    ty = steps_bottom - 18 - 17 - (len(tl) - 1) * 15
    s += f'  <line x1="{PANEL_X + 16}" y1="{ty - 24}" x2="{PANEL_X + PANEL_W - 16}" y2="{ty - 24}" stroke="{RULE}" stroke-width="1"/>\n'
    s += text(PANEL_X + 16, ty, "A pure function", 11, INK, "700")
    s += lines_at(PANEL_X + 16, ty + 17, tl, 11, INK_SOFT, leading=15)

    # ---------------- worked example ----------------
    ey = steps_bottom + 24
    eh = 104
    s += box(L, ey, COL, eh, PAPER, INK_FAINT, 1, dash="4 4")
    s += eyebrow(L + 16, ey + 24, "Real output — same role, two learners")
    rows = [
        ("School leaver, nothing known, 10 h/week", "19 steps · 730 hours · 75 weeks · 5 phases", INK_SOFT, "400"),
        ("Knows HTML/CSS, JavaScript and React, 20 h/week", "13 steps · 490 hours · 26 weeks · 3 phases", DONE, "700"),
    ]
    for i, (who, figures, colour, weight) in enumerate(rows):
        yy = ey + 48 + i * 20
        s += text(L + 16, yy, who, 11.5, INK, "700")
        s += text(L + 356, yy, figures, 11.5, colour, weight, family=MONO)
    s += text(L + 16, ey + 94, "Six steps dropped, but only three of them claimed — the other three were inferred, and the plan says so.", 10.5, INK_FAINT)

    H = int(ey + eh + 40)
    return W, H, head(W, H, "How one plan is generated",
                      "generateRoadmap({ role, nodes, profile, now }) — seven steps, no I/O, and the same input always gives the same plan") + s + "</svg>\n"


if __name__ == "__main__":
    target = sys.argv[1] if len(sys.argv) > 1 else "."
    os.makedirs(target, exist_ok=True)

    for name, fn in (("architecture", architecture), ("er-diagram", er), ("engine-pipeline", pipeline)):
        w, h, svg = fn()
        p = os.path.join(target, f"{name}.svg")
        with open(p, "w", encoding="utf-8") as f:
            f.write(svg)
        print(f"{p}  {w}x{h}  {len(svg):,} bytes")
