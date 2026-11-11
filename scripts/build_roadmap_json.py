#!/usr/bin/env python3
"""Turn `data/roadmap.csv` into `data/roadmap.json`.

The CSV is the source of truth for *content*: phase titles, goals, task names,
descriptions, types, the verification note and the statuses the plan starts
with. Status changes made by a moderator at runtime live in D1 and are never
written back here -- `generate_roadmap_seed.py` deliberately skips the status
column, so re-running this file cannot undo an edit made on the site.

Phase blocks are flat: a title row, a goal row, a header row, then one row per
task. Tasks are recognised by their ID cell, not by row position, so a spacer
row, a comment or a reordered block cannot shift anything.

Usage:
    python3 scripts/build_roadmap_json.py
    python3 scripts/build_roadmap_json.py --csv path/to/other.csv

Only the standard library is used.
"""

import argparse
import csv
import json
import os
import re
import sys

SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
ROOT_DIR = os.path.dirname(SCRIPT_DIR)
SOURCE_CSV = os.path.join(ROOT_DIR, "data", "roadmap.csv")
OUTPUT_JSON = os.path.join(ROOT_DIR, "data", "roadmap.json")

# The spreadsheet validates the status column against this exact list; anything
# else is a typo the build should surface rather than silently swallow.
STATUS_MAP = {
    "not started": "not_started",
    "in progress": "in_progress",
    "implemented locally": "implemented_local",
    "implemented live": "implemented_live",
}

PHASE_RE = re.compile(r"^Phase\s+(\d+)\s*[-\u2013\u2014]\s*(.+)$")
TASK_ID_RE = re.compile(r"^\d+\.\d+$")


def parse_phases(rows):
    """Split the CSV into phases, their goals and their task rows."""
    phases = []
    current = None
    for line, cells in enumerate(rows, start=2):
        cells = [cell.strip() for cell in cells]
        first = cells[0] if cells else ""

        title_match = PHASE_RE.match(first)
        if title_match:
            current = {
                "index": int(title_match.group(1)),
                "title": first,
                "label": title_match.group(2).strip(),
                "goal": "",
                "tasks": [],
            }
            phases.append(current)
            continue

        if current is None:
            continue

        if first.startswith("Goal:"):
            current["goal"] = first[len("Goal:"):].strip()
            continue

        if not TASK_ID_RE.match(first):
            continue

        padded = cells + [""] * (6 - len(cells))
        task_index = len(current["tasks"]) + 1
        status_raw = padded[5]
        status = STATUS_MAP.get(status_raw.lower())
        if status is None:
            print(
                f"  ! line {line} ({first}): unknown status {status_raw!r}, "
                f"treating as not_started",
                file=sys.stderr,
            )
            status = "not_started"

        current["tasks"].append(
            {
                "id": f"p{current['index']}-{task_index:02d}",
                "sheetId": first,
                "index": task_index,
                "name": padded[1],
                "description": padded[2],
                "type": padded[3],
                "role": padded[4],
                "status": status,
            }
        )

    return phases


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--csv", default=SOURCE_CSV, help="source CSV")
    parser.add_argument("--out", default=OUTPUT_JSON, help="output JSON path")
    args = parser.parse_args()

    if not os.path.exists(args.csv):
        raise SystemExit(
            f"{args.csv} not found -- run scripts/export_roadmap_csv.py once to create it"
        )

    with open(args.csv, encoding="utf-8", newline="") as handle:
        rows = list(csv.reader(handle))

    phases = parse_phases(rows)

    if not phases:
        raise SystemExit("No phase blocks found -- is this the roadmap CSV?")

    empty_phases = [p["label"] for p in phases if not p["tasks"]]
    if empty_phases:
        raise SystemExit(f"Phases without tasks: {', '.join(empty_phases)}")

    # Phase 7 numbers its tasks 8.x in the sheet. The site shows phase.task, so
    # the mismatch is worth printing once here instead of debugging it in the UI.
    for phase in phases:
        for task in phase["tasks"]:
            expected = f"{phase['index']}.{task['index']}"
            if task["sheetId"] != expected:
                print(
                    f"  note: {phase['label']} task {task['id']} is {task['sheetId']} "
                    f"in the sheet, displayed as {expected}",
                    file=sys.stderr,
                )

    document = {"source": os.path.basename(args.csv), "phases": phases}

    with open(args.out, "w", encoding="utf-8") as handle:
        json.dump(document, handle, indent=2, ensure_ascii=False)
        handle.write("\n")

    counts = {}
    for phase in phases:
        for task in phase["tasks"]:
            counts[task["status"]] = counts.get(task["status"], 0) + 1

    print(f"Wrote {args.out}")
    print(f"  phases: {len(phases)}  tasks: {sum(len(p['tasks']) for p in phases)}")
    for status in ("implemented_live", "implemented_local", "in_progress", "not_started"):
        print(f"  {status}: {counts.get(status, 0)}")


if __name__ == "__main__":
    main()
