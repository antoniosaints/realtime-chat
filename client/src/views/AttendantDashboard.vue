<script setup>
import { ref, onMounted, onUnmounted, nextTick, watch, computed } from 'vue';
import { socket, SERVER_URL } from '../services/socket';

const queue = ref([]);
const activeChats = ref([]); // List of active chat sessions
const currentChatId = ref(null); // ID of the currently selected chat
const messages = ref({}); // Map of chatId -> messages array
const currentMessage = ref('');
const messagesContainer = ref(null);
const isRecording = ref(false);
let mediaRecorder = null;
let audioChunks = [];

// Computed property for the currently selected chat object
const currentChat = computed(() => {
  return activeChats.value.find(c => c.id === currentChatId.value);
});

// Computed property for messages of the current chat
const currentMessages = computed(() => {
  return messages.value[currentChatId.value] || [];
});

const scrollToBottom = async () => {
  await nextTick();
  if (messagesContainer.value) {
    messagesContainer.value.scrollTop = messagesContainer.value.scrollHeight;
  }
};

watch(currentMessages, scrollToBottom, { deep: true });
watch(currentChatId, scrollToBottom);

onMounted(() => {
  if (!socket.connected) {
    socket.connect();
  }
  socket.emit('attendant_join');

  socket.on('queue_update', (updatedQueue) => {
    queue.value = updatedQueue;
  });

  socket.on('active_chats_update', (chats) => {
    // Merge existing chats to preserve local state if needed, or just replace
    // For simplicity, we replace, but we might want to keep unread counts if we added them
    activeChats.value = chats;

    // If we have active chats but none selected, select the first one
    if (activeChats.value.length > 0 && !currentChatId.value) {
      currentChatId.value = activeChats.value[0].id;
    }
  });

  socket.on('chat_started', (data) => {
    // data: { chatId, client: { name, ... } }
    // Add to active chats if not already there (should be handled by active_chats_update usually, but good for immediate feedback)
    const exists = activeChats.value.find(c => c.id === data.chatId);
    if (!exists) {
      activeChats.value.push({
        id: data.chatId,
        name: data.client.name,
        timestamp: Date.now() // or from client data
      });
    }

    // Select this chat
    currentChatId.value = data.chatId;

    // Initialize messages for this chat if needed
    if (!messages.value[data.chatId]) {
      messages.value[data.chatId] = [];
    }
  });

  socket.on('chat_history', (data) => {
    // data: { chatId, messages: [] }
    // Check if data has chatId (new format) or just array (old format fallback)
    if (data.chatId && Array.isArray(data.messages)) {
      messages.value[data.chatId] = data.messages;
    } else if (Array.isArray(data)) {
      // Fallback for old format, assumes current chat
      if (currentChatId.value) {
        messages.value[currentChatId.value] = data;
      }
    }
  });

  socket.on('receive_message', (msg) => {
    // msg: { chatId, text, sender, ... }
    const chatId = msg.chatId;
    if (!messages.value[chatId]) {
      messages.value[chatId] = [];
    }
    messages.value[chatId].push(msg);

    // If this is a new message for a chat we have, maybe show unread indicator? (Not implemented yet)
  });

  socket.on('chat_ended', (data) => {
    // data: { chatId }
    if (data && data.chatId) {
      // Remove from active chats
      activeChats.value = activeChats.value.filter(c => c.id !== data.chatId);
      delete messages.value[data.chatId];

      if (currentChatId.value === data.chatId) {
        currentChatId.value = null;
        // Select another if available
        if (activeChats.value.length > 0) {
          currentChatId.value = activeChats.value[0].id;
        }
      }
    }
  });
});

onUnmounted(() => {
  socket.off('queue_update');
  socket.off('active_chats_update');
  socket.off('chat_started');
  socket.off('chat_history');
  socket.off('receive_message');
  socket.off('chat_ended');
});

const pickClient = (clientId) => {
  socket.emit('pick_client', clientId);
};

const selectChat = (chatId) => {
  currentChatId.value = chatId;
};

const sendMessage = () => {
  if (currentMessage.value.trim() && currentChatId.value) {
    const msg = {
      chatId: currentChatId.value,
      text: currentMessage.value,
      sender: 'attendant',
      type: 'text'
    };
    socket.emit('send_message', msg);

    // Optimistic update
    if (!messages.value[currentChatId.value]) {
      messages.value[currentChatId.value] = [];
    }
    messages.value[currentChatId.value].push({
      sender: 'attendant',
      text: currentMessage.value,
      type: 'text',
      timestamp: Date.now()
    });

    currentMessage.value = '';
  }
};

const startRecording = async () => {
  if (!currentChatId.value) return;

  try {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });

    let mimeType = 'audio/webm';
    if (MediaRecorder.isTypeSupported('audio/webm;codecs=opus')) {
      mimeType = 'audio/webm;codecs=opus';
    } else if (MediaRecorder.isTypeSupported('audio/ogg;codecs=opus')) {
      mimeType = 'audio/ogg;codecs=opus';
    }

    const options = { mimeType };
    mediaRecorder = new MediaRecorder(stream, options);
    audioChunks = [];

    mediaRecorder.ondataavailable = (event) => {
      if (event.data.size > 0) {
        audioChunks.push(event.data);
      }
    };

    mediaRecorder.onstop = async () => {
      const audioBlob = new Blob(audioChunks, { type: mimeType });

      if (audioBlob.size === 0) {
        console.error("Recorded audio is empty");
        return;
      }

      console.log("Audio recorded. Size:", audioBlob.size, "Type:", mimeType);

      const formData = new FormData();
      formData.append("audio", audioBlob, "recording.webm");

      try {
        const baseUrl = SERVER_URL || '';
        const response = await fetch(`${baseUrl}/api/upload-audio`, {
          method: "POST",
          body: formData
        });

        if (!response.ok) {
          throw new Error(`Upload failed: ${response.statusText}`);
        }

        const data = await response.json();
        const audioUrl = `${baseUrl}${data.url}`;

        const msg = {
          chatId: currentChatId.value,
          text: audioUrl,
          sender: 'attendant',
          type: 'audio'
        };
        socket.emit('send_message', msg);

        // Optimistic update
        if (!messages.value[currentChatId.value]) {
          messages.value[currentChatId.value] = [];
        }
        messages.value[currentChatId.value].push({
          sender: 'attendant',
          text: audioUrl,
          type: 'audio',
          timestamp: Date.now()
        });
      } catch (err) {
        console.error("Error uploading audio:", err);
        alert("Erro ao enviar áudio.");
      }

      stream.getTracks().forEach(track => track.stop());
    };

    mediaRecorder.start(200);
    isRecording.value = true;
  } catch (err) {
    console.error("Error accessing microphone:", err);
    alert("Erro ao acessar microfone. Verifique as permissões.");
  }
};

const stopRecording = () => {
  if (mediaRecorder && isRecording.value && mediaRecorder.state !== 'inactive') {
    mediaRecorder.requestData();
    mediaRecorder.stop();
    isRecording.value = false;
  }
};

const toggleRecording = () => {
  if (isRecording.value) {
    stopRecording();
  } else {
    startRecording();
  }
};

const endChat = () => {
  if (currentChatId.value) {
    if (confirm("Tem certeza que deseja encerrar este atendimento?")) {
      socket.emit('end_chat', currentChatId.value);
    }
  }
};

const isUploadingImage = ref(false);
const imageInput = ref(null);

const triggerImageUpload = () => {
  imageInput.value.click();
};

const handleImageUpload = async (event) => {
  const file = event.target.files[0];
  if (!file) return;

  if (!file.type.startsWith('image/')) {
    alert('Por favor, selecione apenas imagens.');
    return;
  }

  isUploadingImage.value = true;
  const formData = new FormData();
  formData.append('image', file);

  try {
    const baseUrl = SERVER_URL || '';
    const response = await fetch(`${baseUrl}/api/upload-image`, {
      method: 'POST',
      body: formData
    });

    if (!response.ok) {
      throw new Error(`Upload failed: ${response.statusText}`);
    }

    const data = await response.json();
    const imageUrl = `${baseUrl}${data.url}`;

    const msg = {
      chatId: currentChatId.value,
      text: imageUrl,
      sender: 'attendant',
      type: 'image'
    };
    socket.emit('send_message', msg);

    // Optimistic update
    if (!messages.value[currentChatId.value]) {
      messages.value[currentChatId.value] = [];
    }
    messages.value[currentChatId.value].push({
      sender: 'attendant',
      text: imageUrl,
      type: 'image',
      timestamp: Date.now()
    });
  } catch (err) {
    console.error("Error uploading image:", err);
    alert("Erro ao enviar imagem.");
  } finally {
    isUploadingImage.value = false;
    event.target.value = ''; // Reset input
  }
};

// History Logic
const showHistory = ref(false);
const closedChats = ref([]);
const selectedHistoryChat = ref(null);
const historyMessages = ref([]);

const openHistory = () => {
  showHistory.value = true;
  socket.emit('get_closed_chats');
};

const closeHistory = () => {
  showHistory.value = false;
  selectedHistoryChat.value = null;
  historyMessages.value = [];
};

const selectHistoryChat = (chat) => {
  selectedHistoryChat.value = chat;
  socket.emit('fetch_history_messages', chat.id);
};

// We need to listen for the history messages
socket.on('history_messages_received', (data) => {
  if (selectedHistoryChat.value && selectedHistoryChat.value.id === data.chatId) {
    historyMessages.value = data.messages;
  }
});

socket.on('closed_chats_list', (chats) => {
  closedChats.value = chats;
});
</script>

<template>
  <div class="flex h-screen bg-slate-100 overflow-hidden">
    <!-- Sidebar -->
    <aside class="w-80 bg-white border-r border-slate-200 flex flex-col">

      <!-- Queue Section -->
      <div class="flex-1 flex flex-col min-h-0 border-b border-slate-100">
        <div class="p-4 border-b border-slate-100 bg-slate-50/50">
          <h2 class="text-sm font-bold text-slate-700 uppercase tracking-wider flex items-center gap-2">
            <svg xmlns="http://www.w3.org/2000/svg" class="h-4 w-4 text-primary" fill="none" viewBox="0 0 24 24"
              stroke="currentColor">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
                d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
            </svg>
            Fila de Espera
            <span class="bg-primary/10 text-primary text-xs px-2 py-0.5 rounded-full">{{ queue.length }}</span>
          </h2>
        </div>

        <div class="flex-1 overflow-y-auto p-2 space-y-2">
          <div v-if="queue.length === 0" class="text-center text-slate-400 py-4 text-sm">
            <p>Vazio</p>
          </div>
          <div v-for="client in queue" :key="client.id"
            class="bg-white p-3 rounded-lg border border-slate-100 hover:border-primary/30 shadow-sm transition-all group">
            <div class="flex justify-between items-start mb-2">
              <div>
                <h3 class="font-semibold text-slate-800 text-sm">{{ client.name }}</h3>
                <p class="text-[10px] text-slate-500">Esperando: {{ Math.floor((Date.now() - client.timestamp) / 1000 /
                  60) }}m</p>
              </div>
            </div>
            <button @click="pickClient(client.id)"
              class="w-full bg-slate-50 border border-slate-200 text-slate-600 text-xs font-medium py-1.5 rounded hover:bg-primary hover:text-white hover:border-primary transition-colors">
              Atender
            </button>
          </div>
        </div>
      </div>

      <!-- Active Chats Section -->
      <div class="flex-1 flex flex-col min-h-0">
        <div class="p-4 border-b border-slate-100 bg-slate-50/50">
          <h2 class="text-sm font-bold text-slate-700 uppercase tracking-wider flex items-center gap-2">
            <svg xmlns="http://www.w3.org/2000/svg" class="h-4 w-4 text-green-600" fill="none" viewBox="0 0 24 24"
              stroke="currentColor">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
                d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
            </svg>
            Em Atendimento
            <span class="bg-green-100 text-green-700 text-xs px-2 py-0.5 rounded-full">{{ activeChats.length }}</span>
          </h2>
        </div>

        <div class="flex-1 overflow-y-auto p-2 space-y-2">
          <div v-if="activeChats.length === 0" class="text-center text-slate-400 py-4 text-sm">
            <p>Nenhum atendimento</p>
          </div>
          <div v-for="chat in activeChats" :key="chat.id" @click="selectChat(chat.id)" :class="['p-3 rounded-lg border cursor-pointer transition-all',
            currentChatId === chat.id
              ? 'bg-primary/5 border-primary shadow-sm ring-1 ring-primary/20'
              : 'bg-white border-slate-100 hover:border-primary/30'
          ]">
            <div class="flex items-center gap-3">
              <div class="h-8 w-8 rounded-full flex items-center justify-center text-white font-bold text-xs"
                :class="currentChatId === chat.id ? 'bg-primary' : 'bg-slate-300'">
                {{ chat.name.charAt(0).toUpperCase() }}
              </div>
              <div class="overflow-hidden">
                <h3 class="font-semibold text-slate-800 text-sm truncate">{{ chat.name }}</h3>
                <p class="text-[10px] text-slate-500 truncate">Ativo</p>
              </div>
            </div>
          </div>
        </div>
      </div>

      <!-- User Profile -->
      <div class="p-4 border-t border-slate-100 bg-slate-50">
        <div class="flex items-center justify-between">
          <div class="flex items-center gap-3">
            <div class="h-10 w-10 bg-primary rounded-full flex items-center justify-center text-white font-bold">
              A
            </div>
            <div>
              <p class="text-sm font-semibold text-slate-800">Atendente</p>
              <p class="text-xs text-green-600 flex items-center gap-1">
                <span class="h-1.5 w-1.5 bg-green-600 rounded-full"></span> Online
              </p>
            </div>
          </div>
          <button @click="openHistory" title="Histórico"
            class="p-2 text-slate-400 hover:text-primary hover:bg-primary/10 rounded-lg transition-colors">
            <svg xmlns="http://www.w3.org/2000/svg" class="h-6 w-6" fill="none" viewBox="0 0 24 24"
              stroke="currentColor">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
                d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          </button>
        </div>
      </div>
    </aside>

    <!-- Main Chat Area -->
    <main class="flex-1 flex flex-col bg-slate-50/50">
      <div v-if="currentChat" class="flex-1 flex flex-col h-full">
        <!-- Chat Header -->
        <header class="bg-white border-b border-slate-200 px-6 py-4 flex justify-between items-center shadow-sm">
          <div class="flex items-center gap-4">
            <div
              class="h-10 w-10 bg-secondary/10 rounded-full flex items-center justify-center text-secondary font-bold text-lg">
              {{ currentChat.name.charAt(0).toUpperCase() }}
            </div>
            <div>
              <h2 class="font-bold text-slate-800">{{ currentChat.name }}</h2>
              <p class="text-xs text-slate-500">Sessão Ativa</p>
            </div>
          </div>
          <button @click="endChat"
            class="text-red-500 hover:bg-red-50 px-3 py-1 rounded-lg text-sm font-medium transition-colors">
            Encerrar
          </button>
        </header>

        <!-- Messages -->
        <div ref="messagesContainer" class="flex-1 overflow-y-auto p-6 space-y-4">
          <div v-for="(msg, index) in currentMessages" :key="index"
            :class="['flex', msg.sender === 'attendant' ? 'justify-end' : 'justify-start']">
            <div :class="[
              'max-w-[70%] px-5 py-3 rounded-2xl shadow-sm',
              msg.sender === 'attendant'
                ? 'bg-primary text-white rounded-br-none'
                : 'bg-white text-slate-800 rounded-bl-none border border-slate-200'
            ]">
              <p v-if="msg.type === 'text'" class="leading-relaxed">{{ msg.text }}</p>
              <audio v-else-if="msg.type === 'audio'" :src="msg.text" controls class="max-w-full"></audio>
              <img v-else-if="msg.type === 'image'" :src="msg.text" class="max-w-64 rounded-lg cursor-pointer"
                @click="window.open(msg.text, '_blank')" />
              <span
                :class="['text-[10px] block mt-1 text-right', msg.sender === 'attendant' ? 'text-primary-light' : 'text-slate-400']">
                {{ new Date(msg.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) }}
              </span>
            </div>
          </div>
        </div>

        <!-- Input Area -->
        <div class="bg-white border-t border-slate-200 p-6">
          <div class="flex gap-4">

            <!-- Image Upload -->
            <input type="file" ref="imageInput" accept="image/*" class="hidden" @change="handleImageUpload" />
            <button @click="triggerImageUpload" :disabled="isUploadingImage"
              class="p-3 rounded-xl bg-slate-100 text-slate-500 hover:text-primary hover:bg-primary/10 transition-colors disabled:opacity-50">
              <svg xmlns="http://www.w3.org/2000/svg" class="h-6 w-6" fill="none" viewBox="0 0 24 24"
                stroke="currentColor">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
                  d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
              </svg>
            </button>

            <input v-model="currentMessage" @keyup.enter="sendMessage" placeholder="Escreva sua mensagem..."
              class="flex-1 bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 focus:ring-2 focus:ring-primary/20 focus:border-primary outline-none transition-all" />

            <!-- Mic Button -->
            <button @click="toggleRecording"
              :class="['p-3 rounded-xl transition-colors', isRecording ? 'bg-red-500 text-white animate-pulse' : 'bg-slate-100 text-slate-500 hover:text-primary hover:bg-primary/10']">
              <svg v-if="!isRecording" xmlns="http://www.w3.org/2000/svg" class="h-6 w-6" fill="none"
                viewBox="0 0 24 24" stroke="currentColor">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
                  d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z" />
              </svg>
              <svg v-else xmlns="http://www.w3.org/2000/svg" class="h-6 w-6" fill="none" viewBox="0 0 24 24"
                stroke="currentColor">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
                  d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
                  d="M9 10a1 1 0 011-1h4a1 1 0 011 1v4a1 1 0 01-1 1h-4a1 1 0 01-1-1v-4z" />
              </svg>
            </button>

            <button @click="sendMessage" :disabled="!currentMessage.trim()"
              class="bg-primary hover:bg-primary-dark text-white px-6 py-3 rounded-xl font-semibold shadow-lg shadow-primary/20 disabled:opacity-50 disabled:cursor-not-allowed transition-all">
              Enviar
            </button>
          </div>
        </div>
      </div>

      <!-- Empty State -->
      <div v-else class="flex-1 flex flex-col items-center justify-center text-slate-400 p-8">
        <div class="bg-white p-8 rounded-full shadow-lg mb-6">
          <svg xmlns="http://www.w3.org/2000/svg" class="h-16 w-16 text-slate-300" fill="none" viewBox="0 0 24 24"
            stroke="currentColor">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5"
              d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
          </svg>
        </div>
        <h3 class="text-xl font-bold text-slate-700 mb-2">Nenhum chat selecionado</h3>
        <p class="max-w-sm text-center">Selecione um cliente da fila ou um atendimento ativo para continuar.</p>
      </div>
    </main>

    <!-- History Modal -->
    <div v-if="showHistory"
      class="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4 backdrop-blur-sm">
      <div class="bg-white rounded-2xl shadow-2xl w-full max-w-4xl h-[80vh] flex overflow-hidden flex-col">
        <div class="p-4 border-b border-slate-200 flex justify-between items-center bg-slate-50">
          <h2 class="text-lg font-bold text-slate-800 flex items-center gap-2">
            <svg xmlns="http://www.w3.org/2000/svg" class="h-5 w-5 text-slate-500" fill="none" viewBox="0 0 24 24"
              stroke="currentColor">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
                d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            Histórico de Atendimentos
          </h2>
          <button @click="closeHistory"
            class="text-slate-400 hover:text-slate-600 p-1 rounded-full hover:bg-slate-200 transition-colors">
            <svg xmlns="http://www.w3.org/2000/svg" class="h-6 w-6" fill="none" viewBox="0 0 24 24"
              stroke="currentColor">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <div class="flex-1 flex overflow-hidden">
          <!-- List -->
          <div class="w-1/3 border-r border-slate-200 overflow-y-auto bg-slate-50">
            <div v-if="closedChats.length === 0" class="p-8 text-center text-slate-400">
              Nenhum histórico encontrado.
            </div>
            <div v-for="chat in closedChats" :key="chat.id" @click="selectHistoryChat(chat)"
              :class="['p-4 border-b border-slate-100 cursor-pointer hover:bg-white transition-colors', selectedHistoryChat?.id === chat.id ? 'bg-white border-l-4 border-l-primary' : '']">
              <h3 class="font-semibold text-slate-800">{{ chat.name }}</h3>
              <p class="text-xs text-slate-500 mt-1">
                {{ new Date(chat.timestamp).toLocaleDateString() }}
                {{ new Date(chat.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) }}
              </p>
              <span
                class="inline-block mt-2 text-[10px] px-2 py-0.5 bg-slate-200 text-slate-600 rounded-full">Finalizado</span>
            </div>
          </div>

          <!-- Details -->
          <div class="flex-1 flex flex-col bg-white">
            <div v-if="selectedHistoryChat" class="flex-1 flex flex-col h-full">
              <div class="p-4 border-b border-slate-100 bg-slate-50/30">
                <h3 class="font-bold text-slate-800">{{ selectedHistoryChat.name }}</h3>
                <p class="text-xs text-slate-500">Visualizando histórico</p>
              </div>
              <div class="flex-1 overflow-y-auto p-6 space-y-4">
                <div v-for="(msg, index) in historyMessages" :key="index"
                  :class="['flex', msg.sender === 'attendant' ? 'justify-end' : 'justify-start']">
                  <div :class="[
                    'max-w-[70%] px-5 py-3 rounded-2xl shadow-sm',
                    msg.sender === 'attendant'
                      ? 'bg-slate-100 text-slate-800 rounded-br-none'
                      : 'bg-white text-slate-800 rounded-bl-none border border-slate-200'
                  ]">
                    <audio v-if="msg.type === 'audio'" :src="msg.text" controls class="max-w-full"></audio>
                    <img v-else-if="msg.type === 'image'" :src="msg.text" class="max-w-64 rounded-lg cursor-pointer"
                      @click="window.open(msg.text, '_blank')" />
                    <p v-else class="leading-relaxed">{{ msg.text }}</p>
                    <span class="text-[10px] block mt-1 text-right text-slate-400">
                      {{ new Date(msg.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) }}
                    </span>
                  </div>
                </div>
              </div>
            </div>
            <div v-else class="flex-1 flex items-center justify-center text-slate-400">
              <p>Selecione um atendimento para ver as mensagens</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
/* No custom CSS needed, using Tailwind */
</style>
