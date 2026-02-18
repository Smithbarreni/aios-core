# AutoSplit Squad

Legal document production line — ingests messy case-record PDFs, profiles quality and type, routes through optimal extraction (fast parse or OCR), segments into procedural pieces at page level, and exports one Markdown file per piece with full metadata and traceability.

## Agents

| Agent | Persona | Role |
|-------|---------|------|
| `@pipeline-chief` | Ingest | Pipeline Orchestrator & Quality Gatekeeper |
| `@doc-profiler` | Lens | Document Fingerprinter, Quality Profiler & Classifier |
| `@extractor` | Parse | Text Extraction Specialist with Multi-Path Routing |
| `@splitter` | Blade | Document Segmenter & Markdown Exporter |

## Pipeline Flow

```
PDF Input → Ingest → Fingerprint → Profile → Classify → Route → Extract → Segment → Export → Quality Gate → Output
```

### Stage Details

1. **Ingest** (`@pipeline-chief *ingest`) — Receive PDFs, hash, register, deduplicate
2. **Fingerprint** (`@doc-profiler *fingerprint`) — SHA-256 + partial hash, cross-batch dedup
3. **Profile** (`@doc-profiler *profile`) — DPI, orientation, readability, noise assessment
4. **Classify** (`@doc-profiler *classify`) — Document type with confidence score
5. **Route** (`@extractor *route`) — Choose extraction path based on quality profile
6. **Extract** (`@extractor *extract`) — Fast parse or OCR with fallback chain
7. **Segment** (`@splitter *segment`) — Split into procedural pieces at page boundaries
8. **Export** (`@splitter *export`) — One MD per piece with YAML frontmatter metadata
9. **Quality Gate** (`@pipeline-chief *quality-gate`) — Validate outputs, catch mislabels

## Output Format

Each piece is exported as a Markdown file with YAML frontmatter:

```markdown
---
segment_id: "seg-001"
source_pdf: "processo-123.pdf"
page_range: "1-15"
doc_type: "peticao-inicial"
extraction_method: "fast-parse"
extraction_confidence: 0.95
segmentation_confidence: 0.88
---

# Peticao Inicial

[extracted text...]
```

## Dependencies

- `pdf-parse` — Native PDF text extraction
- `tesseract.js` — OCR engine (optional, for scanned documents)
- `sharp` — Image preprocessing (optional, for enhanced OCR)
