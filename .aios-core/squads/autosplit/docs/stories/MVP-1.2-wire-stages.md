# Story MVP-1.2: Wiring dos 6 Stages

**Epic:** AutoSplit MVP Cirúrgico
**Status:** Done
**Estimativa:** 1.5h
**Assignee:** @dev (Dex)
**PRD Ref:** PRD-MVP-CIRURGICO.md §4.1
**Depende de:** MVP-1.1

---

## Objetivo

Implementar o corpo de cada stage no pipeline loop, conectando as chamadas reais aos 6 scripts existentes. Cada stage recebe o output do anterior e produz input para o próximo.

## Contexto

O pipeline tem 6 stages com um data flow linear. O Stage 2 tem um design especial: precisa de texto preliminar (via `TextExtractor.fastParse()`) antes da extração "real" do Stage 4.

## Acceptance Criteria

- [x] **AC1: Stage 1 (INGEST)** — Chama `PDFIngester.ingest(sourcePath)`. Recebe manifest com files[], duplicates[], errors[].
- [x] **AC2: Stage 2 (PROFILE)** — Para cada file no manifest:
  1. Chama `TextExtractor.fastParse(filePath)` para obter texto preliminar
  2. Concatena texto de todas as páginas para `fullText`
  3. Chama `QualityProfiler.profileDocument(filePath, fullText, pageCount)`
  4. Chama `DocumentClassifier.classify(fullText)`
  5. Salva profile via `profiler.saveProfile()`
  - (Ajuste 2 da Aria: usar TextExtractor para fast-parse provisório)
- [x] **AC3: Stage 3 (ROUTE)** — Chama `OCRRouter.route(profile)` e salva decisão
- [x] **AC4: Stage 4 (EXTRACT)** — Chama `TextExtractor.extract(filePath, routeDecision)` e salva extração
- [x] **AC5: Stage 5 (SEGMENT)** — Chama `PageSegmenter.segment(extractedData)` e salva segmentos
- [x] **AC6: Stage 6 (EXPORT+QC)** — Chama `MarkdownExporter.exportAll()` seguido de `QCValidator.runQualityGate()`
- [x] **AC7:** Cada stage passa dados para o próximo via variáveis locais (não releitura de JSON do disco)
- [x] **AC8:** Se route != `fast-parse`, adiciona flag `limitations: ["OCR not available"]` ao contexto (Ajuste 1 Aria)

## Data Flow

```
Stage 1 → manifest { files[], summary }
             ↓
Stage 2 → profiles[] { quality_tier, readability, classification }
             ↓
Stage 3 → routeDecisions[] { method, engine, preprocessing }
             ↓
Stage 4 → extractedData[] { pages[], confidence }
             ↓
Stage 5 → segments[] { segment_id, type, doc_type, page_start, page_end }
             ↓
Stage 6 → { files[], indexPath, qcResult }
```

## Notas Técnicas

- Stage 2 e Stage 4 usam o mesmo `TextExtractor` — em 90%+ dos casos (PDFs digitais), ambos fazem fast-parse. Redundância aceita.
- Stage 6 junta EXPORT e QC porque QC depende diretamente do output do export (index.json + arquivos .md)
- `QCValidator.runQualityGate()` precisa de `outputDir` (pasta markdown) e `indexPath` — ambos produzidos por `exportAll()`

## Definição de Pronto

- [x] Pipeline executa end-to-end com um PDF simples (digital, com text layer)
- [x] Arquivos .md são gerados em output/markdown/
- [x] Nenhum script existente foi modificado

## Arquivos Criados/Modificados

- **MODIFICADO:** `squads/autosplit/scripts/autosplit-pipeline.js`

---
