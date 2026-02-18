---
task: Export Markdown Files
responsavel: "@splitter"
responsavel_type: agent
atomic_layer: task
Entrada: |
  - segments: Lista de segmentos com page ranges (obrigatorio)
  - extracted_text: Texto extraido por pagina (obrigatorio)
  - source_pdf: Caminho do PDF original (obrigatorio)
  - classification: Classificacao de cada segmento (obrigatorio)
Saida: |
  - output_files: Lista de arquivos MD gerados
    - file_path: Caminho do MD
    - segment_id: ID do segmento
    - doc_type: Tipo documental
    - page_range: "p.X-Y"
  - index_file: Indice JSON de todos os MDs gerados
Checklist:
  - "[ ] Para cada segmento: montar texto concatenando paginas do range"
  - "[ ] Gerar metadata header YAML frontmatter"
  - "[ ] Formatar texto em Markdown limpo"
  - "[ ] Nomear arquivo: {NNN}-{type}-{doc_type}.md"
  - "[ ] Gerar indice JSON com todos os arquivos"
  - "[ ] Validar que nenhum segmento ficou sem arquivo"
---

# *export

Gera um arquivo Markdown por segmento com metadata completa e traceability.

## Uso

```
@splitter *export --segments ./output/segments/doc-segments.json --text ./output/extracted/doc-extracted.json --source ./input/processo.pdf
```

## Markdown Output Format

```markdown
---
segment_id: "seg-001"
source_pdf: "processo-123.pdf"
page_range: "1-15"
doc_type: "peticao-inicial"
classification_confidence: 0.92
extraction_method: "fast-parse"
extraction_confidence: 0.95
segmentation_confidence: 0.88
generated_at: "2026-02-13T22:30:00Z"
pipeline_version: "1.0.0"
---

# Peticao Inicial

[Texto extraido da pagina 1]

---
<!-- page-break: p.2 -->

[Texto extraido da pagina 2]

...
```

## File Naming Convention

```
{NNN}-{segment_type}-{doc_type}.md

Examples:
  001-piece-peticao-inicial.md
  002-piece-contestacao.md
  003-attachment-procuracao.md
  004-piece-sentenca.md
  005-exhibit-contrato.md
```

## Index File

```json
{
  "source_pdf": "processo-123.pdf",
  "generated_at": "2026-02-13T22:30:00Z",
  "total_pages": 150,
  "total_segments": 12,
  "files": [
    {
      "file": "001-piece-peticao-inicial.md",
      "segment_id": "seg-001",
      "doc_type": "peticao-inicial",
      "pages": "1-15",
      "confidence": 0.92
    }
  ]
}
```

## Script

Uses: `scripts/md-exporter.js`
