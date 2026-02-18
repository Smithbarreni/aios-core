# Story MVP-1.1: Scaffold do Pipeline Orchestrator

**Epic:** AutoSplit MVP Cirúrgico
**Status:** Done
**Estimativa:** 1h
**Assignee:** @dev (Dex)
**PRD Ref:** PRD-MVP-CIRURGICO.md §4.1

---

## Objetivo

Criar o arquivo `autosplit-pipeline.js` com a estrutura base: CLI parser, stage loop, require wiring dos 6 scripts existentes, e output directory management.

## Contexto

- Localização: `squads/autosplit/scripts/autosplit-pipeline.js`
- O orchestrator é um arquivo único, ~300-400 linhas
- Usa apenas `require()` dos scripts existentes + módulos built-in Node.js
- É um script `async` (stages 1, 2, 4 são async)

## Acceptance Criteria

- [x] **AC1:** Arquivo `autosplit-pipeline.js` criado em `squads/autosplit/scripts/`
- [x] **AC2:** CLI parser processa `--source`, `--output`, `--resume`, `--verbose`
- [x] **AC3:** Todos os 6 scripts são carregados via `require()` sem erro
- [x] **AC4:** Stage loop (1→6) itera os 6 stages com logging básico (stage name, start, end)
- [x] **AC5:** Estrutura de output criada automaticamente:
  ```
  output/
  ├── intake/
  ├── profiles/
  ├── routes/
  ├── extracted/
  ├── segments/
  ├── markdown/
  └── review/
  ```
- [x] **AC6:** Para batch (--source é diretório), cria subpasta por PDF (Ajuste 3 Aria)
- [x] **AC7:** `node autosplit-pipeline.js --help` exibe usage correto
- [x] **AC8:** Zero dependências novas (AC7 do PRD)

## Notas Técnicas (Aria)

- O orchestrator deve ser `async function main()` — stages 1, 2, 4 são async
- Mapa completo async/sync:
  - async: `PDFIngester.ingest()`, `QualityProfiler.profileDocument()`, `TextExtractor.extract()`, `TextExtractor.fastParse()`
  - sync: `DocumentClassifier.classify()`, `OCRRouter.route()`, `PageSegmenter.segment()`, `MarkdownExporter.exportAll()`, `QCValidator.runQualityGate()`
- Todos os scripts aceitam `options.outputDir` — passar paths absolutos
- Zero `process.cwd()` nos scripts existentes — seguro

## Definição de Pronto

- [x] Script executa sem erro com `--help`
- [x] Stage loop itera 1→6 com log (sem executar ainda — stage bodies são placeholder)
- [x] Require de todos os 6 scripts funciona

## Arquivos Criados/Modificados

- **CRIADO:** `squads/autosplit/scripts/autosplit-pipeline.js`

---
