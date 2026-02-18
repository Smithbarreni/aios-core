/**
 * quality-profiler.js — AutoSplit Squad
 *
 * Document quality analysis: DPI estimation, orientation detection,
 * readability scoring, noise detection, and document type classification.
 *
 * Usage:
 *   node quality-profiler.js --file ./input/doc.pdf
 *   node quality-profiler.js --manifest ./output/intake/manifest.json
 *
 * Dependencies: pdf-parse, sharp (optional for image analysis)
 */

const fs = require('fs');
const path = require('path');

// ~1500 common Portuguese words for dictionary-based garbage detection (Signal 7)
const PT_COMMON_WORDS = new Set([
  // Articles, prepositions, conjunctions, pronouns (~120)
  'de','da','do','dos','das','que','para','com','por','em','no','na','nos','nas',
  'se','ao','ou','um','uma','os','as','sua','seu','como','mais','foi','não','nao',
  'ser','são','sao','este','esta','essa','esse','entre','sobre','pela','pelo',
  'pelas','pelos','também','tambem','quando','ainda','mesmo','já','ja','pode',
  'deve','outro','outra','outros','outras','qual','quais','todo','toda','todos',
  'todas','cada','muito','muita','muitos','muitas','onde','aqui','isso','isto',
  'aquele','aquela','aqueles','aquelas','nesse','nessa','nesses','nessas','dele',
  'dela','deles','delas','nele','nela','neles','nelas','meu','minha','meus',
  'minhas','teu','tua','teus','tuas','nosso','nossa','nossos','nossas','seus',
  'suas','lhe','lhes','nós','nos','vós','vos','eles','elas','ele','ela','você',
  'voce','quem','algo','alguém','alguem','ninguém','ninguem','nada','tudo',
  'apenas','porém','porem','contudo','entretanto','portanto','assim','então',
  'entao','porque','pois','embora','enquanto','caso','desde','até','ate',
  'durante','após','apos','antes','depois','sem','sob','contra','segundo',
  'conforme','mediante','perante','através','atraves','além','alem','aquém',
  // Common verbs and conjugations (~300)
  'ter','tem','teve','tinha','tendo','tido','tenho','temos','tinham','terá',
  'tera','terão','terao','teria','teriam','tiver','tivesse','tivessem',
  'ser','era','eram','sido','sendo','será','sera','serão','serao','seria',
  'seriam','fosse','fossem','forem','sou','somos',
  'estar','está','esta','estão','estao','estava','estavam','esteve','estiver',
  'estivesse','estando','estará','estara',
  'haver','houve','havia','haviam','haverá','havera','havendo','haja','hajam',
  'fazer','faz','fez','feito','fazendo','fazia','faziam','fará','fara','fizesse',
  'poder','pode','pôde','podem','podia','podiam','poderá','podera','podendo',
  'pudesse','pudessem',
  'dever','deve','devem','devia','deviam','deverá','devera','devendo','devida',
  'devidas','devido','devidos','devidamente',
  'dizer','diz','disse','dizem','dizia','dito','dizendo','dirá',
  'dar','deu','dado','dando','dava','davam','dará','dara','dão',
  'ver','viu','visto','vendo','via','viam','verá','vera','veja','vejam',
  'vir','veio','vindo','vinha','vinham','virá','vira','venha','venham',
  'saber','sabe','sabem','soube','sabia','sabiam','saberá','sabendo',
  'querer','quer','querem','quis','queria','queriam','querendo',
  'ficar','fica','ficam','ficou','ficava','ficando','ficará',
  'deixar','deixa','deixou','deixando','deixar',
  'passar','passa','passou','passando','passará',
  'seguir','segue','seguem','seguiu','seguindo','seguinte',
  'levar','leva','levou','levando','levará',
  'encontrar','encontra','encontrou','encontrado','encontrando',
  'chamar','chama','chamou','chamado','chamada',
  'chegar','chega','chegou','chegando','chegará',
  'apresentar','apresenta','apresentou','apresentado','apresentando',
  'considerar','considera','considerou','considerado','considerando',
  'constituir','constitui','constituído','constituem','constituição',
  'determinar','determina','determinou','determinado','determinação',
  'dispor','dispõe','disposto','disposição','disposições',
  'estabelecer','estabelece','estabeleceu','estabelecido','estabelecimento',
  'existir','existe','existem','existiu','existência',
  'indicar','indica','indicou','indicado','indicação',
  'manter','mantém','mantem','manteve','mantido','manutenção',
  'mostrar','mostra','mostrou','mostrado','mostrando',
  'ocorrer','ocorre','ocorreu','ocorrido','ocorrência',
  'parecer','parece','parecem','pareceu','parecendo',
  'pedir','pede','pedem','pediu','pedido','pedindo',
  'permitir','permite','permitiu','permitido','permitindo',
  'precisar','precisa','precisam','precisou','precisando',
  'produzir','produz','produziu','produzido','produção',
  'realizar','realiza','realizou','realizado','realização',
  'receber','recebe','recebeu','recebido','recebendo',
  'reconhecer','reconhece','reconheceu','reconhecido','reconhecimento',
  'referir','refere','referiu','referido','referência','referente',
  'representar','representa','representou','representado','representação',
  'resultar','resulta','resultou','resultado','resultados',
  'tratar','trata','tratou','tratado','tratando',
  'utilizar','utiliza','utilizou','utilizado','utilização',
  'verificar','verifica','verificou','verificado','verificação',
  'aplicar','aplica','aplicou','aplicado','aplicação','aplicável',
  'caber','cabe','cabem','coube','cabendo','cabível',
  'cumprir','cumpre','cumpriu','cumprido','cumprimento',
  'decidir','decide','decidiu','decidido','decisão',
  'declarar','declara','declarou','declarado','declaração',
  'negar','nega','negou','negado','negando',
  'observar','observa','observou','observado','observação',
  'prevalecer','prevalece','prevaleceu','prevalecendo',
  'prever','prevê','preve','previu','previsto','previsão',
  'provar','prova','provou','provado','provando',
  'requerer','requer','requereu','requerido','requerimento','requerente',
  'resolver','resolve','resolveu','resolvido','resolução',
  'restar','resta','restou','restando',
  'violar','viola','violou','violado','violação',
  'alegar','alega','alegou','alegado','alegação','alegações',
  'analisar','analisa','analisou','analisado','análise',
  'assinar','assina','assinou','assinado','assinatura',
  'julgar','julga','julgou','julgado','julgamento','julgando',
  'publicar','publica','publicou','publicado','publicação',
  'constar','consta','constou','constando','constante',
  // Common nouns, adjectives, administrative (~500)
  'ano','anos','dia','dias','vez','vezes','parte','partes','forma','formas',
  'caso','casos','tempo','tempos','modo','modos','tipo','tipos','grupo',
  'ponto','pontos','lado','lados','lugar','lugares','pessoa','pessoas',
  'vida','vidas','coisa','coisas','exemplo','fato','fatos','razão','fim',
  'nome','nomes','número','numero','números','numeros','estado','país','pais',
  'mundo','cidade','empresa','empresas','governo','sistema','área','area',
  'problema','questão','questao','trabalho','serviço','servico','informação',
  'informacao','direito','direitos','lei','leis','artigo','artigos',
  'parágrafo','paragrafo','inciso','incisos','alínea','alinea',
  'processo','processos','ação','acao','ações','acoes','pedido','pedidos',
  'prazo','prazos','termo','termos','documento','documentos','prova','provas',
  'valor','valores','pagamento','pagamentos','crédito','credito','débito',
  'conta','contas','total','parcela','parcelas','multa','multas',
  'imposto','impostos','tributo','tributos','contribuição','contribuição',
  'base','cálculo','calculo','alíquota','aliquota','período','periodo',
  'exercício','exercicio','ano','mês','mes','data','datas',
  'tribunal','tribunais','juiz','juízo','juizo','vara','turma','câmara',
  'camara','seção','secao','plenário','plenario','relator','relatora',
  'ministro','ministra','desembargador','desembargadora','juíza',
  'recurso','recursos','apelação','apelacao','agravo','agravos','embargo',
  'embargos','mandado','mandados','sentença','sentenca','acórdão','acordao',
  'decisão','decisao','despacho','despachos','intimação','intimacao',
  'citação','citacao','notificação','notificacao','certidão','certidao',
  'petição','peticao','contestação','contestacao','réplica','replica',
  'parecer','pareceres','laudo','laudos','perícia','pericia','perito',
  'autor','autora','autores','réu','reu','ré','requerente','requerido',
  'requerida','impetrante','impetrado','apelante','apelado','agravante',
  'agravado','recorrente','recorrido','recorrida','embargante','embargado',
  'exequente','executado','executada','devedor','credor','credora',
  'advogado','advogada','advogados','procurador','procuradora','procuração',
  'procuracao','substabelecimento','outorga','poderes','mandato',
  'federal','estadual','municipal','público','publico','pública','publica',
  'nacional','internacional','geral','especial','ordinário','ordinario',
  'extraordinário','extraordinario','constitucional','legal','ilegal',
  'lícito','licito','ilícito','ilicito',
  'ministério','ministerio','secretaria','secretário','secretario',
  'superintendência','superintendencia','superintendente','diretoria',
  'diretor','diretora','coordenação','coordenador','coordenadora',
  'presidente','vice','chefe','gerente','assessor','assessora',
  'procuradoria','advocacia','delegacia','delegado','delegada',
  'receita','fazenda','tesouro','previdência','previdencia',
  'social','saúde','saude','educação','educacao','segurança','seguranca',
  'fiscal','tributário','tributario','tributária','tributaria',
  'administrativo','administrativa','civil','penal','criminal',
  'trabalhista','previdenciário','previdenciario','ambiental','eleitoral',
  'comercial','empresarial','societário','societario','contratual',
  'constitutivo','constitutiva','incentivo','incentivos','benefício',
  'beneficio','isenção','isencao','redução','reducao',
  'ofício','oficio','memorando','portaria','resolução','resolucao',
  'decreto','regulamento','instrução','instrucao','normativa',
  'circular','edital','aviso','comunicado','comunicação','comunicacao',
  'relatório','relatorio','ata','registro','registros','cadastro',
  'certidão','certidao','atestado','alvará','alvara','licença','licenca',
  'contrato','contratos','convênio','convenio','acordo','acordos',
  'cláusula','clausula','cláusulas','condição','condicao','condições',
  'obrigação','obrigacao','obrigações','responsabilidade','responsável',
  'responsavel','competência','competencia','competente','jurisdição',
  'jurisdicao','comarca','foro','auditoria','inspeção','inspecao',
  'investigação','investigacao','inquérito','inquerito','sindicância',
  'sindicancia','diligência','diligencia',
  // General frequent words (~300)
  'grande','grandes','pequeno','pequena','novo','nova','novos','novas',
  'primeiro','primeira','segundo','segunda','terceiro','terceira','último',
  'ultimo','última','ultima','próximo','proximo','próxima','anterior',
  'atual','presente','real','possível','possivel','necessário','necessario',
  'importante','principal','diferentes','diferente','igual','igual',
  'melhor','pior','maior','menor','alto','alta','baixo','baixa',
  'longo','longa','curto','curta','bom','boa','mau','ruim',
  'certo','certa','errado','errada','verdadeiro','verdadeira',
  'falso','falsa','próprio','proprio','própria','comum','comum',
  'simples','final','inicial','central','local','regional',
  'interno','interna','externo','externa','superior','inferior',
  'máximo','maximo','mínimo','minimo','médio','medio','total',
  'parcial','integral','completo','completa','pleno','plena',
  'adequado','adequada','devido','devida','previsto','prevista',
  'expressamente','devidamente','anteriormente','posteriormente',
  'respectivamente','imediatamente','diretamente','indiretamente',
  'inclusive','exclusivamente','especialmente','principalmente',
  'apenas','somente','simplesmente','certamente','claramente',
  'evidentemente','obviamente','naturalmente','efetivamente',
  'realmente','atualmente','normalmente','geralmente','usualmente',
  'frequentemente','raramente','eventualmente','oportunamente',
  'tempestivamente','intempestivamente',
  'situação','situacao','condição','condicao','relação','relacao',
  'referência','referencia','consequência','consequencia','decorrência',
  'existência','existencia','ausência','ausencia','presença','presenca',
  'ocorrência','ocorrencia','providência','providencia','procedência',
  'procedencia','improcedência','improcedencia','competência','competencia',
  'urgência','urgencia','relevância','relevancia','importância','importancia',
  'necessidade','possibilidade','impossibilidade','capacidade','incapacidade',
  'responsabilidade','legitimidade','legalidade','ilegalidade','validade',
  'nulidade','eficácia','eficacia',
  'conforme','inclusive','exclusive','mediante','perante','consoante',
  'outrossim','destarte','dessarte','ademais','demais','aliás','alias',
  'todavia','conquanto','porquanto','mormente','sobretudo','precipuamente',
  'consubstanciar','consubstanciado','consubstanciada',
  'requerer','pleitear','postular','pugnar','vindicar','impugnar',
  'recorrer','apelar','embargar','agravar','interpor',
  'indeferir','deferir','julgar','decidir','determinar','ordenar',
  'intimação','citação','notificação','publicação','distribuição',
  'procedimento','procedimentos','expediente','diligência',
  'protocolo','autuação','juntada','certidão','traslado','cópia',
  'original','via','autos','folha','folhas','página','pagina',
  'volume','volumes','anexo','anexos','apenso','apensos',
  'art','arts','inc','par','caput','alínea',
  // SUDENE/ADENE/Fiscal specific
  'sudene','adene','sudam','suframa','laudo','laudos',
  'constitutivo','constitutiva','constitutivos',
  'imposto','renda','irpj','csll','pis','cofins','icms','iss',
  'lucro','receita','despesa','custo','custos',
  'contribuinte','fisco','autuação','auto','infração','infracao',
  'penalidade','sanção','sancao','débito','debito',
  'lançamento','lancamento','compensação','compensacao',
  'restituição','restituicao','creditamento',
  'certidão','cda','dívida','divida','ativa','execução','execucao',
  'embargos','impugnação','impugnacao','exceção','excecao',
  'preliminar','mérito','merito','procedente','improcedente',
  'provimento','improvimento','desprovimento','provido','desprovido',
  'celulose','papel','suzano','fibria','produção','producao',
  'industrial','indústria','industria','fábrica','fabrica',
  'exportação','exportacao','importação','importacao','comércio','comercio',
]);

class QualityProfiler {
  constructor(options = {}) {
    this.outputDir = options.outputDir || './output/profiles';
  }

  /**
   * Estimate DPI from PDF page dimensions and embedded image resolution
   */
  estimateDPI(pageWidth, pageHeight, imageWidth, imageHeight) {
    if (!imageWidth || !imageHeight) return null;
    const dpiX = (imageWidth / pageWidth) * 72;
    const dpiY = (imageHeight / pageHeight) * 72;
    return Math.round((dpiX + dpiY) / 2);
  }

  /**
   * Detect page orientation
   */
  detectOrientation(pageWidth, pageHeight, textAngle) {
    if (textAngle && Math.abs(textAngle - 180) < 10) return 'upside-down';
    if (textAngle && Math.abs(textAngle - 90) < 10) return 'rotated-90';
    if (textAngle && Math.abs(textAngle - 270) < 10) return 'rotated-270';
    return 'normal';
  }

  /**
   * Calculate readability score (0-100)
   * Based on text density, character distribution, word length
   */
  calculateReadability(text, pageCount) {
    if (!text || text.trim().length === 0) return 0;

    const charCount = text.length;
    const wordCount = text.split(/\s+/).filter(Boolean).length;
    const avgWordLength = charCount / Math.max(wordCount, 1);
    const charsPerPage = charCount / Math.max(pageCount, 1);

    // Heuristic scoring
    let score = 0;

    // Text density (chars per page)
    if (charsPerPage > 1500) score += 30;
    else if (charsPerPage > 800) score += 20;
    else if (charsPerPage > 300) score += 10;
    else score += 5;

    // Word quality (average word length 3-8 is healthy)
    if (avgWordLength >= 3 && avgWordLength <= 8) score += 25;
    else if (avgWordLength >= 2 && avgWordLength <= 12) score += 15;
    else score += 5;

    // Unicode ratio (high garbage chars = low quality)
    const asciiRatio = (text.replace(/[^\x20-\x7E\u00C0-\u024F]/g, '').length) / charCount;
    score += Math.round(asciiRatio * 30);

    // Line structure (proper line breaks)
    const lines = text.split('\n').filter(l => l.trim().length > 0);
    const avgLineLength = charCount / Math.max(lines.length, 1);
    if (avgLineLength > 30 && avgLineLength < 120) score += 15;
    else if (avgLineLength > 10) score += 8;

    return Math.min(100, score);
  }

  /**
   * Detect noise level in text (garbage characters, OCR artifacts)
   */
  detectNoiseLevel(text) {
    if (!text) return 'high';
    const garbagePattern = /[^\w\s\u00C0-\u024F.,;:!?()[\]{}"'\-\/\\@#$%&*+=<>|~`^]/g;
    const charGarbageRatio = (text.match(garbagePattern) || []).length / Math.max(text.length, 1);

    // Word-level garbage detection (catches OCR artifacts that use valid chars)
    const wordGarbageScore = this.detectWordLevelGarbage(text);

    // Combine char-level and word-level signals
    if (charGarbageRatio >= 0.08 || wordGarbageScore >= 0.5) return 'high';
    if (charGarbageRatio >= 0.02 || wordGarbageScore >= 0.3) return 'medium';
    return 'low';
  }

  /**
   * Strip PJe system footer from page text before quality analysis.
   * PJe adds standardized digital signature text at the bottom of every page,
   * even scanned ones. This dilutes garbage detection.
   */
  stripPJeFooter(text) {
    if (!text) return text;
    // Common PJe footer patterns
    const footerPatterns = [
      /Este documento foi gerado pelo usu[áa]rio[\s\S]*/i,
      /N[úu]mero do documento:[\s\S]*/i,
      /Assinado eletronicamente por:[\s\S]*/i,
      /https?:\/\/pje\d?g?\.[\s\S]*/i,
      /Num\.\s*\d+\s*-\s*P[áa]g\.\s*\d+[\s\S]*/i,
    ];
    let cleaned = text;
    for (const pattern of footerPatterns) {
      const match = cleaned.match(pattern);
      if (match && match.index !== undefined) {
        // Only strip if footer is in the last 40% of the text
        if (match.index > cleaned.length * 0.6) {
          cleaned = cleaned.slice(0, match.index).trim();
        }
      }
    }
    return cleaned;
  }

  /**
   * Detect OCR garbage at word level — catches garbled text that uses valid characters.
   * Returns score 0-1 (higher = more garbage).
   */
  detectWordLevelGarbage(text) {
    if (!text || text.trim().length < 30) return 0;

    // Strip PJe footer before analysis — it adds legit words to garbage pages
    const cleanText = this.stripPJeFooter(text);

    const words = cleanText.split(/\s+/).filter(w => w.length > 0);
    if (words.length < 5) return 0;

    let signals = 0;
    let totalSignals = 0;

    // Signal 1: Short fragment ratio — >35% of words are 1-2 chars
    const shortWords = words.filter(w => w.replace(/[^a-zA-Z\u00C0-\u024F0-9]/g, '').length <= 2);
    const shortRatio = shortWords.length / words.length;
    if (shortRatio > 0.45) signals += 2;
    else if (shortRatio > 0.30) signals += 1;
    totalSignals += 2;

    // Signal 2: Punctuation-as-word ratio — words that are mostly non-alphanumeric
    const punctWords = words.filter(w => {
      const alpha = w.replace(/[^a-zA-Z\u00C0-\u024F0-9]/g, '');
      return alpha.length < w.length * 0.4 && w.length > 1;
    });
    const punctRatio = punctWords.length / words.length;
    if (punctRatio > 0.15) signals += 2;
    else if (punctRatio > 0.08) signals += 1;
    totalSignals += 2;

    // Signal 3: Tilde/garbage operator ratio in text
    const tildeCount = (cleanText.match(/[~*§¬¨£¢¡¿]/g) || []).length;
    const tildeRatio = tildeCount / cleanText.length;
    if (tildeRatio > 0.02) signals += 1;
    totalSignals += 1;

    // Signal 4: Low ratio of common Portuguese words
    const commonWords = new Set([
      'de', 'da', 'do', 'dos', 'das', 'que', 'para', 'com', 'por', 'em',
      'no', 'na', 'nos', 'nas', 'se', 'ao', 'ou', 'um', 'uma', 'os', 'as',
      'sua', 'seu', 'como', 'mais', 'foi', 'não', 'nao', 'ser', 'são', 'sao',
      'este', 'esta', 'essa', 'esse', 'entre', 'sobre', 'pela', 'pelo',
      'art', 'lei', 'processo', 'valor', 'data', 'fiscal', 'federal',
    ]);
    const lowerWords = words.map(w => w.toLowerCase().replace(/[^a-záàâãéèêíïóôõúüç]/g, ''));
    const commonCount = lowerWords.filter(w => commonWords.has(w)).length;
    const commonRatio = commonCount / words.length;
    if (commonRatio < 0.05) signals += 2;
    else if (commonRatio < 0.10) signals += 1;
    totalSignals += 2;

    // Signal 5: Broken word patterns — consecutive consonants or random uppercase
    const brokenWords = words.filter(w => {
      const clean = w.replace(/[^a-zA-Z]/g, '');
      if (clean.length < 3) return false;
      // 4+ consecutive consonants (unusual in Portuguese)
      if (/[bcdfghjklmnpqrstvwxyz]{4,}/i.test(clean)) return true;
      // Random mid-word uppercase (like "FIORIACELULOSSS" or "C~sponsavel")
      if (/[a-z][A-Z][a-z]/.test(clean)) return true;
      return false;
    });
    const brokenRatio = brokenWords.length / Math.max(words.filter(w => w.length >= 3).length, 1);
    if (brokenRatio > 0.15) signals += 2;
    else if (brokenRatio > 0.08) signals += 1;
    totalSignals += 2;

    // Signal 6: Encoding corruption — tilde/dash/equals inside words, digits mixed with letters,
    // unexpected mid-word case changes. Catches garbled PDF text encoding like "staRvIço", "D~vol", "CONSTTI=0".
    const encodingCorruptWords = words.filter(w => {
      const clean = w.replace(/[^a-zA-Z\u00C0-\u024F0-9~\-=]/g, '');
      if (clean.length < 3) return false;
      // Tilde/dash/equals INSIDE word (between alphanumeric chars)
      if (/[a-záéíóúàâêôãõç0-9][~\-=][a-záéíóúàâêôãõç0-9]/i.test(clean)) return true;
      // Digits mixed with letters
      if (/[a-z]\d[a-z]|\d[a-z]\d/i.test(clean)) return true;
      // Case change mid-word (lowercase-uppercase-lowercase after position 1)
      if (/[a-z][A-Z][a-z]/.test(clean)) return true;
      return false;
    });
    const encodingCorruptRatio = encodingCorruptWords.length / words.length;
    if (encodingCorruptRatio > 0.10) signals += 2;
    else if (encodingCorruptRatio > 0.05) signals += 1;
    totalSignals += 2;

    // Signal 7: Dictionary miss rate — words not found in PT_COMMON_WORDS
    const longWords = lowerWords.filter(w => w.replace(/[^a-záàâãéèêíïóôõúüç]/g, '').length >= 4);
    if (longWords.length >= 10) {
      const missCount = longWords.filter(w => !PT_COMMON_WORDS.has(w)).length;
      const missRate = missCount / longWords.length;
      if (missRate > 0.70) signals += 2;
      else if (missRate > 0.55) signals += 1;
    }
    totalSignals += 2;

    return signals / totalSignals;
  }

  /**
   * Determine quality tier from readability score
   */
  getQualityTier(readabilityScore) {
    if (readabilityScore >= 80) return 'A';
    if (readabilityScore >= 60) return 'B';
    if (readabilityScore >= 40) return 'C';
    if (readabilityScore >= 20) return 'D';
    return 'F';
  }

  /**
   * Profile a single document
   */
  async profileDocument(filePath, extractedText, pageCount) {
    const readability = this.calculateReadability(extractedText, pageCount);
    const noise = this.detectNoiseLevel(extractedText);
    const tier = this.getQualityTier(readability);
    const hasTextLayer = extractedText && extractedText.trim().length > 100;

    return {
      file: path.basename(filePath),
      file_path: path.resolve(filePath),
      page_count: pageCount,
      has_text_layer: hasTextLayer,
      dpi_estimate: null, // Requires image extraction
      orientation: 'normal', // Requires image analysis
      readability_score: readability,
      quality_tier: tier,
      noise_level: noise,
      skew_detected: false, // Requires image analysis
      profiled_at: new Date().toISOString(),
    };
  }

  /**
   * Profile each page individually.
   * Takes the pages[] array from TextExtractor._splitIntoPages().
   * Returns per-page profiles with readability, noise, tier, and degraded flag.
   */
  profilePages(pages) {
    const profiles = pages.map(page => {
      const text = page.text || '';
      const readability = this.calculateReadability(text, 1);
      const noise = this.detectNoiseLevel(text);
      const wordGarbage = this.detectWordLevelGarbage(text);
      const tier = this.getQualityTier(readability);
      const charCount = text.length;
      // Degraded if: low readability, high noise, word-level garbage, or very little text
      const isDegraded = readability < 60 || noise === 'high' || noise === 'medium' || wordGarbage >= 0.15 || charCount < 50;

      return {
        page_number: page.page_number,
        readability_score: readability,
        noise_level: noise,
        word_garbage_score: Math.round(wordGarbage * 100) / 100,
        quality_tier: tier,
        char_count: charCount,
        is_degraded: isDegraded,
        empty: page.empty || false,
      };
    });

    // Document-level propagation: if ≥50% of non-empty pages are degraded,
    // encoding corruption likely affects the whole document — mark all as degraded
    const nonEmpty = profiles.filter(p => !p.empty);
    const degradedCount = nonEmpty.filter(p => p.is_degraded).length;
    if (nonEmpty.length > 0 && degradedCount > nonEmpty.length * 0.5) {
      for (const p of profiles) {
        if (!p.empty) {
          p.is_degraded = true;
          if (!p.propagated) p.propagated = degradedCount < nonEmpty.length;
        }
      }
    }

    return profiles;
  }

  /**
   * Aggregate per-page profiles into a document-level summary.
   * Uses MEDIAN readability (not mean) so degraded pages aren't hidden.
   */
  aggregatePageProfiles(pageProfiles, filePath) {
    if (pageProfiles.length === 0) {
      return {
        file: path.basename(filePath),
        file_path: path.resolve(filePath),
        page_count: 0,
        readability_score: 0,
        quality_tier: 'F',
        noise_level: 'high',
        has_text_layer: false,
        degraded_pages: [],
        degraded_count: 0,
        clean_count: 0,
        is_mixed_quality: false,
        profiled_at: new Date().toISOString(),
      };
    }

    const scores = pageProfiles.map(p => p.readability_score).sort((a, b) => a - b);
    const median = scores[Math.floor(scores.length / 2)];
    const degradedPages = pageProfiles.filter(p => p.is_degraded);
    const cleanPages = pageProfiles.filter(p => !p.is_degraded && !p.empty);
    const hasTextLayer = cleanPages.length > 0;
    const noiseLevels = pageProfiles.map(p => p.noise_level);
    const worstNoise = noiseLevels.includes('high') ? 'high' : noiseLevels.includes('medium') ? 'medium' : 'low';

    return {
      file: path.basename(filePath),
      file_path: path.resolve(filePath),
      page_count: pageProfiles.length,
      readability_score: median,
      quality_tier: this.getQualityTier(median),
      noise_level: worstNoise,
      has_text_layer: hasTextLayer,
      degraded_pages: degradedPages.map(p => p.page_number),
      degraded_count: degradedPages.length,
      clean_count: cleanPages.length,
      is_mixed_quality: degradedPages.length > 0 && cleanPages.length > 0,
      page_profiles: pageProfiles,
      profiled_at: new Date().toISOString(),
    };
  }

  /**
   * Strip repetitive headers and footers from extracted pages.
   * Detects content lines that appear in >40% of pages (headers/footers)
   * and removes them. Also strips PJe system footers.
   * Returns a new pages array with cleaned text.
   */
  stripRepetitiveContent(pages) {
    if (!pages || pages.length < 3) return pages;

    const threshold = 0.4; // appears in 40%+ of pages
    const headerLineCount = 12; // check first N lines of each page
    const footerLineCount = 8; // check last N lines of each page

    const normalize = (line) =>
      line.replace(/\s+/g, ' ').replace(/[^a-zA-ZÀ-ÿ0-9 ]/g, '').trim().toLowerCase();

    // Build fingerprint frequency maps
    const headerFingerprints = new Map();
    const footerFingerprints = new Map();

    for (const page of pages) {
      if (!page.text || page.empty) continue;
      const lines = page.text.split('\n');

      // Header fingerprints (first N lines)
      const headSlice = lines.slice(0, Math.min(headerLineCount, lines.length));
      const headSeen = new Set();
      for (const line of headSlice) {
        const fp = normalize(line);
        if (fp.length < 5) continue;
        if (headSeen.has(fp)) continue;
        headSeen.add(fp);
        headerFingerprints.set(fp, (headerFingerprints.get(fp) || 0) + 1);
      }

      // Footer fingerprints (last N lines)
      const tailSlice = lines.slice(-Math.min(footerLineCount, lines.length));
      const tailSeen = new Set();
      for (const line of tailSlice) {
        const fp = normalize(line);
        if (fp.length < 5) continue;
        if (tailSeen.has(fp)) continue;
        tailSeen.add(fp);
        footerFingerprints.set(fp, (footerFingerprints.get(fp) || 0) + 1);
      }
    }

    // Identify repeated patterns
    const nonEmptyPages = pages.filter(p => p.text && !p.empty).length;
    const minCount = Math.ceil(nonEmptyPages * threshold);

    const repeatedHeaders = new Set();
    for (const [fp, count] of headerFingerprints) {
      if (count >= minCount) repeatedHeaders.add(fp);
    }

    const repeatedFooters = new Set();
    for (const [fp, count] of footerFingerprints) {
      if (count >= minCount) repeatedFooters.add(fp);
    }

    // Fuzzy ADVOGADOS header detection — catches garbled law firm headers
    // on scanned pages where OCR produces different garbage each time.
    // Pattern: look for "ADVOGADOS" (or garbled variants) in first N lines,
    // then strip from line 0 through the ADVOGADOS line + 2 lines below.
    // Extended window (20 lines) because inverted PJe footer on rotated pages
    // can push ADVOGADOS past the normal 12-line header zone.
    const advogadosPattern = /advogad|abvoga|advdga/i;
    const advogadosSearchWindow = 20;

    // Inverted PJe footer signatures — on pages OCR'd with 180° rotation,
    // the digital PJe footer appears garbled at the TOP of the page.
    // OCR reads upside-down text as different characters, so char-reverse
    // doesn't match. Instead we detect characteristic garbled patterns.
    const invertedPjeSignatures = [
      /Ojusun[Dd]op\s+op/i,          // reversed "Número do documento"
      /opeuissy/i,                     // reversed "Assinado eletronicamente"
      /o[ul]uona\|o|ouone\|o/i,       // pipe in "eletronicamente por:"
      /Bed\s*-\s*\d{2}\/\d{2}\/\d/,   // reversed "Núm. NNN - Pág." pattern
      /0Z0620{3,}/,                    // reversed document number sequence
      /[Bb][zse]e?l?d[iy]?\/?\/?\s*:?\s*sd[ygu]/i,  // reversed "https://pje..." garbled
      /OJUSU[IN]{1,3}[DIOAB]/i,       // reversed document ID hash
    ];

    // PJe footer patterns (always strip)
    const pjePatterns = [
      /este documento foi gerado pelo usu/i,
      /n[uú]mero do documento/i,
      /assinado eletronicamente por/i,
      /https?:\/\/pje/i,
      /num\.\s*\d+\s*-?\s*p[aá]g\.\s*\d+/i,
    ];

    // Clean each page
    let strippedHeaderCount = 0;
    let strippedFooterCount = 0;
    let strippedInvertedCount = 0;

    const cleanedPages = pages.map(page => {
      if (!page.text || page.empty) return page;

      const lines = page.text.split('\n');
      const totalLines = lines.length;

      // --- Pendente 1: Fuzzy ADVOGADOS header block stripping ---
      // Find "ADVOGADOS" (or garbled variant) in the first N lines.
      // If found, mark lines 0..advogadosIdx+2 for removal.
      // Uses extended window (20 lines) to handle rotated pages where
      // inverted PJe footer precedes the ADVOGADOS block.
      let advogadosCutoff = -1;
      for (let i = 0; i < Math.min(advogadosSearchWindow, totalLines); i++) {
        if (advogadosPattern.test(lines[i])) {
          advogadosCutoff = Math.min(i + 2, totalLines - 1);
          break;
        }
      }

      const cleanLines = [];

      for (let i = 0; i < totalLines; i++) {
        const line = lines[i];
        const fp = normalize(line);

        // Pendente 1: Strip entire header block up to ADVOGADOS + 2 lines
        if (advogadosCutoff >= 0 && i <= advogadosCutoff) {
          strippedHeaderCount++;
          continue;
        }

        // Strip repeated headers (in first N lines) — fingerprint exact match
        if (i < headerLineCount && fp.length >= 5 && repeatedHeaders.has(fp)) {
          strippedHeaderCount++;
          continue;
        }

        // Strip repeated footers (in last N lines)
        if (i >= totalLines - footerLineCount && fp.length >= 5 && repeatedFooters.has(fp)) {
          strippedFooterCount++;
          continue;
        }

        // Strip PJe system footer lines
        if (pjePatterns.some(p => p.test(line))) {
          strippedFooterCount++;
          continue;
        }

        // --- Pendente 2: Inverted PJe footer at top of rotated pages ---
        // On pages OCR'd with 180° rotation, the digital PJe footer
        // appears garbled at the TOP (read upside-down by tesseract).
        // Detect by characteristic garbled signatures, not char-reverse.
        if (i < advogadosSearchWindow && line.trim().length > 10) {
          if (invertedPjeSignatures.some(p => p.test(line))) {
            strippedInvertedCount++;
            continue;
          }
        }

        cleanLines.push(line);
      }

      const cleanText = cleanLines.join('\n').replace(/\n{3,}/g, '\n\n').trim();

      return {
        ...page,
        text: cleanText,
        text_stripped: true,
      };
    });

    cleanedPages._stripStats = {
      repeated_header_patterns: repeatedHeaders.size,
      repeated_footer_patterns: repeatedFooters.size,
      lines_stripped_header: strippedHeaderCount,
      lines_stripped_footer: strippedFooterCount,
      lines_stripped_inverted: strippedInvertedCount,
    };

    return cleanedPages;
  }

  /**
   * Save profile to disk
   */
  saveProfile(profile) {
    fs.mkdirSync(this.outputDir, { recursive: true });
    const outPath = path.join(
      this.outputDir,
      `${path.parse(profile.file).name}-profile.json`
    );
    fs.writeFileSync(outPath, JSON.stringify(profile, null, 2));
    return outPath;
  }
}

/**
 * Document Classifier — determines legal document type
 */
class DocumentClassifier {
  constructor() {
    this.rules = [
      { type: 'peticao-inicial', patterns: [/excelent[ií]ssim[oa]/i, /requer\s/i, /qualifica[cç][aã]o\s+das?\s+partes/i], weight: 0.85 },
      { type: 'contestacao', patterns: [/contesta\s/i, /preliminar/i, /m[ée]rito/i], weight: 0.8 },
      { type: 'sentenca', patterns: [/julgo/i, /procedente/i, /improcedente/i], weight: 0.9 },
      { type: 'acordao', patterns: [/ac[oó]rd[aã][om]/i, /desembargador/i, /ementa/i], weight: 0.9 },
      { type: 'despacho', patterns: [/cite-se/i, /intime-se/i, /despacho/i], weight: 0.7 },
      { type: 'decisao-interlocutoria', patterns: [/defiro/i, /indefiro/i, /tutela/i], weight: 0.75 },
      { type: 'agravo', patterns: [/agravo/i, /efeito\s+suspensivo/i], weight: 0.8 },
      { type: 'parecer-mp', patterns: [/minist[eé]rio\s+p[uú]blico/i, /opina/i], weight: 0.8 },
      { type: 'laudo-pericial', patterns: [/perito/i, /quesitos/i, /laudo\s+pericial/i], weight: 0.8 },
      { type: 'procuracao', patterns: [/poderes/i, /substabelecer/i, /outorg/i], weight: 0.8 },
      { type: 'certidao', patterns: [/certifico/i, /dou\s+f[eé]/i], weight: 0.8 },
      { type: 'oficio', patterns: [
        /of[ií]cio\s+n[º°.\s]/i,
        /of[ií]cio\s+de\s+n[º°.\s]/i,
        /of[ií]c[ri]o\b/i,
        /cumprimentos/i,
        /atenciosamente/i,
        /prezados?\s+senhor/i,
        /senhor\s+(delegado|secret[aá]rio|diretor|superintendente)/i,
      ], weight: 0.70 },
      { type: 'laudo-constitutivo', patterns: [/laudo\s+constitutivo/i, /superintend[eê]ncia/i, /sudene/i, /adene/i, /incentivo\s+fiscal/i, /redu[cç][aã]o\s+do\s+imposto/i, /redu[cç][aã]o\s+do\s+irpj/i], weight: 0.85 },
      { type: 'auto-infracao', patterns: [/auto\s+de\s+infra[cç][aã]o/i, /penalidade\s+(isolada|apl[ií]cada)/i, /multa\s+(de|no\s+valor)/i, /notifica[cç][aã]o\s+de\s+lan[cç]amento/i], weight: 0.8 },
      { type: 'portaria', patterns: [/portaria\s+n[º°]/i, /resolve:/i, /o\s+ministro/i, /o\s+superintendente/i], weight: 0.75 },
      { type: 'memorando', patterns: [
        /memorando/i,
        /memo\s+n[º°.\s]/i,
        /memo\s+\d{1,4}\s*[\/\-]\s*\d{2,4}/i,
        /comunica[cç][aã]o\s+interna/i,
      ], weight: 0.70 },
    ];
  }

  /**
   * Classify document based on text content
   */
  classify(text) {
    if (!text || text.trim().length < 50) {
      return { primary_type: 'unknown', confidence: 0, indicators: [] };
    }

    const sample = text.slice(0, 5000); // First ~3 pages
    const scores = [];

    for (const rule of this.rules) {
      const matches = rule.patterns.filter(p => p.test(sample));
      if (matches.length > 0) {
        const confidence = Math.min(1, (matches.length / rule.patterns.length) * rule.weight);
        scores.push({
          type: rule.type,
          confidence: Math.round(confidence * 100) / 100,
          indicators: matches.map(m => m.source),
        });
      }
    }

    // Disambiguation: entity-only matches need structural confirmation
    for (const score of scores) {
      if (score.type === 'laudo-constitutivo') {
        const structuralPatterns = [/laudo\s+constitutivo/i, /redu[cç][aã]o\s+do\s+imposto/i, /redu[cç][aã]o\s+do\s+irpj/i, /incentivo\s+fiscal/i, /superintend[eê]ncia/i];
        const entityOnlyPatterns = [/sudene/i, /adene/i];
        const hasStructural = structuralPatterns.some(p => p.test(sample));
        const matchedIndicators = score.indicators.map(src => new RegExp(src, 'i'));
        const allMatchesAreEntityOnly = matchedIndicators.every(m =>
          entityOnlyPatterns.some(e => e.source === m.source || e.test(m.source))
        );
        if (allMatchesAreEntityOnly && !hasStructural) {
          score.confidence = Math.round(score.confidence * 0.5 * 100) / 100;
          score.disambiguation = 'entity-mention-only';
        }
      }
    }

    scores.sort((a, b) => b.confidence - a.confidence);

    if (scores.length === 0) {
      return { primary_type: 'unknown', confidence: 0, indicators: [] };
    }

    const result = {
      primary_type: scores[0].type,
      confidence: scores[0].confidence,
      indicators: scores[0].indicators,
    };

    if (scores.length > 1 && scores[0].confidence < 0.8) {
      result.secondary_type = scores[1].type;
      result.secondary_confidence = scores[1].confidence;
    }

    return result;
  }
}

module.exports = { QualityProfiler, DocumentClassifier };
