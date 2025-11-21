<script setup>
import { ref, onMounted, onUnmounted, nextTick, watch } from 'vue';
import { useRouter } from 'vue-router';
import { socket, SERVER_URL } from '../services/socket';

const router = useRouter();
const step = ref('welcome'); // welcome, queue, chat
const clientName = ref(localStorage.getItem('username') || '');
const joined = ref(false);
const queuePosition = ref(null);
const messages = ref([]);
const currentMessage = ref('');
const chatId = ref(null);
const attendantName = ref('');
const messagesContainer = ref(null);
const isRecording = ref(false);
const replyingTo = ref(null);
let mediaRecorder = null;
let audioChunks = [];

const scrollToBottom = async () => {
  await nextTick();
  if (messagesContainer.value) {
    messagesContainer.value.scrollTop = messagesContainer.value.scrollHeight;
  }
};

watch(messages, scrollToBottom, { deep: true });

onMounted(() => {
  socket.on('joined_queue', (data) => {
    console.log('Joined queue:', data);
    joined.value = true;
    step.value = 'queue';
    queuePosition.value = data.position;
  });

  socket.on('queue_update', (queue) => {
    console.log('Queue update:', queue);
    if (joined.value && !chatId.value) {
      const myIndex = queue.findIndex(c => c.id === socket.id);
      if (myIndex !== -1) {
        queuePosition.value = myIndex + 1;
      }
    }
  });

  socket.on('chat_started', (data) => {
    console.log('Chat started:', data);
    chatId.value = data.chatId;
    attendantName.value = data.attendant || 'Atendimento';
    queuePosition.value = null;
    step.value = 'chat';
  });

  socket.on('receive_message', (msg) => {
    messages.value.push(msg);
  });

  socket.on('chat_ended', () => {
    alert('Chat ended by support agent');
    location.reload();
  });
});

onUnmounted(() => {
  socket.off('joined_queue');
  socket.off('queue_update');
  socket.off('chat_started');
  socket.off('receive_message');
  socket.off('chat_ended');
});

const joinQueue = () => {
  console.log('Attempting to join queue. Name:', clientName.value);
  if (clientName.value.trim()) {
    console.log('Connecting socket...');
    socket.connect();
    console.log('Emitting join_queue...');
    socket.emit('join_queue', clientName.value);
    step.value = 'queue';
    console.log('Step set to queue');
  } else {
    console.warn('Client name is empty!');
    alert('Erro: Nome do cliente não encontrado. Por favor, faça login novamente.');
    router.push('/login');
  }
};

const sendMessage = () => {
  if (currentMessage.value.trim() && chatId.value) {
    const msg = {
      chatId: chatId.value,
      text: currentMessage.value,
      sender: 'client',
      type: 'text',
      replyTo: replyingTo.value ? {
        id: replyingTo.value.id,
        text: replyingTo.value.text,
        type: replyingTo.value.type,
        sender: replyingTo.value.sender
      } : null
    };
    socket.emit('send_message', msg);
    currentMessage.value = '';
    replyingTo.value = null;
  }
};

const setReplyTo = (msg) => {
  replyingTo.value = msg;
};

const cancelReply = () => {
  replyingTo.value = null;
};

const handleEnterKey = (event) => {
  if (event.ctrlKey) {
    // Ctrl+Enter: add new line (default behavior)
    return;
  } else {
    // Enter without Ctrl: send message
    event.preventDefault();
    sendMessage();
  }
};

const autoResize = (event) => {
  const textarea = event.target;
  textarea.style.height = 'auto';
  textarea.style.height = textarea.scrollHeight + 'px';
};

const startRecording = async () => {
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
          chatId: chatId.value,
          text: audioUrl,
          sender: 'client',
          type: 'audio'
        };
        socket.emit('send_message', msg);
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

const logout = () => {
  localStorage.removeItem('authToken');
  localStorage.removeItem('username');
  socket.disconnect();
  router.push('/login');
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
      chatId: chatId.value,
      text: imageUrl,
      sender: 'client',
      type: 'image'
    };
    socket.emit('send_message', msg);
  } catch (err) {
    console.error("Error uploading image:", err);
    alert("Erro ao enviar imagem.");
  } finally {
    isUploadingImage.value = false;
    event.target.value = ''; // Reset input
  }
};
</script>

<template>
  <div class="min-h-screen bg-slate-50 flex flex-col">
    <!-- Welcome Screen -->
    <div v-if="step === 'welcome'" class="flex-1 flex flex-col items-center justify-center p-8 text-center bg-white">
      <div class="w-24 h-24 bg-primary/10 rounded-full flex items-center justify-center mb-8 animate-pulse">
        <svg xmlns="http://www.w3.org/2000/svg" class="h-12 w-12 text-primary" fill="none" viewBox="0 0 24 24"
          stroke="currentColor">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
            d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
        </svg>
      </div>
      <h1 class="text-3xl font-bold text-slate-800 mb-2">Olá, {{ clientName }}</h1>
      <p class="text-slate-500 mb-8 max-w-xs mx-auto">Estamos prontos para te atender. Clique abaixo para entrar na
        fila.</p>

      <div class="w-full max-w-xs space-y-4">
        <button @click="joinQueue"
          class="w-full bg-primary hover:bg-primary-dark text-white font-bold py-4 rounded-2xl shadow-xl shadow-primary/20 transition-all transform hover:scale-[1.02] active:scale-[0.98]">
          Iniciar Atendimento
        </button>

        <button @click="logout"
          class="w-full bg-white border border-slate-200 text-slate-600 font-medium py-3 rounded-2xl hover:bg-slate-50 transition-colors">
          Sair
        </button>
      </div>
    </div>

    <!-- Queue Screen -->
    <div v-else-if="step === 'queue'"
      class="flex-1 flex flex-col items-center justify-center p-6 text-center space-y-8">
      <div class="relative">
        <div class="absolute inset-0 bg-primary/20 rounded-full animate-ping"></div>
        <div class="relative bg-white p-6 rounded-full shadow-xl">
          <svg xmlns="http://www.w3.org/2000/svg" class="h-12 w-12 text-primary" fill="none" viewBox="0 0 24 24"
            stroke="currentColor">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
              d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
        </div>
      </div>

      <div class="space-y-2">
        <h2 class="text-2xl font-bold text-slate-900">Esperando por um atendente...</h2>
        <p class="text-slate-500 max-w-xs mx-auto">Estamos conectando você ao próximo atendente disponível.</p>
      </div>

      <div v-if="queuePosition" class="bg-white px-6 py-3 rounded-full shadow-sm border border-slate-100">
        <span class="text-slate-600">Sua posição: </span>
        <span class="font-bold text-primary text-lg">#{{ queuePosition }}</span>
      </div>
    </div>

    <!-- Chat Screen -->
    <div v-else-if="step === 'chat'" class="flex-1 flex flex-col h-screen">
      <!-- Header -->
      <header class="bg-white border-b border-slate-100 px-4 py-3 flex items-center space-x-4 shadow-sm z-10">
        <div class="h-10 w-10 bg-primary/10 rounded-full flex items-center justify-center text-primary font-bold">
          {{ attendantName.charAt(0) }}
        </div>
        <div>
          <h3 class="font-semibold text-slate-900">{{ attendantName }}</h3>
          <div class="flex items-center space-x-1">
            <span class="h-2 w-2 bg-accent rounded-full"></span>
            <span class="text-xs text-slate-500">Online</span>
          </div>
        </div>
      </header>

      <!-- Messages -->
      <div ref="messagesContainer" class="flex-1 overflow-y-auto p-4 space-y-4 bg-slate-50"
        :class="[replyingTo ? 'max-h-[calc(100vh-14rem)]' : 'max-h-[calc(100vh-9.5rem)]']">
        <div v-for="(msg, index) in messages" :key="index"
          :class="['flex', msg.sender === 'client' ? 'justify-end' : 'justify-start']">
          <div @click="setReplyTo(msg)" :class="[
            'max-w-[80%] px-4 py-2 rounded-2xl shadow-sm cursor-pointer hover:opacity-80 transition-opacity',
            msg.sender === 'client'
              ? 'bg-primary text-white rounded-br-none'
              : 'bg-white text-slate-800 rounded-bl-none border border-slate-100'
          ]">
            <!-- Quoted Message -->
            <div v-if="msg.replyTo" :class="[
              'mb-2 p-2 rounded-lg border-l-2 text-xs opacity-70',
              msg.sender === 'client' ? 'bg-primary-dark/20 border-white' : 'bg-slate-100 border-slate-400'
            ]">
              <div class="font-semibold">{{ msg.replyTo.sender === 'client' ? clientName : attendantName }}</div>
              <div v-if="msg.replyTo.type === 'text'" class="truncate">{{ msg.replyTo.text }}</div>
              <div v-else-if="msg.replyTo.type === 'audio'" class="italic">🎤 Áudio</div>
              <div v-else-if="msg.replyTo.type === 'image'" class="italic">📷 Imagem</div>
            </div>

            <p v-if="msg.type === 'text'" class="break-words whitespace-pre-wrap">{{ msg.text }}</p>
            <audio @click="setReplyTo(msg)" v-else-if="msg.type === 'audio'" :src="msg.text" controls
              class="max-w-full"></audio>
            <img @click="setReplyTo(msg)" v-else-if="msg.type === 'image'" :src="msg.text"
              class="max-w-64 rounded-lg cursor-pointer" @click.stop="window.open(msg.text, '_blank')" />
            <span
              :class="['text-[10px] block mt-1', msg.sender === 'client' ? 'text-primary-light' : 'text-slate-400']">
              {{ new Date(msg.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) }}
            </span>
          </div>
        </div>
      </div>

      <!-- Input Area -->
      <div class="bg-white border-t border-slate-100 p-4">
        <!-- Reply Indicator -->
        <div v-if="replyingTo" class="mb-2 bg-slate-100 rounded-lg p-3 flex items-start justify-between">
          <div class="flex-1">
            <div class="text-xs font-semibold text-slate-600 mb-1">Respondendo a {{ replyingTo.sender === 'client' ?
              clientName : attendantName }}</div>
            <div v-if="replyingTo.type === 'text'" class="text-sm text-slate-700 truncate">
              {{ replyingTo.text }}
            </div>
            <div v-else-if="replyingTo.type === 'audio'" class="text-sm text-slate-700 italic">🎤 Áudio</div>
            <div v-else-if="replyingTo.type === 'image'" class="text-sm text-slate-700 italic">📷 Imagem</div>
          </div>
          <button @click="cancelReply" class="text-slate-400 hover:text-slate-600 ml-2">
            <svg xmlns="http://www.w3.org/2000/svg" class="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
              <path fill-rule="evenodd"
                d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z"
                clip-rule="evenodd" />
            </svg>
          </button>
        </div>

        <div
          class="flex items-center space-x-2 bg-slate-50 rounded-full px-4 py-2 border border-slate-200 focus-within:border-primary focus-within:ring-1 focus-within:ring-primary/20 transition-all">

          <!-- Image Upload -->
          <input type="file" ref="imageInput" accept="image/*" class="hidden" @change="handleImageUpload" />
          <button @click="triggerImageUpload" :disabled="isUploadingImage"
            class="text-slate-400 hover:text-primary transition-colors disabled:opacity-50">
            <svg xmlns="http://www.w3.org/2000/svg" class="h-6 w-6" fill="none" viewBox="0 0 24 24"
              stroke="currentColor">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
                d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
            </svg>
          </button>

          <textarea v-model="currentMessage" @keyup.enter="handleEnterKey" placeholder="Type a message..."
            class="flex-1 bg-transparent border-none outline-none text-slate-900 placeholder-slate-400 resize-none max-h-32 overflow-y-auto"
            rows="1" @input="autoResize"></textarea>

          <!-- Mic Button -->
          <button @click="toggleRecording"
            :class="['p-2 rounded-full transition-colors', isRecording ? 'bg-red-500 text-white animate-pulse' : 'text-slate-400 hover:text-primary']">
            <svg v-if="!isRecording" xmlns="http://www.w3.org/2000/svg" class="h-5 w-5" fill="none" viewBox="0 0 24 24"
              stroke="currentColor">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
                d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z" />
            </svg>
            <svg v-else xmlns="http://www.w3.org/2000/svg" class="h-5 w-5" fill="none" viewBox="0 0 24 24"
              stroke="currentColor">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
                d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
                d="M9 10a1 1 0 011-1h4a1 1 0 011 1v4a1 1 0 01-1 1h-4a1 1 0 01-1-1v-4z" />
            </svg>
          </button>

          <button @click="sendMessage" :disabled="!currentMessage.trim()"
            class="p-2 bg-primary text-white rounded-full hover:bg-primary-dark disabled:opacity-50 disabled:cursor-not-allowed transition-colors">
            <svg xmlns="http://www.w3.org/2000/svg" class="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
              <path
                d="M10.894 2.553a1 1 0 00-1.788 0l-7 14a1 1 0 001.169 1.409l5-1.429A1 1 0 009 15.571V11a1 1 0 112 0v4.571a1 1 0 00.725.962l5 1.428a1 1 0 001.17-1.408l-7-14z" />
            </svg>
          </button>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
/* No custom CSS needed, using Tailwind */
</style>
