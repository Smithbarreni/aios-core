# Changelog

All notable changes to AIOS-FULLSTACK will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [4.32.0] - 2025-11-12

### Removed
- **hybrid-ops expansion pack** - Moved to separate repository for independent maintenance
  - Removed `expansion-packs/hybrid-ops/` directory
  - Removed `.hybrid-ops/` directory
  - Updated `core-config.yaml` to reference external repository
  - Updated `install-manifest.yaml` (removed 47 file entries)
  - Repository: https://github.com/Pedrovaleriolopez/aios-hybrid-ops-pedro-valerio

### Changed
- README.md - hybrid-ops now listed under "Expansion Packs Externos"
- Expansion pack can now be installed independently via GitHub

### Technical
- Story: 4.6 - Move Hybrid-Ops to Separate Repository
- Breaking Change: hybrid-ops no longer bundled with aios-fullstack
- Migration: Users can install from external repo to `expansion-packs/hybrid-ops/`
- Story: 4.7 - Removed `expansion-packs/hybrid-ops.legacy/` directory (legacy backup no longer needed)

## [4.31.1] - 2025-10-22

### Added
- NPX temporary directory detection with defense-in-depth architecture
- PRIMARY detection layer in `tools/aios-npx-wrapper.js` using `__dirname`
- SECONDARY fallback detection in `tools/installer/bin/aios.js` using `process.cwd()`
- User-friendly help message with chalk styling when NPX temp directory detected
- Regex patterns to identify macOS NPX temporary paths (`/private/var/folders/.*/npx-/`, `/.npm/_npx/`)
- JSDoc documentation for NPX detection functions

### Fixed
- NPX installation from temporary directory no longer attempts IDE detection
- Clear error message guides users to correct installation directory
- Prevents confusion when running `npx aios-fullstack install` from home directory

### Changed
- Early exit with `process.exit(1)` when NPX temporary context detected
- Help message provides actionable solution: `cd /path/to/your/project && npx aios-fullstack install`

### Technical
- Story: 2.3 - NPX Installation Context Detection & Help Text (macOS)
- Defense in depth: Two independent detection layers provide redundancy
- macOS-specific implementation (other platforms unaffected)
- Non-breaking change (patch version)

## [4.31.0] - Previous Release

*(Previous changelog entries to be added)*
