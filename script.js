// ==========================================
// SCRIPT.JS - NEXUS AI (MODO SEGURO)
// ==========================================
let chats = JSON.parse(localStorage.getItem('nexus_chats')) || [];
let supaConfig = JSON.parse(localStorage.getItem('nexus_supa')) || { url: '', key: '' };
let supabaseClient = null;

let currentChatId = null;
let selectedTarget = "Todos";
let autoReplyDepth = 0;
const MAX_AUTO_REPLIES = 5;

// Inicializa Supabase se configurado
function initSupabase() {
    const syncBadge = document.getElementById('sync-status');
    if (supaConfig.url && supaConfig.key && window.supabase) {
        try {
            supabaseClient = window.supabase.createClient(supaConfig.url, supaConfig.key);
            syncBadge.innerHTML = '<i class="fa-solid fa-cloud-check"></i> Supabase Conectado';
            syncBadge.style.color = '#34d399';
            loadFromSupabase();
        } catch (e) {
            syncBadge.innerHTML = '<i class="fa-solid fa-triangle-exclamation"></i> Erro Supabase';
        }
    }
}

async function loadFromSupabase() {
    if (!supabaseClient) return;
    const { data } = await supabaseClient.from('ai_hub_data').select('data').eq('id', 'main_workspace').single();
    if (data && data.data) {
        chats = data.data.chats || chats;
        localStorage.setItem('nexus_chats', JSON.stringify(chats));
        renderChatList();
        if (currentChatId) selectChat(currentChatId);
    }
}

async function saveState() {
    localStorage.setItem('nexus_chats', JSON.stringify(chats));
    if (supabaseClient) {
        await supabaseClient.from('ai_hub_data').upsert({
            id: 'main_workspace',
            data: { chats },
            updated_at: new Date().toISOString()
        });
    }
}

// Lógica de Envio de Mensagem para o Backend Seguro
async function triggerAIResponse(chat, aiName) {
    const systemPrompt = `Você é a IA "${aiName}" em um grupo com: ${chat.participants.join(', ')}. Comece sua resposta sempre com: [De ${aiName} para Destinatario]: ...`;
    const formattedHistory = chat.messages.map(m => `[De ${m.sender} para ${m.to}]: ${m.text}`).join('\n\n');

    try {
        // Em vez de chamar a OpenAI/Claude direto no navegador, chamamos a nossa Serverless Function segura (/api/chat)
        const response = await fetch('/api/chat', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ aiName, systemPrompt, conversationText: formattedHistory })
        });

        const data = await response.json();
        if (!response.ok) throw new Error(data.error || 'Erro no servidor');

        let target = "Você";
        let cleanText = data.reply;

        const headerMatch = data.reply.match(/^\[De\s+.*?\s+para\s+(.*?)\]:?\s*([\s\S]*)/i);
        if (headerMatch) {
            target = headerMatch[1].trim();
            cleanText = headerMatch[2].trim();
        }

        chat.messages.push({ sender: aiName, to: target, text: cleanText });
        await saveState();
        renderMessages();

        // Gerenciamento de resposta automática entre IAs
        const allowAiToAi = document.getElementById('ai-to-ai-toggle').checked;
        if (allowAiToAi && autoReplyDepth < MAX_AUTO_REPLIES) {
            autoReplyDepth++;
            if (target.toLowerCase() === 'todos') {
                for (const other of chat.participants.filter(p => p !== aiName)) {
                    await triggerAIResponse(chat, other);
                }
            } else {
                const mentionedAI = chat.participants.find(p => p.toLowerCase() === target.toLowerCase() && p !== aiName);
                if (mentionedAI) await triggerAIResponse(chat, mentionedAI);
            }
        }
    } catch (error) {
        chat.messages.push({ sender: aiName, to: 'Sistema', text: `⚠️ **Erro:** ${error.message}` });
        await saveState();
        renderMessages();
    }
}
