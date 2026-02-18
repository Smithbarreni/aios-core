# Story MVP-1.4: Pipeline Report Generator

**Epic:** AutoSplit MVP Cirúrgico
**Status:** Done
**Estimativa:** 30min
**Assignee:** @dev (Dex)
**PRD Ref:** PRD-MVP-CIRURGICO.md §4.4
**Depende de:** MVP-1.2

---

## Objetivo

Gerar `pipeline-report.json` ao final da execução — relatório compacto (~3K tokens) que o `@pipeline-chief *review` pode consumir em vez dos ~54K tokens atuais.

## Acceptance Criteria

- [x] **AC1:** `pipeline-report.json` gerado no output dir após stage 6
- [x] **AC2:** Estrutura completa:
  ```json
  {
    "pipeline_version": "1.0.0",
    "source": "processo.pdf",
    "completed_at": "ISO-8601",
    "duration_ms": 12500,
    "stages": {
      "ingest": { "files": 1, "duplicates": 0, "errors": 0 },
      "profile": { "quality_tier": "B", "readability": 72, "noise": "low", "classification": "peticao-inicial" },
      "route": { "method": "fast-parse", "engine": "pdf-parse", "preprocessing": [] },
      "extract": { "pages": 142, "confidence": 0.95, "fallback": false },
      "segment": { "total_segments": 23, "types": {} },
      "export": { "files_generated": 23, "index_path": "markdown/index.json" },
      "qc": { "passed": 19, "flagged": 3, "rejected": 1, "mislabels": 0 }
    },
    "limitations": [],
    "output_dir": "./output/",
    "review_needed": true,
    "review_reasons": ["3 files flagged", "1 file rejected"]
  }
  ```
- [x] **AC3:** `review_needed` é `true` se existe qualquer flagged ou rejected
- [x] **AC4:** `review_reasons` lista motivos específicos (quantidade + tipo)
- [x] **AC5:** `limitations` inclui "OCR not available - digital PDFs only" se route != fast-parse (Ajuste 1 Aria)
- [x] **AC6:** `duration_ms` mede tempo total real do pipeline
- [x] **AC7:** Tamanho do arquivo < 5KB

## Para Batch (múltiplos PDFs)

- [x] **AC8:** Gerar `batch-report.json` na raiz do output com resumo agregado + array de reports individuais

## Notas Técnicas

- Coletar timing com `Date.now()` antes e depois de cada stage
- Agregar dados dos stage results que já estão disponíveis após a execução
- `types` no segment é um Object.keys reduce dos `doc_type` dos segmentos

## Definição de Pronto

- [x] Report gerado com todas as seções
- [x] Tamanho < 5KB para PDF de 100+ páginas
- [x] report.review_needed reflete corretamente o QC

## Arquivos Criados/Modificados

- **MODIFICADO:** `squads/autosplit/scripts/autosplit-pipeline.js`

---
