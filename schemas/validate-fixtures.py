#!/usr/bin/env python3
"""Validate creative-resonance-envelope fixtures against the schema.

Asserts every fixture in fixtures/valid/ passes and every fixture in
fixtures/invalid/ fails. Exit 0 = all assertions hold, 1 = a fixture
behaved opposite to its directory.

Run: python3 schemas/validate-fixtures.py
Dependency: pip install jsonschema
"""
import json
import sys
from pathlib import Path

try:
    from jsonschema import Draft202012Validator
except ImportError:
    print("error: pip install jsonschema", file=sys.stderr)
    sys.exit(2)

SCHEMA_DIR = Path(__file__).parent
schema = json.loads((SCHEMA_DIR / "creative-resonance-envelope.schema.json").read_text())
validator = Draft202012Validator(schema)

failures = []

for fixture in sorted((SCHEMA_DIR / "fixtures" / "valid").glob("*.json")):
    doc = json.loads(fixture.read_text())
    errors = list(validator.iter_errors(doc))
    if errors:
        failures.append(f"VALID fixture rejected: {fixture.name}")
        for e in errors:
            failures.append(f"    {list(e.path)}: {e.message}")
    else:
        print(f"  ok   valid/{fixture.name}")

for fixture in sorted((SCHEMA_DIR / "fixtures" / "invalid").glob("*.json")):
    doc = json.loads(fixture.read_text())
    # Strip the _invalid_reason annotation key (additionalProperties:false would
    # also reject it, but we want the fixture to fail for its STATED reason).
    doc.pop("_invalid_reason", None)
    errors = list(validator.iter_errors(doc))
    if not errors:
        failures.append(f"INVALID fixture accepted: {fixture.name}")
    else:
        print(f"  ok   invalid/{fixture.name} (rejected: {errors[0].message[:70]})")

if failures:
    print("\nFAIL", file=sys.stderr)
    for f in failures:
        print(f, file=sys.stderr)
    sys.exit(1)

print("\nPASS — all fixtures behaved as their directory asserts")
