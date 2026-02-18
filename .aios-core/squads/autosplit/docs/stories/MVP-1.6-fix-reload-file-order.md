# Story MVP-1.6: Fix reloadStageData() File Order (BUG-1)

**Epic:** AutoSplit MVP Cirúrgico
**Status:** Ready for Review
**Estimativa:** 20min
**Assignee:** @dev (Dex)
**PRD Ref:** PRD-MVP-CIRURGICO.md §4.2 (Checkpointing), AC3 (Resume)
**Depende de:** MVP-1.5
**Severidade:** HIGH — bloqueia `--resume` em produção

---

## Contexto do Bug

Identificado no code review por @qa (Quinn) em 2026-02-16.

`reloadStageData()` (linhas 264-308) usa `fs.readdirSync()` em 5 pontos **sem ordenação**. O `readdirSync()` do Node.js retorna arquivos na ordem do filesystem, que **não é garantida** como alfabética ou por data de criação. Em resume, os arrays `profiles`, `routeDecisions`, `extractedDataList` e `allSegments` podem ficar em ordem diferente da execução original, causando desalinhamento entre dados que pertencem a arquivos diferentes.

**Impacto:** Em cenários multi-arquivo, o profile do arquivo A pode ser associado à rota do arquivo B, gerando resultados silenciosamente incorretos.

## Objetivo

Garantir que `reloadStageData()` retorna os dados na mesma ordem determinística em qualquer execução, independentemente da ordem retornada pelo filesystem.

## Acceptance Criteria

- [x] **AC1: Ordenação determinística** — Todas as 5 chamadas a `fs.readdirSync()` dentro de `reloadStageData()` devem ser seguidas por `.sort()` antes de qualquer `.map()` ou acesso por índice:
  - Linha 268: `manifestFiles` (case 1)
  - Linha 276: `profileFiles` (case 2)
  - Linha 283: `routeFiles` (case 3)
  - Linha 290: `extractedFiles` (case 4)
  - Linha 297: `segmentFiles` (case 5)

- [x] **AC2: Consistência com execução original** — A ordem dos arrays após reload deve corresponder à ordem dos nomes dos arquivos fonte (ordem alfabética por filename). Verificar que a convenção de nomeação dos arquivos de output (e.g., `{nome}-profile.json`) preserva a correspondência.

- [ ] **AC3: Teste de resume com ordem diferente** — Executar pipeline, renomear temporariamente um arquivo de output para alterar a ordem de listagem do OS, fazer resume, e verificar que os arrays são idênticos ao resultado sem rename.

- [x] **AC4: Zero modificação nos 6 scripts existentes** — Apenas `autosplit-pipeline.js` é modificado.

## Notas Técnicas

### Localização exata do fix

```javascript
// ANTES (linha 276 como exemplo):
const profileFiles = fs.readdirSync(profilesDir).filter(f => f.endsWith('-profile.json'));

// DEPOIS:
const profileFiles = fs.readdirSync(profilesDir).filter(f => f.endsWith('-profile.json')).sort();
```

Aplicar o mesmo padrão `.sort()` nas 5 ocorrências:
- `case 1` (linha 268): `.filter(f => f.startsWith('manifest-')).sort()`
- `case 2` (linha 276): `.filter(f => f.endsWith('-profile.json')).sort()`
- `case 3` (linha 283): `.filter(f => f.endsWith('-route.json')).sort()`
- `case 4` (linha 290): `.filter(f => f.endsWith('-extracted.json')).sort()`
- `case 5` (linha 297): `.filter(f => f.endsWith('-segments.json')).sort()`

### Por que `.sort()` simples basta

Os nomes dos arquivos seguem o padrão `{nome-do-pdf}-{sufixo}.json`. O `String.sort()` do JS compara por codepoint (alphabetical), que é suficiente para garantir determinismo. Se os arquivos vieram do mesmo `manifest.files`, a ordem alfabética será consistente entre runs.

### Risco

Baixíssimo — adicionar `.sort()` a um array que já poderia estar ordenado não tem efeito colateral. A mudança é de 5 caracteres por linha.

## Definição de Pronto

- [x] `.sort()` adicionado nas 5 chamadas de `readdirSync` dentro de `reloadStageData()`
- [ ] Teste: pipeline executado com `--resume` e output idêntico à execução limpa
- [x] Zero scripts existentes modificados (apenas `autosplit-pipeline.js`)
- [ ] Code review @qa aprovado

## Arquivos Criados/Modificados

- **MODIFICADO:** `squads/autosplit/scripts/autosplit-pipeline.js` (linhas 268, 276, 283, 290, 297)

---
