#!/usr/bin/env python3
"""Export the roadmap workbook to `data/roadmap.csv`.

The workbook is where the plan was written, but a binary .xlsx cannot be
reviewed in a diff, and the eight blocks inside it are Excel tables that break
if rows are inserted with a script. So the workbook is exported once - and again
only when the sheet itself changes - and from then on `data/roadmap.csv` is the
file that is edited: one line per row, exactly the sheet's six columns.

`build_roadmap_json.py` reads that CSV. **Re-running this script overwrites the
CSV**, so edit the sheet first and copy the finished edits across, or accept the
reset and re-apply them.

Usage:
    python3 scripts/export_roadmap_csv.py
    python3 scripts/export_roadmap_csv.py --xlsx path/to/other.xlsx

Only the standard library is used. An .xlsx is a zip of XML parts, and pulling
in openpyxl for a single sheet would add a dependency this pipeline does not
need.
"""

import argparse
import csv
import os
import re
import sys
import xml.etree.ElementTree as ET
import zipfile

NS = "{http://schemas.openxmlformats.org/spreadsheetml/2006/main}"
SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
ROOT_DIR = os.path.dirname(SCRIPT_DIR)
DEFAULT_XLSX = os.path.join(ROOT_DIR, "data", "TheoCompass Roadmap.xlsx")
OUTPUT_CSV = os.path.join(ROOT_DIR, "data", "roadmap.csv")

# Column order of every task block in the sheet. The block header row is written
# out as-is so someone opening the CSV knows what each column means.
COLUMNS = ["A", "B", "C", "D", "E", "F"]

PHASE_RE = re.compile(r"^Phase\s+(\d+)\s*[-\u2013\u2014]\s*(.+)$")


def read_shared_strings(archive):
    """Every <si> as plain text, including rich-text runs and xml:space="preserve"."""
    try:
        raw = archive.read("xl/sharedStrings.xml")
    except KeyError:
        return []
    strings = []
    for si in ET.fromstring(raw).findall(NS + "si"):
        pieces = [node.text or "" for node in si.iter(NS + "t")]
        strings.append("".join(pieces))
    return strings


def read_rows(archive, shared_strings):
    """{row_number: [A, B, C, D, E, F]} for every row with at least one value."""
    raw = archive.read("xl/worksheets/sheet1.xml")
    rows = {}
    for row in ET.fromstring(raw).iter(NS + "row"):
        number = int(row.get("r"))
        cells = {}
        for cell in row.findall(NS + "c"):
            ref = cell.get("r") or ""
            column = re.match(r"[A-Z]+", ref)
            value = cell.find(NS + "v")
            if column is None or value is None:
                continue
            text = value.text or ""
            if cell.get("t") == "s":
                index = int(text)
                if index >= len(shared_strings):
                    raise SystemExit(f"{ref}: shared string #{index} is out of range")
                text = shared_strings[index]
            cells[column.group(0)] = text.strip()
        if cells:
            rows[number] = [cells.get(column, "") for column in COLUMNS]
    return rows


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--xlsx", default=DEFAULT_XLSX, help="source spreadsheet")
    parser.add_argument("--out", default=OUTPUT_CSV, help="output CSV path")
    args = parser.parse_args()

    if not os.path.exists(args.xlsx):
        raise SystemExit(f"Spreadsheet not found: {args.xlsx}")

    with zipfile.ZipFile(args.xlsx) as archive:
        shared = read_shared_strings(archive)
        rows = read_rows(archive, shared)

    # One blank line between phase blocks: the sheet separates them the same way,
    # and it keeps a hand-edited CSV readable. Everything else is one row per
    # line, so adding or removing a task is a single-line diff.
    lines = []
    for number in sorted(rows):
        values = rows[number]
        if PHASE_RE.match(values[0]) and lines:
            lines.append([])
        lines.append(values)

    with open(args.out, "w", encoding="utf-8", newline="") as handle:
        csv.writer(handle).writerows(lines)

    phases = sum(1 for values in rows.values() if PHASE_RE.match(values[0]))
    tasks = sum(1 for values in rows.values() if re.match(r"^\d+\.\d+$", values[0]))
    print(f"Wrote {args.out}")
    print(f"  rows: {len(rows)}  phases: {phases}  tasks: {tasks}")
    print("  next: python3 scripts/build_roadmap_json.py")


if __name__ == "__main__":
    main()
