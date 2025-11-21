<script setup>
import { ref, onMounted, onUnmounted, nextTick, watch } from 'vue';
import { socket } from '../services/socket';

const name = ref('');
const joined = ref(false);
const queuePosition = ref(null);
const messages = ref([]);
const currentMessage = ref('');
const chatId = ref(null);
const attendantName = ref('');
const messagesContainer = ref(null);

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
    attendantName.value = data.attendant || 'Support Agent';
    queuePosition.value = null;
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
  if (name.value.trim()) {
    socket.emit('join_queue', name.value);
  }
};

const sendMessage = () => {
  if (currentMessage.value.trim() && chatId.value) {
    const msg = {
      chatId: chatId.value,
      text: currentMessage.value,
      sender: 'client'
    };
    socket.emit('send_message', msg);
    currentMessage.value = '';
  }
};
</script>

<template>
  <div class="min-h-screen bg-slate-50 flex flex-col">
    <!-- Login Screen -->
    <div v-if="!joined && !chatId" class="flex-1 flex items-center justify-center p-6">
      <div class="bg-white w-full max-w-md rounded-2xl shadow-xl p-8 space-y-6">
        <div class="text-center space-y-2">
          <h1 class="text-3xl font-bold text-slate-900">Bem vindo</h1>
          <p class="text-slate-500">Por favor, digite seu nome para iniciar a conversa com o suporte.</p>
        </div>

        <div class="space-y-4">
          <div>
            <label class="block text-sm font-medium text-slate-700 mb-1">Nome</label>
            <input v-model="name" type="text"
              class="w-full px-4 py-3 rounded-lg border border-slate-200 focus:border-primary focus:ring-2 focus:ring-primary/20 outline-none transition-all"
              placeholder="John Doe" @keyup.enter="joinQueue" />
          </div>
          <button @click="joinQueue"
            class="w-full bg-primary hover:bg-primary-dark text-white font-semibold py-3 rounded-lg transition-colors shadow-lg shadow-primary/30">
            Iniciar Chat
          </button>
        </div>
      </div>
    </div>

    <!-- Queue Screen -->
    <div v-else-if="joined && !chatId"
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
    <div v-else class="flex-1 flex flex-col h-screen">
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
      <div ref="messagesContainer" class="flex-1 overflow-y-auto p-4 space-y-4 bg-slate-50">
        <div v-for="(msg, index) in messages" :key="index"
          :class="['flex', msg.sender === 'client' ? 'justify-end' : 'justify-start']">
          <div :class="[
            'max-w-[80%] px-4 py-2 rounded-2xl shadow-sm',
            msg.sender === 'client'
              ? 'bg-primary text-white rounded-br-none'
              : 'bg-white text-slate-800 rounded-bl-none border border-slate-100'
          ]">
            <p>{{ msg.text }}</p>
            <span
              :class="['text-[10px] block mt-1', msg.sender === 'client' ? 'text-primary-light' : 'text-slate-400']">
              {{ new Date(msg.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) }}
            </span>
          </div>
        </div>
      </div>

      <!-- Input Area -->
      <div class="bg-white border-t border-slate-100 p-4">
        <div
          class="flex items-center space-x-2 bg-slate-50 rounded-full px-4 py-2 border border-slate-200 focus-within:border-primary focus-within:ring-1 focus-within:ring-primary/20 transition-all">
          <input v-model="currentMessage" @keyup.enter="sendMessage" placeholder="Type a message..."
            class="flex-1 bg-transparent border-none focus:ring-0 text-slate-900 placeholder-slate-400" />
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
