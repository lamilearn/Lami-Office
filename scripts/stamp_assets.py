#!/usr/bin/env python3
"""
Stamp content hashes onto the js/css URLs in web/index.html.

The server sends `Cache-Control: no-cache` with no ETag, and the CDN in front of
production rewrites that to a long max-age. Without a version in the URL a
deploy can therefore be served as a mix of old scripts and new ones, which is
exactly how the office once lost its walls.

Usage:
  python3 scripts/stamp_assets.py          # rewrite index.html in place
  python3 scripts/stamp_assets.py --check  # exit 1 when a hash is stale
"""
from __future__ import annotations

import argparse
import hashlib
import re
import sys
from pathlib import Path

WEB = Path(__file__).resolve().parent.parent / "services" / "lami-office-react" / "web"
INDEX = WEB / "index.html"

# href="..." / src="..." for local css/js only (skip absolute and data: URLs).
PATTERN = re.compile(r'(?P<attr>href|src)="(?P<path>(?!https?:|data:|//)[^"?]+\.(?:css|js))'
                     r'(?:\?v=[0-9a-f]+)?"')


def digest(rel: str) -> str:
    target = WEB / rel
    if not target.is_file():
        raise SystemExit(f"error: {rel} does not exist next to index.html")
    return hashlib.sha256(target.read_bytes()).hexdigest()[:8]


def stamp(text: str) -> str:
    def repl(match: re.Match) -> str:
        rel = match.group("path")
        return f'{match.group("attr")}="{rel}?v={digest(rel)}"'
    return PATTERN.sub(repl, text)


def stale(text: str) -> list[str]:
    problems = []
    for match in PATTERN.finditer(text):
        rel = match.group("path")
        found = re.search(r"\?v=([0-9a-f]+)", match.group(0))
        expected = digest(rel)
        if not found:
            problems.append(f"{rel}: no version")
        elif found.group(1) != expected:
            problems.append(f"{rel}: v={found.group(1)} should be v={expected}")
    return problems


def main() -> int:
    ap = argparse.ArgumentParser(description="Version the css/js URLs in index.html")
    ap.add_argument("--check", action="store_true", help="verify the stamped hashes")
    args = ap.parse_args()

    text = INDEX.read_text(encoding="utf-8")
    if args.check:
        problems = stale(text)
        if problems:
            print("error: index.html asset versions are stale", file=sys.stderr)
            for p in problems:
                print(f"  - {p}", file=sys.stderr)
            print("run scripts/stamp_assets.py", file=sys.stderr)
            return 1
        count = len(PATTERN.findall(text))
        print(f"index.html asset versions up to date ({count} assets)")
        return 0

    stamped = stamp(text)
    if stamped != text:
        INDEX.write_text(stamped, encoding="utf-8")
    print(f"stamped {len(PATTERN.findall(stamped))} assets in index.html")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
