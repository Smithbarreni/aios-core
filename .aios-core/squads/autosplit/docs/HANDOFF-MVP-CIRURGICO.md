# Handoff — AutoSplit MVP Cirúrgico

**Data:** 2026-02-16
**De:** Morgan (PM) + Aria (Architect) + River (SM)
**Para:** Dex (Dev)

---

## O que foi feito

1. **PRD criado e aprovado** → `docs/PRD-MVP-CIRURGICO.md`
2. **Revisão arquitetural Aria** → 4 ajustes, todos incorporados nas stories
3. **5 stories criadas** → `docs/stories/MVP-1.*.md`

## O que Dex precisa fazer

Implementar `autosplit-pipeline.js` — orchestrator que chama os 6 scripts existentes via `require()`, zero tokens.

### Ordem de execução

```
MVP-1.1 → MVP-1.2 → MVP-1.3 ─┐
                  └→ MVP-1.4 ─┤→ MVP-1.5
```

### Comando para iniciar

```bash
# Na nova janela Claude Code:
/AIOS:agents:dev

# Depois:
# Ler a story MVP-1.1 e começar implementação
```

## Arquivos-chave

| Arquivo | Caminho |
|---------|---------|
| **PRD** | `~/.aios-core/.aios-core/squads/autosplit/docs/PRD-MVP-CIRURGICO.md` |
| **Stories** | `~/.aios-core/.aios-core/squads/autosplit/docs/stories/MVP-1.*.md` |
| **Scripts (6)** | `~/.aios-core/.aios-core/squads/autosplit/scripts/*.js` |
| **Squad config** | `~/.aios-core/.aios-core/squads/autosplit/squad.yaml` |
| **Pipeline rules** | `~/.claude/projects/-Users-smithbarreni/memory/autosplit-pipeline-rules.md` |

## Resumo técnico para Dex

- **Criar:** `squads/autosplit/scripts/autosplit-pipeline.js` (arquivo único, ~300-400 linhas)
- **Zero deps novas** — apenas require() dos 6 scripts + fs/path/crypto built-in
- **Zero modificação** nos scripts existentes
- **Async main()** — stages 1, 2, 4 são async; 3, 5, 6 são sync
- **Stage 2 hack:** usar `TextExtractor.fastParse()` para obter texto preliminar antes do profiling
- **Checkpoint:** escrita atômica (.tmp → rename), SHA-256 self-validating
- **OCR é placeholder** — MVP funciona apenas em PDFs digitais com text layer

## Decisões já tomadas (não re-discutir)

- Opção A para Stage 2 (fast-parse provisório, não reordenar stages)
- Batch cria subpasta por PDF
- Signal handlers SIGINT/SIGTERM
- Report < 5KB

---
