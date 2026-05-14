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

const PUBLIC_APP_URL =
  process.env.PUBLIC_APP_URL || 'https://zaplens-mvp-production.up.railway.app';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const DB_PATH = path.join(__dirname, 'db.json');

app.use(cors());
app.use(express.json({ limit: '10mb' }));
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
      businessToken: connection.businessToken || null,
      wabaId: connection.wabaId || null,
      phoneNumberId: connection.phoneNumberId || null,
      rawQuery: connection.rawQuery || {},
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

  db.metaEvents = db.metaEvents.slice(0, 150);
  salvarDb();
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
      businessToken: null,
      wabaId: null,
      phoneNumberId: null,
      rawQuery: rawQuery || {},
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
    connection.rawQuery = rawQuery || connection.rawQuery || {};
    connection.provider = provider;
    connection.updatedAt = agoraIso();
    connection.notes =
      'Código OAuth recebido. Próxima etapa: trocar o code por token e vincular WABA/phone_number_id.';
  }

  salvarDb();

  return connection;
}

async function enviarMensagemWhatsApp({ telefone, mensagem }) {
  const token = WHATSAPP_TOKEN;
  const phoneNumberId = WHATSAPP_PHONE_NUMBER_ID;

  if (!token || !phoneNumberId) {
    console.log(
      'WhatsApp real ainda não configurado. Mensagem salva localmente.'
    );
    return {
      simulated: true,
      message: 'WhatsApp token/phone_number_id ausente. Envio real ignorado.',
    };
  }

  const url = `https://graph.facebook.com/v20.0/${phoneNumberId}/messages`;

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

  const json = await resposta.json();

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
    connection: connection
      ? {
          id: connection.id,
          empresaId: connection.empresaId,
          provider: connection.provider,
          status: connection.status,
          phone: connection.phone,
          wabaId: connection.wabaId,
          phoneNumberId: connection.phoneNumberId,
          createdAt: connection.createdAt,
          updatedAt: connection.updatedAt,
          notes: connection.notes,
          hasCode: Boolean(connection.code),
          hasBusinessToken: Boolean(connection.businessToken),
        }
      : null,
    meta: {
      hasAppId: Boolean(META_APP_ID),
      hasAppSecret: Boolean(META_APP_SECRET),
      hasConfigurationId: Boolean(META_CONFIGURATION_ID),
      hasWhatsappToken: Boolean(WHATSAPP_TOKEN),
      hasPhoneNumberId: Boolean(WHATSAPP_PHONE_NUMBER_ID),
      callbackUrl: `${PUBLIC_APP_URL}/api/whatsapp/oauth/callback`,
      webhookUrl: `${PUBLIC_APP_URL}/webhook`,
      verifyToken: VERIFY_TOKEN,
    },
  });
});

app.get('/api/whatsapp/connect-info', (req, res) => {
  res.json({
    success: true,
    appId: META_APP_ID,
    configurationId: META_CONFIGURATION_ID,
    redirectUri: `${PUBLIC_APP_URL}/api/whatsapp/oauth/callback`,
    webhookUrl: `${PUBLIC_APP_URL}/webhook`,
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
    connections: connections.map((connection) => ({
      id: connection.id,
      empresaId: connection.empresaId,
      provider: connection.provider,
      status: connection.status,
      phone: connection.phone,
      wabaId: connection.wabaId,
      phoneNumberId: connection.phoneNumberId,
      createdAt: connection.createdAt,
      updatedAt: connection.updatedAt,
      hasCode: Boolean(connection.code),
      hasBusinessToken: Boolean(connection.businessToken),
      notes: connection.notes,
    })),
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
      notes: 'Conexão desconectada pelo ZapLens.',
    };
  });

  salvarDb();

  res.json({
    success: true,
    message: 'WhatsApp desconectado.',
    empresaId,
  });
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

  const connection = salvarConexaoWhatsapp({
    empresaId,
    phone,
    code: code || null,
    status: code ? 'oauth_code_received' : 'callback_without_code',
    rawQuery: req.query,
  });

  return res.send(
    renderOAuthCallbackPage({
      ok: true,
      title: 'WhatsApp recebido pelo ZapLens',
      message:
        'A autorização chegou ao ZapLens. Agora estamos preparando a conexão completa para mensagens e histórico.',
      status: connection.status,
      empresaId,
    })
  );
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
    const message = value?.messages?.[0];
    const contact = value?.contacts?.[0];

    if (message && message.type === 'text') {
      const texto = message.text.body;
      const telefone = message.from;
      const nome = contact?.profile?.name || `Cliente ${telefone}`;

      criarOuAtualizarConversa({
        empresaId: 'empresa_demo',
        nome,
        telefone,
        texto,
      });
    }

    if (message && message.type === 'audio') {
      const telefone = message.from;
      const nome = contact?.profile?.name || `Cliente ${telefone}`;

      criarOuAtualizarConversa({
        empresaId: 'empresa_demo',
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
  console.log(`Webhook: ${PUBLIC_APP_URL}/webhook`);
  console.log(`OAuth callback: ${PUBLIC_APP_URL}/api/whatsapp/oauth/callback`);
});