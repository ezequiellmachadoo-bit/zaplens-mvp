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

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const DB_PATH = path.join(__dirname, 'db.json');

app.use(cors());
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));

function criarDbInicial() {
  return {
    empresas: [
      {
        id: 'empresa_demo',
        nome: 'Empresa Modelo',
        telefone: 'whatsapp_demo',
      },
    ],
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
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      },
    ],
    fechamentos: [],
  };
}

function carregarDb() {
  if (!fs.existsSync(DB_PATH)) {
    const dbInicial = criarDbInicial();
    fs.writeFileSync(DB_PATH, JSON.stringify(dbInicial, null, 2), 'utf-8');
    return dbInicial;
  }

  try {
    const conteudo = fs.readFileSync(DB_PATH, 'utf-8');
    return JSON.parse(conteudo);
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

function agoraIso() {
  return new Date().toISOString();
}

function horaCurta() {
  return 'agora';
}

function gerarId() {
  return String(Date.now()) + '-' + Math.random().toString(16).slice(2);
}

function gerarIniciais(nome = 'Cliente') {
  return nome
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map((parte) => parte[0])
    .join('')
    .toUpperCase();
}

function garantirEtapa(conversa, etapa) {
  if (!conversa.journey) conversa.journey = [];
  if (!conversa.journey.includes(etapa)) conversa.journey.push(etapa);
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
  const classificacao = classificarMensagem(texto);

  let conversa = db.conversas.find(
    (item) => item.empresaId === empresaId && item.phone === telefone
  );

  if (!conversa) {
    conversa = {
      id: gerarId(),
      empresaId,
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

async function enviarMensagemWhatsApp({ telefone, mensagem }) {
  if (!WHATSAPP_TOKEN || !WHATSAPP_PHONE_NUMBER_ID) {
    console.log(
      'WhatsApp real ainda não configurado. Mensagem salva localmente.'
    );
    return {
      simulated: true,
      message: 'WhatsApp token/phone_number_id ausente. Envio real ignorado.',
    };
  }

  const url = `https://graph.facebook.com/v20.0/${WHATSAPP_PHONE_NUMBER_ID}/messages`;

  const resposta = await fetch(url, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${WHATSAPP_TOKEN}`,
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
  });
});

app.get('/api/conversations', (req, res) => {
  const empresaId = req.query.empresaId || 'empresa_demo';

  const conversas = db.conversas.filter((item) => item.empresaId === empresaId);

  res.json({
    success: true,
    empresaId,
    conversas,
    fechamentos: db.fechamentos,
  });
});

app.post('/api/simulate-message', (req, res) => {
  const texto = req.body?.message || 'Oi, quanto fica para fazer esse serviço?';
  const nome = req.body?.name || `Novo Cliente ${db.conversas.length + 1}`;
  const telefone = req.body?.phone || `55${Date.now()}`;
  const empresaId = req.body?.empresaId || 'empresa_demo';

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

  const idFechamento = `${conversa.id}-${Date.now()}`;

  const fechamento = {
    id: idFechamento,
    empresaId: conversa.empresaId,
    cliente: conversa.name,
    tipo: 'Fechamento via conversa',
    valor: conversa.value || 'Não informado',
    responsavel: conversa.owner,
    data: new Date().toLocaleDateString('pt-BR'),
    proximaAcao: 'Acompanhar pós-fechamento',
    status: 'Registrado',
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
});
