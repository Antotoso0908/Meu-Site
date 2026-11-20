// ==========================================
// 1. MAPA DE MODELOS VIA OPENROUTER
// ==========================================
const AI_PROFILES = {
    ChatGPT: {
        icon: 'fa-bolt',
        color: '#10a37f',
        freeModel: 'openrouter/free',
        proModel: 'openai/gpt-4o-mini'
    },
    Claude: {
        icon: 'fa-feather',
        color: '#e07a5f',
        freeModel: 'openrouter/free',
        proModel: 'anthropic/claude-3.5-sonnet'
    },
    Gemini: {
        icon: 'fa-sparkles',
        color: '#38bdf8',
        freeModel: 'google/gemma-4-26b-a4b-it:free',
        proModel: 'google/gemini-2.5-flash'
    },
    Grok: {
        icon: 'fa-x',
        color: '#e2e8f0',
        freeModel: 'openrouter/free',
        proModel: 'x-ai/grok-2-1212'
    },
    MetaAI: {
        icon: 'fa-infinity',
        color: '#3b82f6',
        freeModel: 'meta-llama/llama-3.3-70b-instruct:free',
        proModel: 'meta-llama/llama-3.3-70b-instruct'
    },
    Você: {
        icon: 'fa-user',
        color: '#8b5cf6'
    }
};

// ==========================================
// 2. ESTADO GLOBAL E SUPABASE
// ==========================================
let rooms = JSON.parse(localStorage.getItem('omni_rooms')) || [];
let config = JSON.parse(localStorage.getItem('omni_config')) || {
    openrouterKey: '',
    tier: 'free',
    supaUrl: 'https://wdsvbtbsauolgzbyyosk.supabase.co',
    supaKey: 'sb_publishable_Dx10XQBl-IILDbSiv9ZxUA__hdVHh7j'
};

let supabaseClient = null;
let activeRoomId = null;
let currentRecipient = 'Todos';
let autoTurns = 0;
const MAX_TURNS = 5;

function connectSupabase() {
    const badge = document.getElementById('db-badge');
    if (config.supaUrl && config.supaKey && window.supabase) {
        try {
            supabaseClient = window.supabase.createClient(config.supaUrl, config.supaKey);
            badge.innerHTML = '<i class="fa-solid fa-cloud"></i> Supabase Online';
            badge.style.color = '#34d399';
            syncDown();
        } catch {
            badge.textContent = 'Erro Supabase';
            badge.style.color = '#f87171';
        }
    } else {
        badge.textContent = 'Armazenamento Local';
        badge.style.color = '#94a3b8';
    }
}

async function syncDown() {
    if (!supabaseClient) return;
    const { data } = await supabaseClient
        .from('conselho_ia')
        .select('dados')
        .eq('id', 'principal')
        .single();

    if (data && data.dados) {
        rooms = data.dados.rooms || rooms;
        if (data.dados.openrouterKey) config.openrouterKey = data.dados.openrouterKey;
        localStorage.setItem('omni_rooms', JSON.stringify(rooms));
        localStorage.setItem('omni_config', JSON.stringify(config));
        renderRooms();
        if (activeRoomId) openRoom(activeRoomId);
    }
}

async function syncUp() {
    localStorage.setItem('omni_rooms', JSON.stringify(rooms));
    localStorage.setItem('omni_config', JSON.stringify(config));

    if (supabaseClient) {
        await supabaseClient.from('conselho_ia').upsert({
            id: 'principal',
            dados: { rooms, openrouterKey: config.openrouterKey },
            atualizado_em: new Date().toISOString()
        });
    }
}

// Inicializa a conexão logo ao carregar a página
connectSupabase();

// ==========================================
// 3. CONTROLE DOS MODAIS
// ==========================================
const sidebar = document.getElementById('sidebar');
document.getElementById('open-sidebar-mobile').onclick = () => sidebar.classList.add('open');
document.getElementById('close-sidebar-mobile').onclick = () => sidebar.classList.remove('open');

const configModal = document.getElementById('config-modal');
document.getElementById('open-config-btn').onclick = () => {
    document.getElementById('openrouter-key').value = config.openrouterKey || '';
    document.getElementById('model-tier').value = config.tier || 'free';
    document.getElementById('supa-url').value = config.supaUrl || '';
    document.getElementById('supa-key').value = config.supaKey || '';
    configModal.classList.remove('hidden');
};
document.getElementById('close-config-btn').onclick = () => configModal.classList.add('hidden');

document.getElementById('save-config-btn').onclick = async () => {
    config.openrouterKey = document.getElementById('openrouter-key').value.trim();
    config.tier = document.getElementById('model-tier').value;
    config.supaUrl = document.getElementById('supa-url').value.trim();
    config.supaKey = document.getElementById('supa-key').value.trim();

    connectSupabase();
    await syncUp();
    configModal.classList.add('hidden');
};

const roomModal = document.getElementById('room-modal');
document.getElementById('open-room-btn').onclick = () => roomModal.classList.remove('hidden');
document.getElementById('close-room-btn').onclick = () => roomModal.classList.add('hidden');

document.getElementById('create-room-btn').onclick = async () => {
    const name = document.getElementById('room-name').value.trim() || `Sala #${rooms.length + 1}`;
    const selected = Array.from(document.querySelectorAll('#room-modal input[type="checkbox"]:checked')).map(c => c.value);

    if (selected.length === 0) {
        alert('Escolha pelo menos uma IA!');
        return;
    }

    const newRoom = {
        id: Date.now().toString(),
        name,
        members: selected,
        messages: []
    };

    rooms.unshift(newRoom);
    await syncUp();
    roomModal.classList.add('hidden');
    document.getElementById('room-name').value = '';
    sidebar.classList.remove('open');
    openRoom(newRoom.id);
    renderRooms();
};

// ==========================================
// 4. RENDERIZAÇÃO DAS SALAS E MENSAGENS
// ==========================================
function renderRooms() {
    const list = document.getElementById('rooms-list');
    list.innerHTML = '';
    rooms.forEach(r => {
        const item = document.createElement('div');
        item.className = `room-item ${r.id === activeRoomId ? 'active' : ''}`;
        item.innerHTML = `
            <span>${r.name}</span>
            <button class="del-room" onclick="removeRoom('${r.id}', event)"><i class="fa-solid fa-trash"></i></button>
        `;
        item.onclick = () => {
            openRoom(r.id);
            sidebar.classList.remove('open');
        };
        list.appendChild(item);
    });
}

window.removeRoom = async (id, e) => {
    e.stopPropagation();
    rooms = rooms.filter(r => r.id !== id);
    if (activeRoomId === id) activeRoomId = null;
    await syncUp();
    renderRooms();
    renderFeed();
};

function openRoom(id) {
    activeRoomId = id;
    const room = rooms.find(r => r.id === id);
    if (!room) return;

    document.getElementById('active-room-title').textContent = room.name;
    document.getElementById('active-room-badges').innerHTML = room.members
        .map(m => `<span class="mini-badge">${m}</span>`)
        .join('');

    const pills = document.getElementById('recipient-pills');
    pills.innerHTML = '';
    currentRecipient = 'Todos';

    ['Todos', ...room.members].forEach(target => {
        const btn = document.createElement('button');
        btn.className = `pill-btn ${target === currentRecipient ? 'active' : ''}`;
        btn.textContent = target === 'Todos' ? 'Todos da Sala' : `@${target}`;
        btn.onclick = () => {
            currentRecipient = target;
            document.querySelectorAll('.pill-btn').forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
        };
        pills.appendChild(btn);
    });

    renderRooms();
    renderFeed();
}

function renderFeed() {
    const feed = document.getElementById('feed');
    const room = rooms.find(r => r.id === activeRoomId);

    if (!room) {
        feed.innerHTML = `
            <div class="empty-hero">
                <i class="fa-solid fa-robot"></i>
                <h3>Suas 5 IAs em um só lugar</h3>
                <p>Clique em <strong>Chave API & Supabase</strong> no canto inferior esquerdo para colar sua chave do OpenRouter e comece a conversar.</p>
            </div>`;
        return;
    }

    feed.innerHTML = '';
    room.messages.forEach(msg => {
        const isUser = msg.from === 'Você';
        const profile = AI_PROFILES[msg.from] || AI_PROFILES.ChatGPT;
        const row = document.createElement('div');
        row.className = `msg-row ${isUser ? 'user' : 'ai'}`;

        const htmlBody = window.marked ? marked.parse(msg.text) : msg.text;

        row.innerHTML = `
            <div class="avatar color-${msg.from}"><i class="fa-solid ${profile.icon}"></i></div>
            <div class="bubble">
                <div class="msg-meta">
                    <span style="color:${isUser ? '#fff' : profile.color}">${msg.from}</span>
                    <span class="dest-tag">para ${msg.to}</span>
                </div>
                <div class="msg-text">${htmlBody}</div>
            </div>
        `;
        feed.appendChild(row);
    });

    feed.scrollTop = feed.scrollHeight;
}

// ==========================================
// 5. ENVIO E COMUNICAÇÃO VIA OPENROUTER
// ==========================================
const msgInput = document.getElementById('msg-input');
msgInput.addEventListener('input', function() {
    this.style.height = 'auto';
    this.style.height = this.scrollHeight + 'px';
});

document.getElementById('send-btn').onclick = sendMessage;
msgInput.addEventListener('keypress', e => {
    if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        sendMessage();
    }
});

async function sendMessage() {
    const text = msgInput.value.trim();
    if (!text || !activeRoomId) return;

    const room = rooms.find(r => r.id === activeRoomId);
    msgInput.value = '';
    msgInput.style.height = 'auto';
    autoTurns = 0;

    room.messages.push({ from: 'Você', to: currentRecipient, text });
    await syncUp();
    renderFeed();

    const targets = currentRecipient === 'Todos' ? room.members : [currentRecipient];
    for (const ai of targets) {
        await requestAIReply(room, ai);
    }
}

async function requestAIReply(room, aiName) {
    const feed = document.getElementById('feed');
    const profile = AI_PROFILES[aiName] || AI_PROFILES.ChatGPT;

    const loader = document.createElement('div');
    loader.className = 'msg-row ai';
    loader.id = `load-${aiName}`;
    loader.innerHTML = `
        <div class="avatar color-${aiName}"><i class="fa-solid ${profile.icon}"></i></div>
        <div class="bubble"><small style="color:${profile.color}">${aiName} está digitando...</small></div>
    `;
    feed.appendChild(loader);
    feed.scrollTop = feed.scrollHeight;

    const systemRule = `
Você é a IA "${aiName}". Você está em um chat em grupo com o usuário ("Você") e outras IAs: ${room.members.join(', ')}.
REGRA OBRIGATÓRIA E PERMANENTE:
1. Você lê o histórico no formato "[De Remetente para Destinatario]: mensagem".
2. Toda resposta sua DEVE começar exatamente com a tag indicando quem recebe:
   [De ${aiName} para Destinatario]: Sua mensagem...
3. Use "Você" para responder ao usuário, "Todos" para falar com toda a sala, ou o nome exato de outra IA (${room.members.filter(m => m !== aiName).join(', ')}) para falar diretamente com ela.
4. Assuma a identidade e estilo característico de ${aiName}.
`.trim();

    const historyText = room.messages.map(m => `[De ${m.from} para ${m.to}]: ${m.text}`).join('\n\n');

    try {
        if (!config.openrouterKey) {
            throw new Error('Configure sua chave única do OpenRouter no menu "Chave API & Supabase".');
        }

        const chosenModel = config.tier === 'pro' ? profile.proModel : profile.freeModel;

        const res = await fetch('https://openrouter.ai/api/v1/chat/completions', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${config.openrouterKey}`,
                'HTTP-Referer': window.location.href,
                'X-Title': 'OmniCouncil'
            },
            body: JSON.stringify({
                model: chosenModel,
                messages: [
                    { role: 'system', content: systemRule },
                    { role: 'user', content: historyText }
                ]
            })
        });

        const data = await res.json();
        document.getElementById(`load-${aiName}`)?.remove();

        if (data.error) throw new Error(data.error.message || 'Erro na API OpenRouter');

        const raw = data.choices[0].message.content;
        let to = 'Você';
        let clean = raw;

        const match = raw.match(/^\[De\s+.*?\s+para\s+(.*?)\]:?\s*([\s\S]*)/i);
        if (match) {
            to = match[1].trim();
            clean = match[2].trim();
        }

        room.messages.push({ from: aiName, to, text: clean });
        await syncUp();
        renderFeed();

        const debateOn = document.getElementById('auto-debate-toggle').checked;
        if (debateOn && autoTurns < MAX_TURNS) {
            autoTurns++;
            if (to.toLowerCase() === 'todos') {
                for (const other of room.members.filter(m => m !== aiName)) {
                    await requestAIReply(room, other);
                }
            } else {
                const targetAI = room.members.find(m => m.toLowerCase() === to.toLowerCase() && m !== aiName);
                if (targetAI) await requestAIReply(room, targetAI);
            }
        }

    } catch (err) {
        document.getElementById(`load-${aiName}`)?.remove();
        room.messages.push({ from: aiName, to: 'Sistema', text: `⚠️ **Erro:** ${err.message}` });
        await syncUp();
        renderFeed();
    }
}

renderRooms();
