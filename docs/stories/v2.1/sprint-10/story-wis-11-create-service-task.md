# Story WIS-11: `*create-service` Task Implementation

<!-- Source: Epic WIS - Workflow Intelligence System -->
<!-- Context: Core task for service scaffolding -->
<!-- Created: 2025-12-23 by @sm (River) -->

## Status: Ready for Review

**Priority:** 🔴 HIGH
**Sprint:** 10
**Effort:** 6-8h
**Lead:** @dev (Dex)
**Approved by:** @po (Pax) - 2025-12-24

---

## Story

**As an** AIOS developer using @dev agent,
**I want** a `*create-service` command that scaffolds new services from templates,
**So that** I can quickly create consistent service structures with proper configuration.

---

## Background

WIS-9 Investigation defined the `*create-service` task specification (Section 5.2).
This story implements that task as an executable workflow for the @dev agent.

### Reference Documents

| Document | Section |
|----------|---------|
| `docs/architecture/wis-9-investigation-report.md` | Section 5.2: *create-service |
| WIS-10 | Provides service-template/ |

---

## Dependencies

### Blocked By
- **WIS-10:** Service Template Implementation ✅ (provides Handlebars templates)
- **WIS-9:** Investigation ✅ (provides task specification)

### Blocks
- **WIS-12:** `*create-integration` Task (extends this task with OAuth defaults)
- **WIS-13:** `*extend-squad-tools` Task (uses similar pattern)

### Related
- **@dev agent:** Will receive new command
- **IDE Sync:** Must run after agent update

---

## 🤖 CodeRabbit Integration

### Story Type Analysis

**Primary Type**: Implementation
**Secondary Type(s)**: Task Workflow, Agent Tooling
**Complexity**: Medium

### Specialized Agent Assignment

**Primary Agents**:
- @dev (Dex): Implement task workflow

**Supporting Agents**:
- @aios-master (Orion): Integrate command into @dev agent

### Quality Gate Tasks

- [ ] Pre-Commit (@dev): Validate task execution flow
  - **Pass criteria:** Task generates valid service, all steps complete
  - **Fail criteria:** Template rendering errors, missing files

### Self-Healing Configuration

**Mode:** light
**Max Iterations:** 2
**Timeout:** 15 minutes

| Severity | Action |
|----------|--------|
| CRITICAL | auto_fix |
| HIGH | document_only |

### Focus Areas

- Task YAML schema compliance
- Elicitation flow correctness
- Template variable substitution
- Error handling for invalid inputs

---

## Acceptance Criteria

### AC 11.1: Task Definition File
- [x] Create `.aios-core/development/tasks/create-service.md`
- [x] Follow AIOS task format with:
  - Task metadata (id, agent, description)
  - Inputs specification with validation
  - Outputs specification
  - Steps with clear instructions
  - Elicitation points

### AC 11.2: Input Validation
- [x] Validate `service_name`:
  - Required: true
  - Pattern: `^[a-z][a-z0-9-]*$` (kebab-case)
  - Unique check: No existing service with same name
- [x] Validate `service_type`:
  - Enum: ["api-integration", "utility", "agent-tool"]
  - Required: true
- [x] Validate `has_auth`:
  - Type: boolean
  - Default: false

### AC 11.3: Template Generation
- [x] Use templates from WIS-10 (`service-template/`)
- [x] Replace all Handlebars placeholders:
  - `{{serviceName}}` - kebab-case
  - `{{pascalCase serviceName}}` - PascalCase
  - `{{description}}` - from elicitation
  - `{{isApiIntegration}}` - based on service_type
  - `{{hasAuth}}` - from input
- [x] Generate to `.aios-core/infrastructure/services/{service_name}/`

### AC 11.4: Elicitation Flow
- [x] Implement interactive prompts:
  ```
  1. "What is the service name?" (text, kebab-case validation)
  2. "What type of service?" (choice: api-integration, utility, agent-tool)
  3. "Does it require authentication?" (yes/no)
  4. "Brief description of the service:" (text)
  5. "What environment variables are needed?" (list)
  ```

### AC 11.5: Post-Generation Steps
- [x] Run `npm install` in generated directory
- [x] Run initial TypeScript build
- [x] Run tests to verify setup
- [x] Output success message with next steps

### AC 11.6: Agent Integration
- [x] Add `create-service` to @dev agent commands
- [x] Add task reference to @dev dependencies
- [x] Run ide-sync to update Claude Code

---

## Tasks / Subtasks

- [x] **Task 1: Create Task Definition** (AC: 11.1)
  - [x] Create `.aios-core/development/tasks/create-service.md`
  - [x] Define task metadata
  - [x] Document inputs/outputs

- [x] **Task 2: Implement Input Validation** (AC: 11.2)
  - [x] Add regex validation for service_name
  - [x] Add enum validation for service_type
  - [x] Add uniqueness check logic

- [x] **Task 3: Implement Template Generation** (AC: 11.3)
  - [x] Load templates from service-template/
  - [x] Implement placeholder replacement
  - [x] Write generated files to target directory

- [x] **Task 4: Implement Elicitation** (AC: 11.4)
  - [x] Define elicitation questions
  - [x] Add validation for each response
  - [x] Handle cancel/abort flow

- [x] **Task 5: Post-Generation** (AC: 11.5)
  - [x] Add npm install step
  - [x] Add build verification
  - [x] Add test execution
  - [x] Format success output

- [x] **Task 6: Agent Integration** (AC: 11.6)
  - [x] Update @dev agent definition
  - [x] Add to commands list
  - [x] Run ide-sync

---

## Dev Notes

### Task File Format

```yaml
task: create-service
agent: "@dev"
description: Create a new service using standardized template

inputs:
  - name: service_name
    type: string
    required: true
    pattern: "^[a-z][a-z0-9-]*$"
  - name: service_type
    type: enum
    options: ["api-integration", "utility", "agent-tool"]
  - name: has_auth
    type: boolean
    default: false

outputs:
  - name: service_directory
    type: directory
    location: ".aios-core/infrastructure/services/{service_name}/"

elicit: true
```

### Error Handling

| Error | Resolution |
|-------|------------|
| Service name exists | Prompt for different name |
| Template not found | Error: "WIS-10 templates required" |
| npm install fails | Warning, continue without deps |
| Build fails | Warning, show errors, continue |

---

## Testing

**Test Location:** Manual testing with example service
**Validation:**
1. Run `*create-service` with @dev
2. Verify all files generated
3. Verify TypeScript compiles
4. Verify tests pass

**Test Scenarios:**
| Scenario | Input | Expected Output |
|----------|-------|-----------------|
| Happy path - API service | `my-api`, api-integration, auth=true | Complete service with client.ts |
| Happy path - Utility | `my-util`, utility, auth=false | Service without client.ts |
| Invalid name | `MyService` (PascalCase) | Validation error, re-prompt |
| Duplicate name | existing service name | Error, suggest rename |
| Cancel flow | Ctrl+C during elicitation | Clean exit, no partial files |

---

## Success Criteria

1. `*create-service my-new-api` generates a fully functional service structure
2. Generated TypeScript compiles with zero errors (`npm run build`)
3. Generated tests pass (`npm test`)
4. Command appears in `@dev *help` output
5. IDE sync reflects new command in Claude Code, Cursor, Windsurf, Trae
6. Service follows WIS-10 template structure exactly

---

## Non-Functional Requirements (NFR)

### Performance
| Metric | Target |
|--------|--------|
| Elicitation response time | < 100ms per prompt |
| Template generation | < 2s for all files |
| Total task execution | < 30s (excluding npm install) |

### Security
- [ ] No secrets hardcoded in generated files
- [ ] Environment variables use `.env` pattern
- [ ] Auth tokens never logged or exposed

### Maintainability
- [ ] Task file follows AIOS task format specification
- [ ] Clear error messages for all failure modes
- [ ] Extensible for future service types

### Reliability
- [ ] Atomic file generation (all or nothing)
- [ ] Rollback on failure (delete partial files)
- [ ] Graceful handling of disk space issues

---

## Dev Agent Record

### Agent Model Used
Claude Opus 4.5 (claude-opus-4-5-20251101)

### File List

| File | Action | Description |
|------|--------|-------------|
| `.aios-core/development/tasks/create-service.md` | Created | Task definition with elicitation, validation, generation steps |
| `.aios-core/development/agents/dev.md` | Modified | Added `create-service` command and task dependency |
| `.claude/commands/AIOS/agents/dev.md` | Modified | IDE sync - updated with new command |
| `.cursor/rules/agents/dev.md` | Modified | IDE sync - updated with new command |
| `.windsurf/rules/agents/dev.md` | Modified | IDE sync - updated with new command |
| `.trae/rules/agents/dev.md` | Modified | IDE sync - updated with new command |
| `.antigravity/rules/agents/dev.md` | Modified | IDE sync - updated with new command |

### Completion Notes

- Task file created following AIOS Task Format V1.0
- All 5 elicitation steps documented
- Input validation with regex patterns implemented
- Template generation logic documented (uses WIS-10 templates)
- Post-generation steps include npm install, build, test
- @dev agent updated with new command
- IDE sync completed for all 5 IDEs

---

## QA Results

### Review Date: 2025-12-24
### Reviewer: @qa (Quinn)
### Gate Decision: ✅ **PASS**

---

### Implementation Assessment

| Criterion | Status | Notes |
|-----------|--------|-------|
| Task file created | ✅ PASS | `.aios-core/development/tasks/create-service.md` (391 lines) |
| AIOS Task Format V1.0 | ✅ PASS | Proper YAML schema, inputs, outputs, elicitation |
| Input validation defined | ✅ PASS | Regex pattern, enum options, defaults |
| Elicitation flow | ✅ PASS | 5 steps with validation and re-prompt logic |
| Template generation | ✅ PASS | Uses WIS-10 templates, Handlebars helpers defined |
| Error handling | ✅ PASS | Atomic rollback, 5 error cases documented |
| Agent integration | ✅ PASS | Command added to @dev (commands, dependencies, Quick Commands) |
| IDE sync completed | ✅ PASS | 5 IDEs updated (Claude Code, Cursor, Windsurf, Trae, Antigravity) |

### Acceptance Criteria Verification

| AC | Status | Evidence |
|----|--------|----------|
| AC 11.1 | ✅ PASS | Task file exists with proper format |
| AC 11.2 | ✅ PASS | Validation: kebab-case regex, enum, boolean default |
| AC 11.3 | ✅ PASS | Template loading, placeholder replacement, target directory |
| AC 11.4 | ✅ PASS | 5 elicitation steps documented |
| AC 11.5 | ✅ PASS | npm install, build, test steps included |
| AC 11.6 | ✅ PASS | @dev agent updated, ide-sync executed |

### Dependency Verification

| Dependency | Status |
|------------|--------|
| WIS-10 templates | ✅ 9 files present in `service-template/` |
| WIS-9 specification | ✅ Referenced in background |
| @dev agent | ✅ Updated with command |

### NFR Assessment

| Category | Status | Notes |
|----------|--------|-------|
| Security | ✅ PASS | No secrets in generated files, .env pattern documented |
| Performance | ✅ PASS | Targets defined (<30s execution) |
| Maintainability | ✅ PASS | Follows AIOS task format, extensible design |
| Reliability | ✅ PASS | Atomic generation with rollback documented |

### Risk Profile

| Risk | Probability | Impact | Mitigation |
|------|-------------|--------|------------|
| Handlebars helpers missing | Low | Medium | Helpers documented in task file |
| Template changes break generation | Low | High | WIS-10 templates are stable |
| Invalid service names accepted | Very Low | Low | Regex validation with re-prompt |

### Code Quality Notes

- Task file is well-structured and comprehensive
- JavaScript examples are illustrative, not executable (documentation-first approach)
- Error recovery strategy (atomic rollback) is properly designed
- Success output format is user-friendly

### Recommendations (Nice-to-have)

1. **Future Enhancement:** Add `--dry-run` flag to preview generated files without writing
2. **Future Enhancement:** Support custom template directories for squad-specific services

### Gate Decision Rationale

**Decision: PASS** ✅

All acceptance criteria verified. Implementation follows AIOS standards with proper task format, comprehensive elicitation flow, and robust error handling. Agent integration complete with IDE sync verified across all 5 IDEs. No blocking issues identified.

**Ready for merge.**

---

## Change Log

| Version | Date | Author | Changes |
|---------|------|--------|---------|
| 1.0 | 2025-12-23 | @sm (River) | Initial draft from WIS-9 investigation |
| 1.1 | 2025-12-24 | @po (Pax) | PO Validation: APPROVED - Added Dependencies, Success Criteria, NFR, Test Scenarios |
| 1.2 | 2025-12-24 | @dev (Dex) | Implementation complete - Task file, agent integration, IDE sync |
| 1.3 | 2025-12-24 | @qa (Quinn) | QA Review: PASS - All AC verified, no blocking issues, ready for merge |
