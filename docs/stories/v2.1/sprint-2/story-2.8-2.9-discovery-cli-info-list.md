# STORIES 2.8-2.9: Discovery CLI - Info & List

**IDs:** 2.8, 2.9 | **Épico:** [EPIC-S2](../../../epics/epic-s2-modular-architecture.md)
**Sprint:** 2 | **Points:** 8 (3+5) | **Priority:** 🟠 High | **Created:** 2025-01-19
**Updated:** 2025-11-29
**Status:** 🟡 Ready for Dev

**Reference:** [ADR-002 Migration Map](../../architecture/decisions/ADR-002-migration-map.md)
**Quality Gate:** [2.8-2.9-discovery-cli.yml](../../qa/gates/2.8-2.9-discovery-cli.yml)

---

## 📊 User Stories

### Story 2.8: Info Command (3 pts)
**Como** developer, **Quero** `aios workers info <id>`, **Para** ver detalhes completos de um worker

### Story 2.9: List Command (5 pts)
**Como** developer, **Quero** `aios workers list`, **Para** explorar todos workers disponíveis

---

## ✅ Acceptance Criteria

### Story 2.8: Info Command
- [ ] AC8.1: CLI command `aios workers info <id>` implemented
- [ ] AC8.2: Displays all worker metadata in formatted output
- [ ] AC8.3: Shows usage examples for the worker
- [ ] AC8.4: Shows performance metrics
- [ ] AC8.5: Error handling for invalid worker ID with suggestions ("did you mean?")
- [ ] AC8.6: Output format options (`--format=pretty|json|yaml`)
- [ ] AC8.7: Verbose mode (`--verbose`) for debug output
- [ ] AC8.8: Info command completes in < 500ms

### Story 2.9: List Command
- [ ] AC9.1: CLI command `aios workers list` implemented
- [ ] AC9.2: Groups workers by category/subcategory
- [ ] AC9.3: Category filter (`--category=<category>`)
- [ ] AC9.4: Output format options (`--format=table|json|yaml|tree`)
- [ ] AC9.5: Shows worker count per category
- [ ] AC9.6: Pagination support for large lists (`--page`, `--limit`)
- [ ] AC9.7: Count-only mode (`--count`) for quick statistics
- [ ] AC9.8: Verbose mode (`--verbose`) for debug output
- [ ] AC9.9: List command completes in < 1s with 200+ workers

### Shared
- [ ] AC-S1: All P0 smoke tests pass (CLI-01 to CLI-03)
- [ ] AC-S2: All P1 smoke tests pass (CLI-04 to CLI-10)
- [ ] AC-S3: All P2 smoke tests pass (CLI-11 to CLI-12)
- [ ] AC-S4: Help text shows clear usage for both commands

---

## 🔧 Scope

### Info Command Interface (2.8)

```bash
$ aios workers info data-transformer-json-csv

📦 JSON to CSV Transformer
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

ID:           data-transformer-json-csv
Category:     data / transformation
Executor:     Worker, Agent
Task Format:  TASK-FORMAT-V1
Path:         .aios-core/development/tasks/data/json-csv-transformer.md

Description:
  Converts JSON data to CSV format with configurable
  column mapping and delimiter options.

Inputs:
  - json (object|array) - JSON data to transform

Outputs:
  - csv (string) - CSV formatted data

Performance:
  Avg Duration:  50ms
  Cacheable:     Yes
  Parallelizable: Yes

Tags: etl, data, transformation

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Usage Example:
  aios task run data-transformer-json-csv --input=data.json

Related Workers:
  - csv-json-transformer
  - json-validator

# JSON output
$ aios workers info data-transformer-json-csv --format=json
{
  "id": "data-transformer-json-csv",
  "name": "JSON to CSV Transformer",
  ...
}

# Error handling
$ aios workers info invalid-id
Error: Worker 'invalid-id' not found in registry.

Did you mean:
  - invalid-schema-checker
  - data-validator

Use 'aios workers search invalid' to find workers.
```

### List Command Interface (2.9)

```bash
$ aios workers list
97 workers available in 8 categories:

DATA (23 workers)
├── Transformation (12)
│   ├── json-csv-transformer
│   ├── csv-json-transformer
│   ├── xml-json-transformer
│   └── ... (+9 more)
├── Validation (8)
│   ├── json-validator
│   ├── schema-validator
│   └── ... (+6 more)
└── ETL (3)
    └── ...

TESTING (18 workers)
├── Unit (8)
├── Integration (6)
└── E2E (4)

CODE (15 workers)
...

Use 'aios workers info <id>' for details.
Use 'aios workers search <query>' to search.

# Filter by category
$ aios workers list --category=data
23 workers in category 'data':

Transformation (12)
  json-csv-transformer      JSON to CSV Transformer
  csv-json-transformer      CSV to JSON Transformer
  ...

Validation (8)
  json-validator           JSON Schema Validator
  ...

# Table format
$ aios workers list --format=table
#   ID                        NAME                      CATEGORY     SUBCATEGORY
1   json-csv-transformer      JSON to CSV Transformer   data         transformation
2   csv-json-transformer      CSV to JSON Transformer   data         transformation
...
97  workflow-orchestrator     Workflow Orchestrator     workflow     orchestration

# JSON format
$ aios workers list --format=json --category=testing
[
  { "id": "unit-test-generator", "category": "testing", "subcategory": "unit" },
  ...
]

# Pagination
$ aios workers list --page=2 --limit=20
Showing 21-40 of 97 workers...
```

### Directory Structure

```
.aios-core/cli/commands/workers/
├── info.js                 # Info command (2.8)
├── list.js                 # List command (2.9)
├── formatters/
│   ├── info-formatter.js   # Pretty print worker info
│   ├── list-tree.js        # Tree view formatter
│   └── list-table.js       # Table view formatter
└── utils/
    └── pagination.js       # Pagination logic
```

---

## 🤖 CodeRabbit Integration

### Story Type Analysis

**Primary Type**: CLI Feature
**Secondary Type(s)**: Display/Formatting, User Experience
**Complexity**: Medium (formatting, grouping, pagination)

### Specialized Agent Assignment

**Primary Agents:**
- @dev: CLI command implementation
- @ux-expert: Output formatting review

**Supporting Agents:**
- @qa: CLI testing and edge cases

### Quality Gate Tasks

- [ ] Pre-Commit (@dev): Run before marking story complete
- [ ] Pre-PR (@github-devops): Run before creating pull request

### Self-Healing Configuration

**Expected Self-Healing:**
- Primary Agent: @dev (light mode)
- Max Iterations: 2
- Timeout: 10 minutes
- Severity Filter: CRITICAL only

### CodeRabbit Focus Areas

**Primary Focus:**
- CLI argument parsing
- Output formatting consistency
- Error messages clarity
- Edge cases (empty registry, invalid IDs)

**Secondary Focus:**
- Help text completeness
- Pagination correctness
- Performance with large lists

---

## 📋 Tasks

### Story 2.8: Info Command (5h)
- [ ] 2.8.1: Create info command structure (1h)
- [ ] 2.8.2: Implement formatted display (2h)
  - Pretty print with boxes
  - Sections: metadata, description, inputs/outputs, performance
- [ ] 2.8.3: Add usage examples section (0.5h)
- [ ] 2.8.4: Add related workers section (0.5h)
- [ ] 2.8.5: Implement error handling with suggestions (0.5h)
- [ ] 2.8.6: Add output format options (0.5h)

### Story 2.9: List Command (10h)
- [ ] 2.9.1: Create list command structure (1h)
- [ ] 2.9.2: Implement grouped display (category/subcategory) (3h)
  - Tree view (default)
  - Collapsible categories
- [ ] 2.9.3: Implement table format (1.5h)
- [ ] 2.9.4: Implement category filter (0.5h)
- [ ] 2.9.5: Implement pagination (1.5h)
  - --page and --limit options
  - Show total and current range
- [ ] 2.9.6: Add worker count summary (0.5h)
- [ ] 2.9.7: Test with 97+ workers (2h)

### Shared Tasks
- [ ] 2.8-9.1: Add help text for both commands (0.5h)
- [ ] 2.8-9.2: Run smoke tests CLI-01 to CLI-08 (1h)
- [ ] 2.8-9.3: Create unit tests (1h)

**Total Estimated:** 17.5h

---

## 🧪 Smoke Tests (CLI-01 to CLI-12)

| Test ID | Name | Description | Priority | Pass Criteria |
|---------|------|-------------|----------|---------------|
| CLI-01 | Info Basic | `aios workers info <valid-id>` shows info | P0 | Output contains worker name |
| CLI-02 | Info Error | `aios workers info <invalid-id>` shows error | P0 | Error message + suggestions |
| CLI-03 | List Basic | `aios workers list` shows all workers | P0 | Count matches registry |
| CLI-04 | Info JSON | `aios workers info <id> --format=json` | P1 | Valid JSON output |
| CLI-05 | List Category | `aios workers list --category=data` | P1 | All results in category |
| CLI-06 | List Table | `aios workers list --format=table` | P1 | Table headers present |
| CLI-07 | List Pagination | `aios workers list --page=2 --limit=10` | P1 | Shows items 11-20 |
| CLI-08 | Help Text | `aios workers info --help` / `list --help` | P1 | Help shown |
| CLI-09 | Info Performance | `aios workers info <id>` completes fast | P1 | < 500ms |
| CLI-10 | List Performance | `aios workers list` completes fast | P1 | < 1s with 200+ workers |
| CLI-11 | List Count | `aios workers list --count` shows stats | P2 | Category counts shown |
| CLI-12 | Verbose Mode | `--verbose` shows debug info | P2 | Debug output present |

**Rollback Triggers:**
- CLI-01 fails → Info command broken, rollback
- CLI-02 fails → Error handling broken, fix
- CLI-03 fails → List command broken, rollback

---

## 🔗 Dependencies

**Depends on:**
- [Story 2.6](./story-2.6-service-registry.md) ✅ Complete
- [Story 2.7](./story-2.7-discovery-cli-search.md) ✅ Complete (CLI structure created)

**Blocks:**
- Story 2.16 (Documentation) - Needs CLI docs

---

## 📋 Rollback Plan

| Condition | Action |
|-----------|--------|
| CLI-01 fails (info broken) | Immediate rollback |
| CLI-03 fails (list broken) | Immediate rollback |
| CLI-02 fails (error handling) | Fix, don't block |
| Pagination broken | Fix, don't block |

```bash
# Rollback command
git revert --no-commit HEAD~N
```

---

## 📁 File List

**To Create:**
- `.aios-core/cli/commands/workers/info.js`
- `.aios-core/cli/commands/workers/list.js`
- `.aios-core/cli/commands/workers/formatters/info-formatter.js`
- `.aios-core/cli/commands/workers/formatters/list-tree.js`
- `.aios-core/cli/commands/workers/formatters/list-table.js`
- `.aios-core/cli/commands/workers/utils/pagination.js`
- `tests/unit/info-cli.test.js`
- `tests/unit/list-cli.test.js`

**To Update:**
- `.aios-core/cli/index.js` (register commands)

---

## ✅ Definition of Done

### Story 2.8
- [ ] `aios workers info <id>` shows complete worker details
- [ ] Error handling with suggestions for invalid IDs
- [ ] Output formats work (pretty, json, yaml)
- [ ] Help text is clear and helpful

### Story 2.9
- [ ] `aios workers list` shows all workers grouped
- [ ] Category filter works correctly
- [ ] Output formats work (tree, table, json, yaml)
- [ ] Pagination works with large lists
- [ ] Count summary is accurate

### Shared
- [ ] All P0 smoke tests pass (CLI-01, CLI-02, CLI-03)
- [ ] All P1 smoke tests pass (CLI-04 to CLI-10)
- [ ] All P2 smoke tests pass (CLI-11 to CLI-12)
- [ ] Unit tests cover main scenarios
- [ ] Story checkboxes updated to [x]
- [ ] PR created and approved

---

## 🤖 Dev Agent Record

### Agent Model Used
_(To be filled during implementation)_

### Debug Log References
_(To be filled during implementation)_

### Completion Notes
_(To be filled during implementation)_

---

## ✅ QA Results

### Smoke Tests Results (CLI-01 to CLI-12)

| Test ID | Name | Result | Notes |
|---------|------|--------|-------|
| CLI-01 | Info Basic | ⏳ Pending | |
| CLI-02 | Info Error | ⏳ Pending | |
| CLI-03 | List Basic | ⏳ Pending | |
| CLI-04 | Info JSON | ⏳ Pending | |
| CLI-05 | List Category | ⏳ Pending | |
| CLI-06 | List Table | ⏳ Pending | |
| CLI-07 | List Pagination | ⏳ Pending | |
| CLI-08 | Help Text | ⏳ Pending | |
| CLI-09 | Info Performance | ⏳ Pending | |
| CLI-10 | List Performance | ⏳ Pending | |
| CLI-11 | List Count | ⏳ Pending | |
| CLI-12 | Verbose Mode | ⏳ Pending | |

### Gate Decision
_(To be filled after QA review)_

---

## 📝 Change Log

| Date | Version | Description | Author |
|------|---------|-------------|--------|
| 2025-01-19 | 0.1 | Stories created (bundled in 2.6-2.9) | River |
| 2025-11-29 | 1.0 | Consolidated to 2.8-2.9, full enrichment | Pax |
| 2025-11-29 | 1.1 | Status → Ready for Dev, added ACs (verbose, perf targets, count), 4 new smoke tests | Pax |

---

**Criado por:** River 🌊
**Refinado por:** Pax 🎯 (PO) - 2025-11-29
