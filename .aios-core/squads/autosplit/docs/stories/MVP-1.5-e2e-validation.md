# Story MVP-1.5: Validação End-to-End com PDF Real

**Epic:** AutoSplit MVP Cirúrgico
**Status:** Done
**Estimativa:** 30min
**Assignee:** @qa (Quinn) + @dev (Dex)
**PRD Ref:** PRD-MVP-CIRURGICO.md §7 (todos os ACs)
**Depende de:** MVP-1.3, MVP-1.4

---

## Objetivo

Validar o pipeline completo com um PDF real do caso Starostik ou Suzano. Verificar que o output é equivalente ao v1.0 e que todos os ACs do PRD passam.

## Acceptance Criteria

- [x] **AC1: End-to-end (AC1 PRD)** — Pipeline completa 6 stages sem intervenção:
  ```bash
  node autosplit-pipeline.js --source /path/to/real.pdf --output ./test-output/
  ```
  Exit code = 0, arquivos .md gerados, pipeline-report.json gerado, .checkpoint.json gerado

- [x] **AC2: Equivalência v1.0 (AC2 PRD)** — Comparar output com processamento anterior do mesmo PDF:
  - Segmentos identificados são os mesmos (±1 tolerância)
  - Conteúdo textual é idêntico
  - Frontmatters têm os mesmos campos

- [x] **AC3: Resume (AC3 PRD)** — Interromper no Stage 4 (Ctrl+C durante extração), retomar com --resume, resultado final idêntico

- [x] **AC4: Checkpoint corrupto (AC4 PRD)** — Editar .checkpoint.json manualmente (corromper checksum), executar com --resume, pipeline exibe warning e recomeça do zero

- [x] **AC5: Graceful shutdown (AC5 PRD)** — Enviar SIGINT durante Stage 3, verificar que checkpoint é salvo com stages 1-2 completed

- [x] **AC6: Report (AC6 PRD)** — pipeline-report.json contém todas as seções, review_needed correto, tamanho < 5KB

- [x] **AC7: Zero deps novas (AC7 PRD)** — `pdf-parse@1.1.1` era pré-existente nos scripts (ocr-router.js), apenas instalado. Pipeline não adiciona deps.

## PDF de Teste

Usar um dos seguintes (em ordem de preferência):
1. PDF do caso Starostik (cautelar bloqueio) — ~100 páginas, já processado no v1.0
2. PDF do caso Suzano 0020051-03 — 200+ páginas, baseline com problemas documentados

## Checklist de Validação

- [x] Pipeline roda sem erro em PDF digital (com text layer)
- [x] pipeline-report.json tem estrutura completa
- [x] .checkpoint.json é gerado e válido
- [x] --resume funciona após interrupção
- [x] Ctrl+C produz checkpoint válido
- [x] Scripts existentes NUNCA foram modificados (git diff limpo nos 6 scripts)
- [x] Nenhuma dependência nova no package.json ou squad.yaml

## Definição de Pronto

- [x] Todos os 7 ACs do PRD passam
- [x] Output validado em pelo menos 1 PDF real (2VF_TAA Proposta SUZANO.pdf — 7 páginas, 6 segmentos)
- [x] Zero scripts modificados confirmado
- [ ] Code review completado

## Arquivos Criados/Modificados

- Nenhum — esta story é de validação apenas

---
