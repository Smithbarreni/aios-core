# Story MVP-1.3: Checkpointing e Resume

**Epic:** AutoSplit MVP Cirúrgico
**Status:** Done
**Estimativa:** 1h
**Assignee:** @dev (Dex)
**PRD Ref:** PRD-MVP-CIRURGICO.md §4.2, §4.3
**Depende de:** MVP-1.2

---

## Objetivo

Implementar sistema de checkpoint que salva progresso após cada stage e permite retomar execução interrompida via `--resume`. Incluir signal handlers para graceful shutdown.

## Acceptance Criteria

### Checkpoint

- [x] **AC1:** Após cada stage completado, `.checkpoint.json` é atualizado no output dir
- [x] **AC2:** Estrutura do checkpoint:
  ```json
  {
    "pipeline_version": "1.0.0",
    "source": "/absolute/path/to/input.pdf",
    "started_at": "ISO-8601",
    "current_stage": 4,
    "completed_stages": [1, 2, 3],
    "stage_results": {
      "1": { "status": "completed", "duration_ms": 230, "output_path": "intake/manifest.json" },
      "2": { "status": "completed", "duration_ms": 1500, "output_path": "profiles/" },
      "3": { "status": "completed", "duration_ms": 50, "output_path": "routes/" }
    },
    "checksum": "sha256..."
  }
  ```
- [x] **AC3:** Escrita atômica — escreve em `.checkpoint.tmp`, depois `fs.renameSync()` para `.checkpoint.json`
- [x] **AC4:** Checksum é SHA-256 do JSON sem o campo `checksum` (self-validating)

### Resume

- [x] **AC5:** Com `--resume`, carrega `.checkpoint.json` do output dir
- [x] **AC6:** Valida checksum antes de usar — se inválido, warning + recomeça do zero
- [x] **AC7:** Pula stages que estão em `completed_stages`
- [x] **AC8:** Retoma do `current_stage` em diante
- [x] **AC9:** Resultado final é idêntico a uma execução sem interrupção (AC3 do PRD)

### Graceful Shutdown

- [x] **AC10:** Handlers para SIGINT e SIGTERM setam flag `isShuttingDown = true`
- [x] **AC11:** Antes de cada stage, verifica flag. Se true, salva checkpoint e `process.exit(0)`
- [x] **AC12:** Após SIGINT, `--resume` retoma corretamente (AC5 do PRD)

## Notas Técnicas

- O checksum usa `crypto.createHash('sha256')` — já disponível em Node.js built-in
- `fs.renameSync()` é atômico em POSIX (macOS) quando source e dest estão no mesmo filesystem
- Stage results devem incluir paths relativos ao output dir (não absolutos) para portabilidade
- Para resume, os dados intermediários ficam no disco (cada script já salva JSON via save*()) — o pipeline só precisa recarregá-los

## Definição de Pronto

- [x] Checkpoint gerado após cada stage
- [x] Resume funciona após interrupção simulada
- [x] Checkpoint corrupto (editar manualmente) é detectado e descartado
- [x] Ctrl+C durante processamento gera checkpoint válido

## Arquivos Criados/Modificados

- **MODIFICADO:** `squads/autosplit/scripts/autosplit-pipeline.js`

---
