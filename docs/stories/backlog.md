# Backlog

**Generated:** 2025-12-05T18:00:00.000Z
**Total Items:** 7

---

## 📊 Summary by Type

- 📌 **Follow-up**: 1
- 🔧 **Technical Debt**: 4
- ✨ **Enhancement**: 2

---

## ✨ Enhancement (2 items)

| ID | Type | Title | Priority | Related Story | Effort | Tags | Created By | Sprint |
|----|------|-------|----------|---------------|--------|------|------------|--------|
| 1733400000001 | ✨ Enhancement | Investigação: Recriar expansion-creator alinhado com nova arquitetura AIOS v2.1 | 🟡 Medium | - | 4-8 hours | `investigation`, `expansion-creator`, `architecture`, `refactoring`, `v2.1-alignment` | @po | TBD |
| 1733400000002 | ✨ Enhancement | Investigação: Refatorar expansion-pack hybrid-ops-pedro-valerio com novo framework de Process Mapping | 🟡 Medium | - | 4-8 hours | `investigation`, `expansion-pack`, `hybrid-ops`, `process-mapping`, `pedro-valerio` | @po | **Sprint 5** |

### Escopo da Investigação (ID: 1733400000001)

- [ ] Mapeamento de todos os standards em `.aios-core/docs/standards/`
- [ ] Análise da estrutura de módulos (`core/`, `development/`, etc.)
- [ ] Análise dos loaders existentes
- [ ] Comparação com expansion-creator atual (`expansion-packs/expansion-creator/`)
- [ ] Recomendação de sprint ideal para refatoração
- [ ] Documentar gaps entre arquitetura atual do expansion-creator e nova estrutura AIOS

### Escopo da Investigação (ID: 1733400000002) - 📅 Sprint 5

**Objetivo:** Refatorar `aios-hybrid-ops-pedro-valerio` com base no novo framework de mapeamento de processos.

**Arquivos de Referência (a serem criados/finalizados):**
- `docs/standards/AGNOSTIC-PROCESS-MAPPING-FRAMEWORK.md`
- `docs/standards/DECISION-TREE-GENERATOR-SYSTEM-PROMPT.md`
- `docs/standards/LATTICEWORK-PROCESS-MAPPING.md`

**Checklist de Investigação:**
- [ ] Analisar estrutura atual dos 9 agentes em `aios-hybrid-ops-pedro-valerio/agents/`
- [ ] Mapear dependências com AIOS-Fullstack core
- [ ] Identificar gaps entre agentes atuais e novos standards de process mapping
- [ ] Avaliar compatibilidade com novo AGNOSTIC-PROCESS-MAPPING-FRAMEWORK
- [ ] Propor refatoração do DECISION-TREE-GENERATOR nos agentes relevantes
- [ ] Integrar conceitos do LATTICEWORK-PROCESS-MAPPING
- [ ] Documentar plano de migração com estimativa de esforço
- [ ] Validar alinhamento com `.aios-core/docs/standards/` e `.aios-core/core/docs/`

**Agentes Impactados (9 total):**
1. `process-mapper-pv.md` - Principal candidato para refatoração
2. `process-architect-pv.md` - Alinhamento arquitetural
3. `executor-designer-pv.md` - Decision tree integration
4. `workflow-designer-pv.md` - Latticework patterns
5. `qa-validator-pv.md` - Validation gates
6. `clickup-engineer-pv.md` - Minimal changes expected
7. `agent-creator-pv.md` - Template alignment
8. `documentation-writer-pv.md` - Output format updates
9. `validation-reviewer-pv.md` - Compliance checks

---

## 🔧 Technical Debt (5 items)

| ID | Type | Title | Priority | Related Story | Effort | Tags | Created By |
|----|------|-------|----------|---------------|--------|------|------------|
| 1763298742141 | 🔧 Technical Debt | ~~Add unit tests for decision-log-generator~~ | ✅ Done | [4.1 Task 1](v2.1/sprint-4/story-4.1-technical-debt-cleanup.md) | 2 hours | `testing`, `decision-logging` | @dev |
| 1732891500001 | 🔧 Technical Debt | ~~Core Module Security Hardening~~ | ✅ Done | [4.1 Task 2](v2.1/sprint-4/story-4.1-technical-debt-cleanup.md) | 4 hours | `security`, `core`, `coderabbit` | @qa |
| 1732891500002 | 🔧 Technical Debt | ~~Core Module Code Quality Fixes~~ | ✅ Done | [4.1 Task 3](v2.1/sprint-4/story-4.1-technical-debt-cleanup.md) | 2 hours | `quality`, `core`, `coderabbit` | @qa |
| 1732978800001 | 🔧 Technical Debt | ~~Fix Pre-existing Test Suite Failures~~ | ✅ Done | [4.1 Task 4](v2.1/sprint-4/story-4.1-technical-debt-cleanup.md) | 30 min | `testing`, `technical-debt` | @github-devops |
| 1733427600001 | 🔧 Technical Debt | Fix Flaky CI Tests (migration-backup, environment-configuration) | 🟠 High | - | 2-4 hours | `testing`, `ci`, `flaky-tests`, `infrastructure` | @github-devops | **Sprint 4** |

### 🆕 Flaky CI Tests (ID: 1733427600001)

**Created:** 2025-12-05 | **Source:** PR #26 CI Failures

**Problem:** Two test files cause intermittent CI failures due to file system race conditions:
- `tests/unit/migration-backup.test.js` - Backup creation timing issues
- `packages/installer/tests/integration/environment-configuration.test.js` - Directory cleanup race (`ENOTEMPTY`)

**Impact:** Cross-Platform CLI Tests fail on all 9 platform/node combinations despite code being correct.

**Proposed Fix:**
- [ ] Add proper async cleanup with retry logic
- [ ] Use `fs.rm()` with `{ force: true, maxRetries: 3 }` options
- [ ] Add `beforeAll`/`afterAll` hooks with timeout guards
- [ ] Consider test isolation with unique temp directories per test

**Workaround (current):** Tests pass locally and in isolation; full suite has race conditions.

---

## 📌 Follow-up (1 item) → **Consolidated in [Story 4.1](v2.1/sprint-4/story-4.1-technical-debt-cleanup.md)**

| ID | Type | Title | Priority | Related Story | Effort | Tags | Created By |
|----|------|-------|----------|---------------|--------|------|------------|
| 1732891500003 | 📌 Follow-up | Create TypeScript definitions for Core Module | 🟡 Medium | [4.1 Task 5](v2.1/sprint-4/story-4.1-technical-debt-cleanup.md) | 3 hours | `typescript`, `core`, `dx` | @qa |

### ~~Escopo do Teste de Integração (ID: 1733414400001)~~ ✅ RESOLVED

**Status:** ✅ RESOLVED (2025-12-05)
**Commit:** `398b13cd`

**Validação Completa:**
- [x] Executar `npm run dev:sync` no `tools/quality-dashboard/`
- [x] Verificar que o dashboard carrega métricas de `.aios/data/quality-metrics.json`
- [x] Executar `npm run sync-metrics` para copiar métricas atualizadas
- [x] Verificar que o dashboard exibe as novas métricas sem restart
- [x] Testar auto-refresh (60s) atualiza dados automaticamente
- [x] Documentar qualquer inconsistência encontrada

**Bugs Encontrados e Corrigidos:**
1. `App.jsx`: `useDemoData={true}` estava forçando dados de demonstração
2. `useMetrics.js`: Path relativo `../../.aios/data/` não funcionava no Vite

**Correções Aplicadas:**
- `useDemoData={false}` para usar dados reais
- `dataUrl="/.aios/data/quality-metrics.json"` (path absoluto)

**Resultados:**
| Métrica | Valor | Status |
|---------|-------|--------|
| Layer 1 Pass Rate | 83.3% (36 runs) | ✅ |
| Layer 2 Pass Rate | 100% (18 runs) | ✅ |
| Layer 3 Pass Rate | 100% (6 runs) | ✅ |
| CodeRabbit Findings | 30 (0 critical) | ✅ |
| Quinn Findings | 18 | ✅ |
| Auto-refresh | Working (60s) | ✅ |

---

## 🚀 Epics Ativos

| Epic ID | Epic Name | Stories | Sprint Target | Status |
|---------|-----------|---------|---------------|--------|
| **OSR** | [Open-Source Community Readiness](epic-open-source-readiness/EPIC-OSR-INDEX.md) | 10 stories | Sprint 5-6 | ✅ APPROVED |
| **HCS** | [Health Check System](epic-health-check-system/EPIC-HCS-INDEX.md) | 2 stories | Sprint 7 | 📋 PLANNING |
| **WIS** | [Workflow Intelligence System](epic-workflow-intelligence/EPIC-WIS-INDEX.md) | 8 stories | Sprint 8+ | 📋 PLANNING |

### Epic OSR - Summary (Consolidado 2025-12-05)

**Objetivo:** Preparar AIOS-FULLSTACK (ou novo repo) para release open-source público completo.

**Decisões Estratégicas (PM Session):**
- ✅ Escopo completo (toda estrutura de community)
- ✅ Templates padrão para legal (sem dependência externa)
- ✅ MVP expansion packs (apenas free/community)
- ✅ Investigação: repo separado vs. cleanup
- ✅ Investigação: rebranding Synkra nomenclatura

**Stories Consolidadas (10 Total, ~45h):**

| Sprint 5 - Foundation | Sprint 6 - Community & Release |
|-----------------------|--------------------------------|
| OSR-1: Audit Session (4h) | OSR-6: Processo Features (4h) |
| OSR-2: Repo Investigation (8h) | OSR-7: Public Roadmap (4h) |
| OSR-3: Legal Foundation (6h) | OSR-8: Expansion Pack Guide (4h) |
| OSR-4: GitHub Setup (3h) | OSR-9: Rebranding Synkra (4h) |
| OSR-5: COMMUNITY.md (4h) | OSR-10: Release Checklist (4h) |

📄 **[Ver Epic Completo](epic-open-source-readiness/EPIC-OSR-INDEX.md)**

**Status Atual:** ✅ Todas as 10 stories draftadas pelo @sm

---

### Epic WIS - Summary (Criado 2025-12-05)

**Objetivo:** Sistema inteligente que guia desenvolvedores através dos workflows AIOS, detectando contexto e sugerindo próximos passos.

**Visão:**
- Task universal `*next` que sugere próxima ação
- Workflow Registry editável com padrões validados
- Wave Analysis para detectar paralelização
- Pattern Learning (interno + comunidade opt-in)
- Integração com Agent Lightning (Story 1.10)

**Stories Planejadas (8 Total, ~60h):**

| Sprint 8 - MVP | Sprint 9-10 - Learning |
|----------------|------------------------|
| WIS-1: Investigation (8h) | WIS-4: Wave Analysis (8h) |
| WIS-2: Workflow Registry (12h) | WIS-5: Pattern Capture (8h) |
| WIS-3: `*next` Task (12h) | WIS-6: Community Opt-in (8h) |

**Future:** WIS-7 (Agent Lightning), WIS-8 (Memory Layer)

**Dependências:**
- Depende de: Epic OSR (para community features)
- Conecta com: Story 1.10 (Agent Lightning)

📄 **[Ver Epic Completo](epic-workflow-intelligence/EPIC-WIS-INDEX.md)**

**Status:** Investigation story (WIS-1) pronto para execução no Sprint 8

---

### Epic HCS - Summary (Criado 2025-12-05)

**Objetivo:** Sistema de diagnóstico completo que analisa a saúde do projeto AIOS em todas as camadas, identifica problemas, sugere correções de technical debt e realiza auto-healing.

**Problema Resolvido:**
- Usuários "vibe coding" podem quebrar configurações
- Dificuldade em diagnosticar problemas complexos
- Technical debt acumula sem visibilidade
- Inconsistências entre ambientes passam despercebidas

**Funcionalidades:**
- Task `*health-check` executável pelo @devops
- 5 domínios de verificação: Project, Local, Repo, Deploy, Services
- Self-healing com 3 tiers (silencioso, confirmação, manual)
- Relatório markdown + Dashboard visual (reutiliza Story 3.11)
- Score de saúde 0-100 por domínio e geral

**Stories Planejadas (2 Total, ~24h):**

| Sprint 7 |
|----------|
| HCS-1: Investigation & Best Practices (8h) |
| HCS-2: Implementation (16h) |

**Dependências:**
- Depende de: Epic OSR (para validar estrutura pública)
- Conecta com: Story 3.11 (Quality Gates Dashboard)
- Complementa: `*bootstrap-setup` task

📄 **[Ver Epic Completo](epic-health-check-system/EPIC-HCS-INDEX.md)**

**Status:** Ready for Sprint 7 (após OSR)

---

## 🔍 Legend

### Types
- 📌 **Follow-up** (F)
- 🔧 **Technical Debt** (T)
- ✨ **Enhancement** (E)

### Priority
- 🔴 **Critical**
- 🟠 **High**
- 🟡 **Medium**
- 🟢 **Low**

---

*Auto-generated by AIOS Backlog Manager (Story 6.1.2.6)*
*Update: Run `.aios-core/utils/backlog-manager.js`*
