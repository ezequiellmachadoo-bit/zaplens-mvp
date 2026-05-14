import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

dotenv.config();

const app = express();

const PORT = process.env.PORT || 8080;
const VERIFY_TOKEN = process.env.VERIFY_TOKEN || 'zaplens_2026';

const WHATSAPP_TOKEN = process.env.WHATSAPP_TOKEN || '';
const WHATSAPP_PHONE_NUMBER_ID = process.env.WHATSAPP_PHONE_NUMBER_ID || '';

const META_APP_ID = process.env.META_APP_ID || '';
const META_APP_SECRET = process.env.META_APP_SECRET || '';
const META_CONFIGURATION_ID = process.env.META_CONFIGURATION_ID || '';
const META_GRAPH_VERSION = process.env.META_GRAPH_VERSION || 'v20.0';

const PUBLIC_APP_URL =
  process.env.PUBLIC_APP_URL || 'https://zaplens-mvp-production.up.railway.app';

const OAUTH_REDIRECT_URI = `${PUBLIC_APP_URL}/api/whatsapp/oauth/callback`;
const WEBHOOK_URL = `${PUBLIC_APP_URL}/webhook`;
const GRAPH_BASE_URL = `https://graph.facebook.com/${META_GRAPH_VERSION}`;

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const DB_PATH = path.join(__dirname, 'db.json');

app.use(cors());
app.use(express.json({ limit: '20mb' }));
app.use(express.urlencoded({ extended: true }));

function agoraIso() {
  return new Date().toISOString();
}

function horaCurta() {
  return 'agora';
}

function gerarId(prefixo = '') {
  const id = String(Date.now()) + '-' + Math.random().toString(16).slice(2);
  return prefixo ? `${prefixo}_${id}` : id;
}

function normalizarEmpresaId(valor = 'empresa_demo') {
  const texto = String(valor || 'empresa_demo');

  if (texto.includes(':')) {
    return texto.split(':')[0] || 'empresa_demo';
  }

  return texto || 'empresa_demo';
}

function extrairTelefoneDoState(valor = '') {
  const texto = String(valor || '');

  if (!texto.includes(':')) return null;

  const telefone = texto.split(':').slice(1).join(':').replace(/\D/g, '');

  return telefone || null;
}

function mascararToken(token = '') {
  if (!token) return null;
  if (token.length <= 12) return '***';
  return `${token.slice(0, 6)}...${token.slice(-6)}`;
}

function criarDbInicial() {
  return {
    empresas: [
      {
        id: 'empresa_demo',
        nome: 'Operação Principal',
        telefone: 'whatsapp_demo',
        createdAt: agoraIso(),
        updatedAt: agoraIso(),
      },
    ],
    whatsappConnections: [],
    conversas: [
      {
        id: '1',
        empresaId: 'empresa_demo',
        name: 'Maria Souza',
        initials: 'MS',
        phone: '5548999990001',
        category: 'Orçamento',
        status: 'Aguardando envio de proposta',
        priority: 'Alta',
        priorityClass: 'red',
        last: 'Pode me mandar o orçamento?',
        time: '2h',
        value: 'R$ 1.200',
        owner: 'Ana',
        action: 'Enviar orçamento',
        due: 'Hoje às 16h',
        risk: 'Lead quente parado',
        info: 'Orçamento • lead quente parado',
        summary:
          'Maria pediu orçamento para um serviço e ainda não recebeu proposta. Conversa parada há 2h com valor potencial de R$ 1.200.',
        journey: ['Chegou', 'Qualificado', 'Proposta pendente'],
        messages: [
          ['client', 'Olá, quero fazer um orçamento.', '09:12'],
          ['agent', 'Claro, me passa mais detalhes do serviço?', '09:18'],
          [
            'client',
            'Seria para reformar um banheiro pequeno. Pode me mandar o orçamento?',
            '09:22',
          ],
        ],
        suggestion:
          'Perfeito. Para montar um orçamento mais preciso, me confirma a metragem aproximada, cidade/bairro e quando gostaria de iniciar?',
        createdAt: agoraIso(),
        updatedAt: agoraIso(),
      },
    ],
    fechamentos: [],
    metaEvents: [],
  };
}

function aplicarMigracoes(dbAtual) {
  if (!dbAtual.empresas) dbAtual.empresas = [];
  if (!dbAtual.whatsappConnections) dbAtual.whatsappConnections = [];
  if (!dbAtual.conversas) dbAtual.conversas = [];
  if (!dbAtual.fechamentos) dbAtual.fechamentos = [];
  if (!dbAtual.metaEvents) dbAtual.metaEvents = [];

  if (!dbAtual.empresas.length) {
    dbAtual.empresas.push({
      id: 'empresa_demo',
      nome: 'Operação Principal',
      telefone: 'whatsapp_demo',
      createdAt: agoraIso(),
      updatedAt: agoraIso(),
    });
  }

  dbAtual.empresas = dbAtual.empresas.map((empresa) => ({
    id: empresa.id || 'empresa_demo',
    nome: empresa.nome || 'Operação Principal',
    telefone: empresa.telefone || '',
    createdAt: empresa.createdAt || agoraIso(),
    updatedAt: empresa.updatedAt || agoraIso(),
    ...empresa,
  }));

  dbAtual.whatsappConnections = dbAtual.whatsappConnections.map(
    (connection) => ({
      id: connection.id || gerarId('wa_connection'),
      empresaId: normalizarEmpresaId(connection.empresaId || 'empresa_demo'),
      provider: connection.provider || 'meta_embedded_signup',
      status: connection.status || 'oauth_code_received',
      phone: connection.phone || null,
      code: connection.code || null,
      codeUsed: Boolean(connection.codeUsed),
      businessToken: connection.businessToken || null,
      businessTokenMasked:
        connection.businessTokenMasked || mascararToken(connection.businessToken),
      tokenType: connection.tokenType || null,
      expiresIn: connection.expiresIn || null,
      wabaId: connection.wabaId || null,
      phoneNumberId: connection.phoneNumberId || null,
      displayPhoneNumber: connection.displayPhoneNumber || null,
      verifiedName: connection.verifiedName || null,
      qualityRating: connection.qualityRating || null,
      subscribedToWebhook: Boolean(connection.subscribedToWebhook),
      rawQuery: connection.rawQuery || {},
      onboarding: connection.onboarding || {},
      errors: connection.errors || [],
      createdAt: connection.createdAt || agoraIso(),
      updatedAt: connection.updatedAt || agoraIso(),
      ...connection,
    })
  );

  return dbAtual;
}

function carregarDb() {
  if (!fs.existsSync(DB_PATH)) {
    const dbInicial = criarDbInicial();
    fs.writeFileSync(DB_PATH, JSON.stringify(dbInicial, null, 2), 'utf-8');
    return dbInicial;
  }

  try {
    const conteudo = fs.readFileSync(DB_PATH, 'utf-8');
    const dbLido = JSON.parse(conteudo);
    const dbMigrado = aplicarMigracoes(dbLido);
    fs.writeFileSync(DB_PATH, JSON.stringify(dbMigrado, null, 2), 'utf-8');
    return dbMigrado;
  } catch (error) {
    console.error('Erro ao ler db.json. Criando novo banco:', error);
    const dbInicial = criarDbInicial();
    fs.writeFileSync(DB_PATH, JSON.stringify(dbInicial, null, 2), 'utf-8');
    return dbInicial;
  }
}

function salvarDb() {
  fs.writeFileSync(DB_PATH, JSON.stringify(db, null, 2), 'utf-8');
}

let db = carregarDb();

function gerarIniciais(nome = 'Cliente') {
  return nome
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map((parte) => parte[0])
    .join('')
    .toUpperCase();
}

function garantirEmpresa(empresaId = 'empresa_demo', dados = {}) {
  const id = normalizarEmpresaId(empresaId);
  let empresa = db.empresas.find((item) => item.id === id);

  if (!empresa) {
    empresa = {
      id,
      nome: dados.nome || 'Operação Principal',
      telefone: dados.telefone || '',
      createdAt: agoraIso(),
      updatedAt: agoraIso(),
    };

    db.empresas.push(empresa);
  }

  empresa.updatedAt = agoraIso();

  if (dados.nome) empresa.nome = dados.nome;
  if (dados.telefone) empresa.telefone = dados.telefone;

  return empresa;
}

function garantirEtapa(conversa, etapa) {
  if (!conversa.journey) conversa.journey = [];
  if (!conversa.journey.includes(etapa)) conversa.journey.push(etapa);
}

function registrarMetaEvent(tipo, payload = {}) {
  db.metaEvents.unshift({
    id: gerarId('meta_event'),
    tipo,
    payload,
    createdAt: agoraIso(),
  });

  db.metaEvents = db.metaEvents.slice(0, 300);
  salvarDb();
}

function registrarErroConexao(connection, etapa, error) {
  if (!connection.errors) connection.errors = [];

  const erro = {
    etapa,
    message: error?.message || String(error),
    details: error?.details || null,
    createdAt: agoraIso(),
  };

  connection.errors.unshift(erro);
  connection.errors = connection.errors.slice(0, 30);
  connection.updatedAt = agoraIso();

  console.error(`[${etapa}]`, erro);
}

function erroParaJson(error) {
  return {
    ok: false,
    message: error?.message || String(error),
    details: error?.details || null,
  };
}

async function graphGet(pathname, accessToken, params = {}) {
  const url = new URL(`${GRAPH_BASE_URL}${pathname}`);

  Object.entries(params).forEach(([key, value]) => {
    if (value !== undefined && value !== null && value !== '') {
      url.searchParams.set(key, String(value));
    }
  });

  const headers = {};

  if (accessToken) {
    headers.Authorization = `Bearer ${accessToken}`;
  }

  const response = await fetch(url, {
    method: 'GET',
    headers,
  });

  const json = await response.json().catch(() => ({}));

  if (!response.ok) {
    const error = new Error(json?.error?.message || 'Erro na Graph API.');
    error.details = json;
    throw error;
  }

  return json;
}

async function graphPost(pathname, accessToken, body = {}, params = {}) {
  const url = new URL(`${GRAPH_BASE_URL}${pathname}`);

  Object.entries(params).forEach(([key, value]) => {
    if (value !== undefined && value !== null && value !== '') {
      url.searchParams.set(key, String(value));
    }
  });

  const response = await fetch(url, {
    method: 'POST',
    headers: {
      Authorization: accessToken ? `Bearer ${accessToken}` : '',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body || {}),
  });

  const json = await response.json().catch(() => ({}));

  if (!response.ok) {
    const error = new Error(json?.error?.message || 'Erro na Graph API.');
    error.details = json;
    throw error;
  }

  return json;
}

async function graphPostForm(pathname, accessToken, params = {}) {
  const url = new URL(`${GRAPH_BASE_URL}${pathname}`);

  if (accessToken) {
    url.searchParams.set('access_token', accessToken);
  }

  Object.entries(params).forEach(([key, value]) => {
    if (value !== undefined && value !== null && value !== '') {
      url.searchParams.set(key, String(value));
    }
  });

  const response = await fetch(url, {
    method: 'POST',
  });

  const json = await response.json().catch(() => ({}));

  if (!response.ok) {
    const error = new Error(json?.error?.message || 'Erro na Graph API.');
    error.details = json;
    throw error;
  }

  return json;
}

function getAppAccessToken() {
  if (!META_APP_ID || !META_APP_SECRET) return null;
  return `${META_APP_ID}|${META_APP_SECRET}`;
}

async function trocarCodePorBusinessToken(code) {
  if (!META_APP_ID || !META_APP_SECRET) {
    throw new Error('META_APP_ID ou META_APP_SECRET ausente no Railway.');
  }

  if (!code) {
    throw new Error('Código OAuth ausente.');
  }

  return graphGet('/oauth/access_token', null, {
    client_id: META_APP_ID,
    client_secret: META_APP_SECRET,
    code,
    redirect_uri: OAUTH_REDIRECT_URI,
  });
}

async function debugToken(accessToken) {
  if (!META_APP_ID || !META_APP_SECRET || !accessToken) return null;

  const appAccessToken = getAppAccessToken();

  return graphGet('/debug_token', null, {
    input_token: accessToken,
    access_token: appAccessToken,
  });
}

function extrairWabaIdDoDebug(debugPayload) {
  const scopes = debugPayload?.data?.granular_scopes || [];

  const whatsappScope = scopes.find((item) => {
    const scope = String(item.scope || '').toLowerCase();

    return (
      scope.includes('whatsapp_business_management') ||
      scope.includes('whatsapp_business_messaging')
    );
  });

  const targetId = whatsappScope?.target_ids?.[0];

  return targetId || null;
}

function extrairWabaIdDaQuery(query = {}) {
  return (
    query.waba_id ||
    query.wabaId ||
    query.whatsapp_business_account_id ||
    query.business_account_id ||
    query.whatsappBusinessAccountId ||
    null
  );
}

function extrairPhoneNumberIdDaQuery(query = {}) {
  return (
    query.phone_number_id ||
    query.phoneNumberId ||
    query.business_phone_number_id ||
    query.whatsapp_business_phone_number_id ||
    null
  );
}

async function buscarPhoneNumbers(wabaId, accessToken) {
  if (!wabaId || !accessToken) return [];

  const result = await graphGet(`/${wabaId}/phone_numbers`, accessToken, {
    fields:
      'id,display_phone_number,verified_name,quality_rating,code_verification_status,name_status,platform_type',
  });

  return Array.isArray(result?.data) ? result.data : [];
}

function escolherPhoneNumber(phoneNumbers = [], telefoneInformado = '') {
  if (!phoneNumbers.length) return null;

  const telefoneLimpo = String(telefoneInformado || '').replace(/\D/g, '');

  if (telefoneLimpo) {
    const encontrado = phoneNumbers.find((item) => {
      const display = String(item.display_phone_number || '').replace(/\D/g, '');

      return display.endsWith(telefoneLimpo) || telefoneLimpo.endsWith(display);
    });

    if (encontrado) return encontrado;
  }

  return phoneNumbers[0];
}

async function listarAppsInscritosWaba(wabaId, accessToken) {
  if (!wabaId || !accessToken) {
    throw new Error('WABA ID ou token ausente para listar subscribed_apps.');
  }

  return graphGet(`/${wabaId}/subscribed_apps`, accessToken, {});
}

async function inscreverWebhookWaba(wabaId, accessToken) {
  if (!wabaId || !accessToken) return null;

  return graphPost(`/${wabaId}/subscribed_apps`, accessToken, {});
}

async function inscreverWebhookWabaComOverride(wabaId, accessToken) {
  if (!wabaId || !accessToken) return null;

  return graphPost(`/${wabaId}/subscribed_apps`, accessToken, {
    override_callback_uri: WEBHOOK_URL,
    verify_token: VERIFY_TOKEN,
  });
}

async function listarAssinaturasDoApp() {
  const appAccessToken = getAppAccessToken();

  if (!appAccessToken || !META_APP_ID) {
    throw new Error('App access token ausente para listar subscriptions do app.');
  }

  return graphGet(`/${META_APP_ID}/subscriptions`, appAccessToken, {});
}

async function configurarAssinaturaAppWhatsApp() {
  const appAccessToken = getAppAccessToken();

  if (!appAccessToken || !META_APP_ID) {
    throw new Error('App access token ausente para configurar subscriptions do app.');
  }

  return graphPostForm(`/${META_APP_ID}/subscriptions`, appAccessToken, {
    object: 'whatsapp_business_account',
    callback_url: WEBHOOK_URL,
    verify_token: VERIFY_TOKEN,
    fields: 'messages',
    include_values: 'true',
  });
}

async function completarConexaoMeta(connection) {
  if (!connection) throw new Error('Conexão não encontrada.');

  connection.onboarding = {
    ...(connection.onboarding || {}),
    etapa2StartedAt: agoraIso(),
    redirectUriUsed: OAUTH_REDIRECT_URI,
  };

  if (!connection.code) {
    connection.status = 'callback_without_code';
    connection.notes =
      'A Meta retornou para o ZapLens, mas não enviou code. Refaça a conexão.';
    connection.updatedAt = agoraIso();
    salvarDb();
    return connection;
  }

  if (connection.businessToken && connection.wabaId && connection.phoneNumberId) {
    connection.status = connection.subscribedToWebhook
      ? 'connected_ready'
      : 'connected_without_webhook_subscription';
    connection.notes =
      'A conexão já possui token e ativos. Não tentamos reutilizar o mesmo code.';
    connection.updatedAt = agoraIso();
    salvarDb();
    return connection;
  }

  if (connection.codeUsed && !connection.businessToken) {
    connection.status = 'token_exchange_failed';
    connection.notes =
      'Este código OAuth já foi usado ou expirou. Desconecte e conecte novamente para gerar um code novo.';
    connection.updatedAt = agoraIso();
    salvarDb();
    return connection;
  }

  try {
    connection.status = 'exchanging_code';
    connection.updatedAt = agoraIso();
    salvarDb();

    const tokenPayload = await trocarCodePorBusinessToken(connection.code);

    connection.codeUsed = true;
    connection.businessToken = tokenPayload.access_token || null;
    connection.businessTokenMasked = mascararToken(connection.businessToken);
    connection.tokenType = tokenPayload.token_type || null;
    connection.expiresIn = tokenPayload.expires_in || null;
    connection.onboarding.tokenPayload = {
      token_type: tokenPayload.token_type || null,
      expires_in: tokenPayload.expires_in || null,
      has_access_token: Boolean(tokenPayload.access_token),
    };

    if (!connection.businessToken) {
      throw new Error('A Meta não retornou access_token na troca do code.');
    }

    connection.status = 'token_received';
    connection.updatedAt = agoraIso();
    salvarDb();
  } catch (error) {
    connection.codeUsed = true;
    registrarErroConexao(connection, 'exchange_code_for_token', error);
    connection.status = 'token_exchange_failed';
    connection.notes =
      'Não conseguimos trocar o code por token. Verifique App ID, App Secret, redirect_uri e permissões. Depois desconecte e conecte novamente para gerar um code novo.';
    salvarDb();
    return connection;
  }

  try {
    connection.status = 'discovering_assets';

    const queryWabaId = extrairWabaIdDaQuery(connection.rawQuery);
    const queryPhoneNumberId = extrairPhoneNumberIdDaQuery(connection.rawQuery);

    if (queryWabaId) connection.wabaId = String(queryWabaId);
    if (queryPhoneNumberId) connection.phoneNumberId = String(queryPhoneNumberId);

    const debugPayload = await debugToken(connection.businessToken);

    connection.onboarding.debugToken = {
      app_id: debugPayload?.data?.app_id || null,
      type: debugPayload?.data?.type || null,
      is_valid: debugPayload?.data?.is_valid || null,
      expires_at: debugPayload?.data?.expires_at || null,
      scopes: debugPayload?.data?.scopes || [],
      granular_scopes: (debugPayload?.data?.granular_scopes || []).map((item) => ({
        scope: item.scope,
        target_ids: item.target_ids || [],
      })),
    };

    if (!connection.wabaId) {
      connection.wabaId = extrairWabaIdDoDebug(debugPayload);
    }

    if (connection.wabaId && !connection.phoneNumberId) {
      const phoneNumbers = await buscarPhoneNumbers(
        connection.wabaId,
        connection.businessToken
      );

      connection.onboarding.phoneNumbersFound = phoneNumbers.map((item) => ({
        id: item.id,
        display_phone_number: item.display_phone_number,
        verified_name: item.verified_name,
        quality_rating: item.quality_rating,
        code_verification_status: item.code_verification_status,
        name_status: item.name_status,
        platform_type: item.platform_type,
      }));

      const escolhido = escolherPhoneNumber(phoneNumbers, connection.phone);

      if (escolhido) {
        connection.phoneNumberId = escolhido.id || null;
        connection.displayPhoneNumber = escolhido.display_phone_number || null;
        connection.verifiedName = escolhido.verified_name || null;
        connection.qualityRating = escolhido.quality_rating || null;
      }
    }

    connection.status =
      connection.businessToken && connection.wabaId && connection.phoneNumberId
        ? 'assets_ready'
        : 'token_received_assets_pending';

    connection.updatedAt = agoraIso();
    salvarDb();
  } catch (error) {
    registrarErroConexao(connection, 'discover_assets', error);
    connection.status = 'asset_discovery_failed';
    connection.notes =
      'Token recebido, mas não conseguimos localizar WABA/Phone Number ID automaticamente.';
    salvarDb();
    return connection;
  }

  try {
    if (connection.wabaId && connection.businessToken) {
      connection.status = 'subscribing_webhook';
      connection.updatedAt = agoraIso();
      salvarDb();

      let subscription = null;

      try {
        subscription = await inscreverWebhookWabaComOverride(
          connection.wabaId,
          connection.businessToken
        );
      } catch (overrideError) {
        registrarErroConexao(connection, 'subscribe_webhook_override', overrideError);
        subscription = await inscreverWebhookWaba(
          connection.wabaId,
          connection.businessToken
        );
      }

      connection.subscribedToWebhook = Boolean(subscription?.success ?? true);
      connection.onboarding.subscription = subscription || {
        attempted: true,
      };
    }

    connection.status =
      connection.businessToken && connection.wabaId && connection.phoneNumberId
        ? 'connected_ready'
        : 'connected_partial';

    connection.notes =
      connection.status === 'connected_ready'
        ? 'Conexão operacional criada. Próximo passo: validar recebimento de mensagens novas pelo webhook.'
        : 'Conexão parcial criada. Verifique WABA ID e Phone Number ID.';

    connection.updatedAt = agoraIso();
    salvarDb();

    return connection;
  } catch (error) {
    registrarErroConexao(connection, 'subscribe_webhook', error);

    connection.status =
      connection.businessToken && connection.wabaId && connection.phoneNumberId
        ? 'connected_without_webhook_subscription'
        : 'connected_partial';

    connection.notes =
      'Conseguimos token e ativos, mas a inscrição do webhook falhou. Verifique permissões e configuração do app na Meta.';

    connection.updatedAt = agoraIso();
    salvarDb();

    return connection;
  }
}

function classificarMensagem(texto = '') {
  const t = texto.toLowerCase();

  if (
    t.includes('orçamento') ||
    t.includes('orcamento') ||
    t.includes('valor') ||
    t.includes('preço') ||
    t.includes('preco') ||
    t.includes('quanto') ||
    t.includes('cotação') ||
    t.includes('cotacao')
  ) {
    return {
      category: 'Orçamento',
      status: 'Nova mensagem',
      priority: 'Alta',
      priorityClass: 'red',
      action: 'Responder cliente',
      due: 'Agora',
      risk: 'Novo lead aguardando resposta',
      info: 'Orçamento • nova mensagem',
      summary: `Cliente pediu informação de orçamento: "${texto}"`,
      suggestion:
        'Claro! Para eu te passar um orçamento certinho, me confirma qual serviço você precisa, local e prazo ideal?',
    };
  }

  if (
    t.includes('pix') ||
    t.includes('pagamento') ||
    t.includes('paguei') ||
    t.includes('comprovante') ||
    t.includes('boleto') ||
    t.includes('pagar')
  ) {
    return {
      category: 'Cobrança',
      status: 'Promessa de pagamento',
      priority: 'Média',
      priorityClass: 'yellow',
      action: 'Conferir comprovante',
      due: 'Hoje às 18h',
      risk: 'Pagamento prometido para hoje',
      info: 'Cobrança • promessa de pagamento',
      summary: `Mensagem relacionada a pagamento: "${texto}"`,
      suggestion:
        'Combinado! Assim que fizer o pagamento, pode me enviar o comprovante por aqui que eu já confiro.',
    };
  }

  if (
    t.includes('documento') ||
    t.includes('rg') ||
    t.includes('cpf') ||
    t.includes('contrato') ||
    t.includes('nota') ||
    t.includes('anexo')
  ) {
    return {
      category: 'Documento',
      status: 'Documento recebido',
      priority: 'Média',
      priorityClass: 'blue',
      action: 'Conferir documento',
      due: 'Hoje',
      risk: 'Documento precisa ser validado',
      info: 'Documento • recebido para conferência',
      summary: `Mensagem relacionada a documento: "${texto}"`,
      suggestion:
        'Recebemos o documento. Vou conferir e te retorno se estiver tudo certo ou se faltar algum ajuste.',
    };
  }

  if (
    t.includes('horário') ||
    t.includes('horario') ||
    t.includes('agenda') ||
    t.includes('agendar') ||
    t.includes('amanhã') ||
    t.includes('amanha') ||
    t.includes('visita') ||
    t.includes('remarcar')
  ) {
    return {
      category: 'Agendamento',
      status: 'Aguardando confirmação',
      priority: 'Média',
      priorityClass: 'yellow',
      action: 'Enviar opções de horário',
      due: 'Agora',
      risk: 'Cliente aguardando opções de agenda',
      info: 'Agendamento • nova solicitação',
      summary: `Cliente pediu agenda ou horário: "${texto}"`,
      suggestion:
        'Tenho alguns horários disponíveis. Você prefere pela manhã ou à tarde?',
    };
  }

  if (
    t.includes('ninguém') ||
    t.includes('ninguem') ||
    t.includes('reclama') ||
    t.includes('demora') ||
    t.includes('problema') ||
    t.includes('urgente') ||
    t.includes('processo')
  ) {
    return {
      category: 'Risco',
      status: 'Reclamação sem atualização',
      priority: 'Alta',
      priorityClass: 'red',
      action: 'Responder e priorizar',
      due: 'Agora',
      risk: 'Cliente insatisfeito aguardando retorno',
      info: 'Risco • reclamação crítica',
      summary: `Mensagem com risco de insatisfação: "${texto}"`,
      suggestion:
        'Entendi sua situação e peço desculpas pela demora. Vou priorizar esse atendimento agora e acompanhar até termos uma solução.',
    };
  }

  return {
    category: 'Conversas',
    status: 'Nova mensagem',
    priority: 'Média',
    priorityClass: 'yellow',
    action: 'Responder cliente',
    due: 'Agora',
    risk: 'Cliente aguardando resposta',
    info: 'Conversa • nova mensagem',
    summary: `Nova mensagem recebida: "${texto}"`,
    suggestion:
      'Olá! Recebi sua mensagem e vou te ajudar por aqui. Pode me passar mais detalhes?',
  };
}

function criarOuAtualizarConversa({
  empresaId = 'empresa_demo',
  nome,
  telefone,
  texto,
}) {
  const idEmpresa = normalizarEmpresaId(empresaId);
  const classificacao = classificarMensagem(texto);

  garantirEmpresa(idEmpresa);

  let conversa = db.conversas.find(
    (item) => item.empresaId === idEmpresa && item.phone === telefone
  );

  if (!conversa) {
    conversa = {
      id: gerarId('conversa'),
      empresaId: idEmpresa,
      name: nome || `Cliente ${telefone}`,
      initials: gerarIniciais(nome || 'Cliente'),
      phone: telefone,
      category: classificacao.category,
      status: classificacao.status,
      priority: classificacao.priority,
      priorityClass: classificacao.priorityClass,
      last: texto,
      time: horaCurta(),
      value: '',
      owner: 'Atendimento',
      action: classificacao.action,
      due: classificacao.due,
      risk: classificacao.risk,
      info: classificacao.info,
      summary: classificacao.summary,
      journey: ['Mensagem recebida'],
      messages: [],
      suggestion: classificacao.suggestion,
      createdAt: agoraIso(),
      updatedAt: agoraIso(),
    };

    db.conversas.unshift(conversa);
  }

  conversa.messages.push(['client', texto, horaCurta()]);
  conversa.last = texto;
  conversa.category = classificacao.category;
  conversa.status = classificacao.status;
  conversa.priority = classificacao.priority;
  conversa.priorityClass = classificacao.priorityClass;
  conversa.action = classificacao.action;
  conversa.due = classificacao.due;
  conversa.risk = classificacao.risk;
  conversa.info = classificacao.info;
  conversa.summary = classificacao.summary;
  conversa.suggestion = classificacao.suggestion;
  conversa.time = horaCurta();
  conversa.updatedAt = agoraIso();

  garantirEtapa(conversa, 'Mensagem recebida');

  salvarDb();

  return conversa;
}

function buscarConexaoAtiva(empresaId = 'empresa_demo') {
  const idEmpresa = normalizarEmpresaId(empresaId);

  return db.whatsappConnections.find(
    (item) =>
      normalizarEmpresaId(item.empresaId) === idEmpresa &&
      item.status !== 'revoked'
  );
}

function buscarConexaoPorPhoneNumberId(phoneNumberId) {
  if (!phoneNumberId) return null;

  return db.whatsappConnections.find(
    (item) => String(item.phoneNumberId || '') === String(phoneNumberId)
  );
}

function salvarConexaoWhatsapp({
  empresaId,
  phone,
  code,
  status,
  rawQuery,
  provider = 'meta_embedded_signup',
}) {
  const idEmpresa = normalizarEmpresaId(empresaId);
  const telefone = phone || extrairTelefoneDoState(rawQuery?.state) || null;

  garantirEmpresa(idEmpresa, {
    telefone,
  });

  let connection = buscarConexaoAtiva(idEmpresa);

  if (!connection) {
    connection = {
      id: gerarId('wa_connection'),
      empresaId: idEmpresa,
      provider,
      status: status || 'oauth_code_received',
      phone: telefone,
      code: code || null,
      codeUsed: false,
      businessToken: null,
      businessTokenMasked: null,
      tokenType: null,
      expiresIn: null,
      wabaId: null,
      phoneNumberId: null,
      displayPhoneNumber: null,
      verifiedName: null,
      qualityRating: null,
      subscribedToWebhook: false,
      rawQuery: rawQuery || {},
      onboarding: {},
      errors: [],
      createdAt: agoraIso(),
      updatedAt: agoraIso(),
      notes:
        'Código OAuth recebido. Próxima etapa: trocar o code por token e vincular WABA/phone_number_id.',
    };

    db.whatsappConnections.unshift(connection);
  } else {
    connection.status = status || connection.status || 'oauth_code_received';
    connection.phone = telefone || connection.phone || null;
    connection.code = code || connection.code || null;
    connection.codeUsed = false;
    connection.rawQuery = rawQuery || connection.rawQuery || {};
    connection.provider = provider;
    connection.updatedAt = agoraIso();
    connection.notes =
      'Código OAuth recebido. Próxima etapa: trocar o code por token e vincular WABA/phone_number_id.';
  }

  salvarDb();

  return connection;
}

function obterCredenciaisEnvio(conversa) {
  const connection = buscarConexaoAtiva(conversa.empresaId);

  if (connection?.businessToken && connection?.phoneNumberId) {
    return {
      token: connection.businessToken,
      phoneNumberId: connection.phoneNumberId,
      source: 'embedded_signup',
    };
  }

  return {
    token: WHATSAPP_TOKEN,
    phoneNumberId: WHATSAPP_PHONE_NUMBER_ID,
    source: 'env',
  };
}

async function enviarMensagemWhatsApp({ conversa, telefone, mensagem }) {
  const { token, phoneNumberId, source } = obterCredenciaisEnvio(conversa);

  if (!token || !phoneNumberId) {
    console.log('WhatsApp real ainda não configurado. Mensagem salva localmente.');

    return {
      simulated: true,
      source,
      message: 'Token/phone_number_id ausente. Envio real ignorado.',
    };
  }

  const url = `${GRAPH_BASE_URL}/${phoneNumberId}/messages`;

  const resposta = await fetch(url, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      messaging_product: 'whatsapp',
      to: telefone,
      type: 'text',
      text: {
        body: mensagem,
      },
    }),
  });

  const json = await resposta.json().catch(() => ({}));

  if (!resposta.ok) {
    console.error('Erro ao enviar WhatsApp:', json);
    throw new Error(json?.error?.message || 'Erro ao enviar mensagem WhatsApp');
  }

  return json;
}

function renderOAuthCallbackPage({
  ok,
  title,
  message,
  status,
  empresaId,
  error,
}) {
  const safeTitle = title || (ok ? 'WhatsApp conectado' : 'Conexão não concluída');
  const safeStatus = status || (ok ? 'connected_initial' : 'error');
  const safeEmpresaId = empresaId || 'empresa_demo';

  return `
    <!doctype html>
    <html lang="pt-BR">
      <head>
        <meta charset="utf-8" />
        <title>ZapLens | ${safeTitle}</title>
        <style>
          body {
            font-family: Arial, sans-serif;
            background: #f8fafc;
            color: #0f172a;
            padding: 40px;
          }

          .card {
            max-width: 620px;
            margin: 60px auto;
            background: white;
            border: 1px solid #e2e8f0;
            border-radius: 18px;
            padding: 28px;
            box-shadow: 0 18px 50px rgba(15,23,42,.08);
          }

          h1 {
            margin: 0 0 12px;
            color: ${ok ? '#0f766e' : '#b91c1c'};
          }

          p {
            color: #475569;
            line-height: 1.6;
          }

          code {
            background: #f1f5f9;
            padding: 3px 6px;
            border-radius: 6px;
          }

          .mini {
            margin-top: 18px;
            font-size: 12px;
            color: #64748b;
          }
        </style>
      </head>

      <body>
        <div class="card">
          <h1>${safeTitle}</h1>
          <p>${message}</p>
          <p>Status: <code>${safeStatus}</code></p>
          <p>Empresa: <code>${safeEmpresaId}</code></p>
          ${error ? `<p><strong>Erro:</strong> ${error}</p>` : ''}
          <p class="mini">
            Esta janela será fechada automaticamente. Se não fechar, pode fechar manualmente.
          </p>
        </div>

        <script>
          const payload = {
            type: 'ZAPLENS_WHATSAPP_CONNECTION',
            ok: ${JSON.stringify(Boolean(ok))},
            status: ${JSON.stringify(safeStatus)},
            empresaId: ${JSON.stringify(safeEmpresaId)}
          };

          try {
            if (window.opener) {
              window.opener.postMessage(payload, window.location.origin);
            }
          } catch (error) {
            console.log('Não foi possível avisar a janela principal.', error);
          }

          setTimeout(() => {
            try {
              window.close();
            } catch (error) {
              console.log('Não foi possível fechar a janela automaticamente.', error);
            }
          }, 1800);
        </script>
      </body>
    </html>
  `;
}

function montarConexaoSegura(connection) {
  if (!connection) return null;

  return {
    id: connection.id,
    empresaId: connection.empresaId,
    provider: connection.provider,
    status: connection.status,
    phone: connection.phone,
    wabaId: connection.wabaId,
    phoneNumberId: connection.phoneNumberId,
    displayPhoneNumber: connection.displayPhoneNumber,
    verifiedName: connection.verifiedName,
    qualityRating: connection.qualityRating,
    subscribedToWebhook: Boolean(connection.subscribedToWebhook),
    createdAt: connection.createdAt,
    updatedAt: connection.updatedAt,
    notes: connection.notes,
    hasCode: Boolean(connection.code),
    codeUsed: Boolean(connection.codeUsed),
    hasBusinessToken: Boolean(connection.businessToken),
    businessTokenMasked:
      connection.businessTokenMasked || mascararToken(connection.businessToken),
    errors: connection.errors || [],
    onboarding: {
      redirectUriUsed: connection.onboarding?.redirectUriUsed || null,
      tokenPayload: connection.onboarding?.tokenPayload || null,
      debugToken: connection.onboarding?.debugToken || null,
      phoneNumbersFound: connection.onboarding?.phoneNumbersFound || [],
      subscription: connection.onboarding?.subscription || null,
    },
  };
}

async function executarWebhookDiagnostics(empresaId = 'empresa_demo') {
  const connection = buscarConexaoAtiva(empresaId);

  const resultado = {
    success: true,
    checkedAt: agoraIso(),
    empresaId,
    publicAppUrl: PUBLIC_APP_URL,
    webhookUrl: WEBHOOK_URL,
    verifyToken: VERIFY_TOKEN,
    appId: META_APP_ID || null,
    hasAppSecret: Boolean(META_APP_SECRET),
    connection: montarConexaoSegura(connection),
    steps: [],
    conclusion: '',
  };

  function addStep(name, ok, data) {
    resultado.steps.push({
      name,
      ok,
      data,
      at: agoraIso(),
    });
  }

  if (!connection) {
    resultado.success = false;
    resultado.conclusion = 'Nenhuma conexão ativa encontrada.';
    addStep('connection_check', false, {
      message: 'Nenhuma conexão ativa encontrada.',
    });
    return resultado;
  }

  if (!connection.businessToken) {
    resultado.success = false;
    resultado.conclusion = 'Conexão ativa não possui businessToken.';
    addStep('token_check', false, {
      message: 'businessToken ausente.',
    });
    return resultado;
  }

  if (!connection.wabaId) {
    resultado.success = false;
    resultado.conclusion = 'Conexão ativa não possui WABA ID.';
    addStep('waba_check', false, {
      message: 'wabaId ausente.',
    });
    return resultado;
  }

  addStep('connection_check', true, {
    status: connection.status,
    wabaId: connection.wabaId,
    phoneNumberId: connection.phoneNumberId,
    displayPhoneNumber: connection.displayPhoneNumber,
    subscribedToWebhook: connection.subscribedToWebhook,
  });

  try {
    const apps = await listarAppsInscritosWaba(
      connection.wabaId,
      connection.businessToken
    );

    addStep('list_waba_subscribed_apps_before', true, apps);
  } catch (error) {
    addStep('list_waba_subscribed_apps_before', false, erroParaJson(error));
  }

  try {
    const overrideResult = await inscreverWebhookWabaComOverride(
      connection.wabaId,
      connection.businessToken
    );

    connection.subscribedToWebhook = Boolean(overrideResult?.success ?? true);
    connection.onboarding = connection.onboarding || {};
    connection.onboarding.subscriptionOverride = overrideResult;
    connection.updatedAt = agoraIso();
    salvarDb();

    addStep('subscribe_waba_with_override_callback', true, overrideResult);
  } catch (error) {
    registrarErroConexao(connection, 'diagnostic_subscribe_waba_override', error);
    addStep('subscribe_waba_with_override_callback', false, erroParaJson(error));

    try {
      const fallbackResult = await inscreverWebhookWaba(
        connection.wabaId,
        connection.businessToken
      );

      connection.subscribedToWebhook = Boolean(fallbackResult?.success ?? true);
      connection.onboarding = connection.onboarding || {};
      connection.onboarding.subscriptionFallback = fallbackResult;
      connection.updatedAt = agoraIso();
      salvarDb();

      addStep('subscribe_waba_fallback', true, fallbackResult);
    } catch (fallbackError) {
      registrarErroConexao(connection, 'diagnostic_subscribe_waba_fallback', fallbackError);
      addStep('subscribe_waba_fallback', false, erroParaJson(fallbackError));
    }
  }

  try {
    const appsAfter = await listarAppsInscritosWaba(
      connection.wabaId,
      connection.businessToken
    );

    addStep('list_waba_subscribed_apps_after', true, appsAfter);
  } catch (error) {
    addStep('list_waba_subscribed_apps_after', false, erroParaJson(error));
  }

  try {
    const appSubscriptionsBefore = await listarAssinaturasDoApp();
    addStep('list_app_subscriptions_before', true, appSubscriptionsBefore);
  } catch (error) {
    addStep('list_app_subscriptions_before', false, erroParaJson(error));
  }

  try {
    const appSubscriptionResult = await configurarAssinaturaAppWhatsApp();

    addStep('configure_app_subscription_whatsapp_business_account_messages', true, appSubscriptionResult);
  } catch (error) {
    addStep('configure_app_subscription_whatsapp_business_account_messages', false, erroParaJson(error));
  }

  try {
    const appSubscriptionsAfter = await listarAssinaturasDoApp();
    addStep('list_app_subscriptions_after', true, appSubscriptionsAfter);
  } catch (error) {
    addStep('list_app_subscriptions_after', false, erroParaJson(error));
  }

  const failedSteps = resultado.steps.filter((step) => !step.ok);

  if (!failedSteps.length) {
    resultado.conclusion =
      'Diagnóstico concluído sem erros. Agora envie uma nova mensagem e verifique os logs por "Webhook recebido".';
  } else {
    resultado.conclusion =
      'Diagnóstico encontrou erros. Veja os steps com ok=false para saber o bloqueio exato.';
  }

  resultado.connection = montarConexaoSegura(buscarConexaoAtiva(empresaId));

  registrarMetaEvent('webhook_diagnostics', {
    empresaId,
    conclusion: resultado.conclusion,
    failedSteps: failedSteps.map((step) => ({
      name: step.name,
      data: step.data,
    })),
  });

  return resultado;
}

app.use(express.static(__dirname));

app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'index.html'));
});

app.get('/health', (req, res) => {
  res.json({
    status: 'online',
    app: 'ZapLens MVP',
    port: PORT,
    db: fs.existsSync(DB_PATH),
    publicAppUrl: PUBLIC_APP_URL,
    graphVersion: META_GRAPH_VERSION,
    oauthRedirectUri: OAUTH_REDIRECT_URI,
    webhookUrl: WEBHOOK_URL,
  });
});

app.get('/api/conversations', (req, res) => {
  const empresaId = normalizarEmpresaId(req.query.empresaId || 'empresa_demo');

  const conversas = db.conversas.filter(
    (item) => normalizarEmpresaId(item.empresaId) === empresaId
  );

  res.json({
    success: true,
    empresaId,
    conversas,
    fechamentos: db.fechamentos.filter(
      (item) =>
        !item.empresaId || normalizarEmpresaId(item.empresaId) === empresaId
    ),
  });
});

app.post('/api/simulate-message', (req, res) => {
  const texto = req.body?.message || 'Oi, quanto fica para fazer esse serviço?';
  const nome = req.body?.name || `Novo Cliente ${db.conversas.length + 1}`;
  const telefone = req.body?.phone || `55${Date.now()}`;
  const empresaId = normalizarEmpresaId(req.body?.empresaId || 'empresa_demo');

  const conversa = criarOuAtualizarConversa({
    empresaId,
    nome,
    telefone,
    texto,
  });

  res.json({
    success: true,
    conversa,
  });
});

app.post('/api/send-message', async (req, res) => {
  try {
    const { conversationId, message } = req.body;

    if (!conversationId || !message) {
      return res.status(400).json({
        success: false,
        error: 'conversationId e message são obrigatórios.',
      });
    }

    const conversa = db.conversas.find((item) => item.id === conversationId);

    if (!conversa) {
      return res.status(404).json({
        success: false,
        error: 'Conversa não encontrada.',
      });
    }

    const envio = await enviarMensagemWhatsApp({
      conversa,
      telefone: conversa.phone,
      mensagem: message,
    });

    conversa.messages.push(['agent', message, horaCurta()]);
    conversa.last = message;
    conversa.status = 'Respondido';
    conversa.action = 'Acompanhar retorno';
    conversa.due = 'Amanhã';
    conversa.risk = 'Aguardando resposta do cliente';
    conversa.time = horaCurta();
    conversa.updatedAt = agoraIso();

    if (conversa.priorityClass === 'red') {
      conversa.priorityClass = 'yellow';
    }

    garantirEtapa(conversa, 'Respondido');
    salvarDb();

    res.json({
      success: true,
      conversa,
      envio,
    });
  } catch (error) {
    console.error('Erro em /api/send-message:', error);

    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
});

app.post('/api/conversations/:id/update', (req, res) => {
  const { id } = req.params;
  const updates = req.body;

  const conversa = db.conversas.find((item) => item.id === id);

  if (!conversa) {
    return res.status(404).json({
      success: false,
      error: 'Conversa não encontrada.',
    });
  }

  Object.assign(conversa, updates);
  conversa.time = horaCurta();
  conversa.updatedAt = agoraIso();

  if (updates.status) {
    garantirEtapa(conversa, updates.status);
  }

  salvarDb();

  res.json({
    success: true,
    conversa,
  });
});

app.post('/api/conversations/:id/close', (req, res) => {
  const { id } = req.params;

  const conversa = db.conversas.find((item) => item.id === id);

  if (!conversa) {
    return res.status(404).json({
      success: false,
      error: 'Conversa não encontrada.',
    });
  }

  const fechamento = {
    id: gerarId('fechamento'),
    empresaId: conversa.empresaId,
    cliente: conversa.name,
    tipo: 'Fechamento via conversa',
    valor: conversa.value || 'Não informado',
    responsavel: conversa.owner,
    data: new Date().toLocaleDateString('pt-BR'),
    proximaAcao: 'Acompanhar pós-fechamento',
    status: 'Registrado',
    createdAt: agoraIso(),
  };

  db.fechamentos.unshift(fechamento);

  conversa.category = 'Fechamento';
  conversa.status = 'Resolvido';
  conversa.action = 'Acompanhar pós-fechamento';
  conversa.due = '-';
  conversa.risk = 'Fechamento registrado';
  conversa.priorityClass = 'green';
  conversa.time = horaCurta();
  conversa.updatedAt = agoraIso();

  garantirEtapa(conversa, 'Fechamento registrado');
  salvarDb();

  res.json({
    success: true,
    conversa,
    fechamento,
    fechamentos: db.fechamentos,
  });
});

app.post('/api/reset', (req, res) => {
  db = criarDbInicial();
  salvarDb();

  res.json({
    success: true,
    message: 'Banco reiniciado.',
    db,
  });
});

app.get('/api/whatsapp/status', (req, res) => {
  const empresaId = normalizarEmpresaId(req.query.empresaId || 'empresa_demo');
  const connection = buscarConexaoAtiva(empresaId);

  res.json({
    success: true,
    empresaId,
    connected: Boolean(connection),
    ready: connection?.status === 'connected_ready',
    connection: montarConexaoSegura(connection),
    meta: {
      graphVersion: META_GRAPH_VERSION,
      hasAppId: Boolean(META_APP_ID),
      hasAppSecret: Boolean(META_APP_SECRET),
      hasConfigurationId: Boolean(META_CONFIGURATION_ID),
      hasWhatsappToken: Boolean(WHATSAPP_TOKEN),
      hasPhoneNumberId: Boolean(WHATSAPP_PHONE_NUMBER_ID),
      callbackUrl: OAUTH_REDIRECT_URI,
      webhookUrl: WEBHOOK_URL,
      verifyToken: VERIFY_TOKEN,
    },
  });
});

app.get('/api/whatsapp/connect-info', (req, res) => {
  res.json({
    success: true,
    appId: META_APP_ID,
    configurationId: META_CONFIGURATION_ID,
    redirectUri: OAUTH_REDIRECT_URI,
    webhookUrl: WEBHOOK_URL,
    verifyToken: VERIFY_TOKEN,
    readyForEmbeddedSignup: Boolean(META_APP_ID && META_CONFIGURATION_ID),
  });
});

app.get('/api/whatsapp/connections', (req, res) => {
  const empresaId = req.query.empresaId
    ? normalizarEmpresaId(req.query.empresaId)
    : null;

  const connections = empresaId
    ? db.whatsappConnections.filter(
        (item) => normalizarEmpresaId(item.empresaId) === empresaId
      )
    : db.whatsappConnections;

  res.json({
    success: true,
    total: connections.length,
    connections: connections.map(montarConexaoSegura),
  });
});

app.post('/api/whatsapp/disconnect', (req, res) => {
  const empresaId = normalizarEmpresaId(req.body?.empresaId || 'empresa_demo');

  db.whatsappConnections = db.whatsappConnections.map((connection) => {
    if (normalizarEmpresaId(connection.empresaId) !== empresaId) return connection;

    return {
      ...connection,
      status: 'revoked',
      updatedAt: agoraIso(),
      notes:
        'Conexão desconectada pelo ZapLens. Permissões na Meta podem continuar ativas até revogação pelo usuário.',
    };
  });

  salvarDb();

  res.json({
    success: true,
    message: 'WhatsApp desconectado.',
    empresaId,
  });
});

app.post('/api/whatsapp/complete-connection', async (req, res) => {
  try {
    const empresaId = normalizarEmpresaId(req.body?.empresaId || 'empresa_demo');
    const connection = buscarConexaoAtiva(empresaId);

    if (!connection) {
      return res.status(404).json({
        success: false,
        error: 'Conexão não encontrada.',
      });
    }

    const updated = await completarConexaoMeta(connection);

    res.json({
      success: true,
      connection: montarConexaoSegura(updated),
    });
  } catch (error) {
    console.error('Erro em complete-connection:', error);

    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
});

app.get('/api/whatsapp/oauth/callback', async (req, res) => {
  const { code, state, error, error_description } = req.query;
  const empresaId = normalizarEmpresaId(state || 'empresa_demo');
  const phone = extrairTelefoneDoState(state);

  registrarMetaEvent('oauth_callback', {
    query: req.query,
    empresaId,
    phone,
    receivedAt: agoraIso(),
  });

  if (error) {
    return res.status(400).send(
      renderOAuthCallbackPage({
        ok: false,
        title: 'Conexão não concluída',
        message: 'A Meta retornou um erro durante a conexão.',
        status: 'error',
        empresaId,
        error: `${error} ${error_description || ''}`.trim(),
      })
    );
  }

  let connection = salvarConexaoWhatsapp({
    empresaId,
    phone,
    code: code || null,
    status: code ? 'oauth_code_received' : 'callback_without_code',
    rawQuery: req.query,
  });

  connection = await completarConexaoMeta(connection);

  return res.send(
    renderOAuthCallbackPage({
      ok: true,
      title: 'WhatsApp recebido pelo ZapLens',
      message:
        connection.status === 'connected_ready'
          ? 'Conexão operacional concluída. Agora vamos validar o recebimento de mensagens novas.'
          : 'A autorização chegou ao ZapLens, mas ainda precisamos concluir alguns dados da conexão.',
      status: connection.status,
      empresaId,
    })
  );
});

app.get('/api/meta/webhook-diagnostics', async (req, res) => {
  try {
    const empresaId = normalizarEmpresaId(req.query.empresaId || 'empresa_demo');
    const diagnostics = await executarWebhookDiagnostics(empresaId);

    res.json(diagnostics);
  } catch (error) {
    console.error('Erro em webhook-diagnostics:', error);

    res.status(500).json({
      success: false,
      error: error.message,
      details: error.details || null,
    });
  }
});

app.get('/api/meta/events', (req, res) => {
  res.json({
    success: true,
    total: db.metaEvents.length,
    events: db.metaEvents.slice(0, 100),
  });
});

app.post('/api/meta/deauthorize', (req, res) => {
  registrarMetaEvent('deauthorize', {
    body: req.body,
    receivedAt: agoraIso(),
  });

  const signedRequest = req.body?.signed_request || null;

  if (signedRequest) {
    db.whatsappConnections = db.whatsappConnections.map((connection) => ({
      ...connection,
      status: 'revoked',
      updatedAt: agoraIso(),
    }));
    salvarDb();
  }

  res.json({
    success: true,
    message: 'Solicitação de desautorização recebida.',
  });
});

app.get('/api/meta/deauthorize', (req, res) => {
  res.json({
    success: true,
    message: 'Endpoint de desautorização ativo.',
  });
});

app.post('/api/meta/data-deletion', (req, res) => {
  const confirmationCode = gerarId('delete');

  registrarMetaEvent('data_deletion', {
    body: req.body,
    confirmationCode,
    receivedAt: agoraIso(),
  });

  res.json({
    url: `${PUBLIC_APP_URL}/api/meta/data-deletion/status/${confirmationCode}`,
    confirmation_code: confirmationCode,
  });
});

app.get('/api/meta/data-deletion', (req, res) => {
  res.json({
    success: true,
    message: 'Endpoint de solicitação de exclusão de dados ativo.',
    instructions:
      'Solicitações oficiais devem ser enviadas via POST pela Meta. Este GET confirma que a rota existe.',
  });
});

app.get('/api/meta/data-deletion/status/:confirmationCode', (req, res) => {
  res.json({
    success: true,
    status: 'received',
    confirmation_code: req.params.confirmationCode,
    message: 'Solicitação de exclusão recebida pelo ZapLens.',
  });
});

app.get('/webhook', (req, res) => {
  const mode = req.query['hub.mode'];
  const token = req.query['hub.verify_token'];
  const challenge = req.query['hub.challenge'];

  if (mode === 'subscribe' && token === VERIFY_TOKEN) {
    console.log('Webhook verificado com sucesso.');
    return res.status(200).send(challenge);
  }

  return res.sendStatus(403);
});

app.post('/webhook', (req, res) => {
  console.log('Webhook recebido:', JSON.stringify(req.body, null, 2));

  registrarMetaEvent('webhook', {
    body: req.body,
    receivedAt: agoraIso(),
  });

  try {
    const entry = req.body.entry?.[0];
    const changes = entry?.changes?.[0];
    const value = changes?.value;
    const metadata = value?.metadata;
    const message = value?.messages?.[0];
    const contact = value?.contacts?.[0];

    const phoneNumberId = metadata?.phone_number_id || null;
    const connection =
      buscarConexaoPorPhoneNumberId(phoneNumberId) || buscarConexaoAtiva('empresa_demo');

    const empresaId = connection?.empresaId || 'empresa_demo';

    if (message && message.type === 'text') {
      const texto = message.text.body;
      const telefone = message.from;
      const nome = contact?.profile?.name || `Cliente ${telefone}`;

      criarOuAtualizarConversa({
        empresaId,
        nome,
        telefone,
        texto,
      });
    }

    if (message && message.type === 'audio') {
      const telefone = message.from;
      const nome = contact?.profile?.name || `Cliente ${telefone}`;

      criarOuAtualizarConversa({
        empresaId,
        nome,
        telefone,
        texto:
          'Áudio recebido. Transcrição automática será implementada na próxima etapa de inteligência.',
      });
    }

    return res.sendStatus(200);
  } catch (error) {
    console.error('Erro ao processar webhook:', error);
    return res.sendStatus(200);
  }
});

app.listen(PORT, () => {
  console.log(`Servidor ZapLens rodando na porta ${PORT}`);
  console.log(`Painel: http://localhost:${PORT}`);
  console.log(`API: http://localhost:${PORT}/api/conversations`);
  console.log(`Webhook: ${WEBHOOK_URL}`);
  console.log(`OAuth callback: ${OAUTH_REDIRECT_URI}`);
  console.log(`Diagnóstico webhook: ${PUBLIC_APP_URL}/api/meta/webhook-diagnostics`);
});