# Story MVP-1.7: Persistir e Recarregar classifications[] (BUG-2)

**Epic:** AutoSplit MVP Cirúrgico
**Status:** Ready for Review
**Estimativa:** 25min
**Assignee:** @dev (Dex)
**PRD Ref:** PRD-MVP-CIRURGICO.md §4.2 (Checkpointing), AC3 (Resume), AC6 (Report)
**Depende de:** MVP-1.6
**Severidade:** HIGH — bloqueia `--resume` em produção

---

## Contexto do Bug

Identificado no code review por @qa (Quinn) em 2026-02-16.

O array `classifications[]` é populado no Stage 2 (linha 427) mas **nunca é persistido em disco**. Na função `reloadStageData()` (case 2, linhas 274-279), apenas `profiles` é recarregado — `classifications` fica como `[]` (inicializado na linha 352). No report (linha 619), `classifications[0].primary_type` resulta em `'unknown'` porque o array está vazio.

**Impacto:** Após resume, o `pipeline-report.json` mostra `"classification": "unknown"` em vez do tipo real do documento, quebrando AC6 (report completo e correto).

## Objetivo

Persistir `classifications[]` em disco durante Stage 2 e recarregá-lo corretamente no resume, garantindo que o report final sempre contenha a classificação real.

## Acceptance Criteria

- [x] **AC1: Persistência de classifications** — Durante Stage 2, cada classificação é salva em disco como `{outputDir}/profiles/{nome}-classification.json` após o `classifications.push()` (linha 427). Formato JSON:
  ```json
  {
    "file": "documento.pdf",
    "primary_type": "execucao_fiscal",
    "confidence": 0.92,
    "secondary_types": [...]
  }
  ```

- [x] **AC2: Reload de classifications** — `reloadStageData()` case 2 (linhas 274-279) recarrega tanto `profiles` quanto `classifications`:
  ```javascript
  case 2: {
    const profilesDir = path.join(outputDir, 'profiles');
    const profileFiles = fs.readdirSync(profilesDir).filter(f => f.endsWith('-profile.json')).sort();
    const profiles = profileFiles.map(f => JSON.parse(fs.readFileSync(path.join(profilesDir, f), 'utf8')));
    const classificationFiles = fs.readdirSync(profilesDir).filter(f => f.endsWith('-classification.json')).sort();
    const classifications = classificationFiles.map(f => JSON.parse(fs.readFileSync(path.join(profilesDir, f), 'utf8')));
    log.verbose(`Reloaded ${profiles.length} profiles, ${classifications.length} classifications`);
    return { profiles, classifications };
  }
  ```

- [x] **AC3: Resume atribui classifications** — Na lógica de resume (linha 362), adicionar a atribuição de `classifications`:
  ```javascript
  if (stageId === 2 && data) {
    profiles = data.profiles;
    classifications = data.classifications;
  }
  ```

- [ ] **AC4: Report correto pós-resume** — Após resume, `pipeline-report.json` contém `"classification": "<tipo_real>"` (nunca `"unknown"` quando classifications existem).

- [x] **AC5: Zero modificação nos 6 scripts existentes** — Apenas `autosplit-pipeline.js` é modificado.

## Notas Técnicas

### Mudança 1 — Persistir (dentro do loop do Stage 2, após linha 427)

```javascript
// Após a linha 427: classifications.push({ file: file.name, ...classification });
const classificationPath = path.join(outputDir, 'profiles', `${path.basename(file.name, path.extname(file.name))}-classification.json`);
fs.writeFileSync(classificationPath, JSON.stringify({ file: file.name, ...classification }, null, 2));
```

**Decisão:** Salvar na mesma pasta `profiles/` porque a classificação é gerada no mesmo stage e é semanticamente ligada ao profile. Evita criar pasta nova.

### Mudança 2 — Recarregar (reloadStageData case 2, linhas 274-279)

Substituir o case 2 inteiro conforme AC2. Nota: o `.sort()` já incorpora o fix de MVP-1.6.

### Mudança 3 — Atribuir no resume (linha 362)

Expandir a condicional:
```javascript
// ANTES:
if (stageId === 2 && data) profiles = data.profiles;

// DEPOIS:
if (stageId === 2 && data) { profiles = data.profiles; classifications = data.classifications || []; }
```

### Convenção de nomes

| Arquivo | Pattern | Exemplo |
|---------|---------|---------|
| Profile | `{nome}-profile.json` | `processo-profile.json` |
| Classification | `{nome}-classification.json` | `processo-classification.json` |

O `{nome}` é derivado do `file.name` sem extensão, consistente com o padrão existente de profiles.

### Risco

Baixo — adiciona escrita de 1 arquivo JSON extra por PDF no Stage 2 e leitura condicional no reload. Não altera fluxo de nenhum script existente.

## Definição de Pronto

- [x] Classifications persistidas em `profiles/{nome}-classification.json` durante Stage 2
- [x] `reloadStageData()` case 2 recarrega profiles E classifications
- [x] Resume atribui classifications corretamente
- [ ] Teste: pipeline com `--resume` gera report com classification real (nunca `"unknown"`)
- [x] Zero scripts existentes modificados (apenas `autosplit-pipeline.js`)
- [ ] Code review @qa aprovado

## Arquivos Criados/Modificados

- **MODIFICADO:** `squads/autosplit/scripts/autosplit-pipeline.js` (linhas 274-279, 362, 427+)

---
