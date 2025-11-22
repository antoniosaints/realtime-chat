<script setup>
import { ref, onMounted } from 'vue'
import io from 'socket.io-client'
import { SERVER_URL } from '../services/socket';

const socket = ref(null)
const connected = ref(false)

onMounted(() => {
  // Connect to the server
  socket.value = io(SERVER_URL)

  socket.value.on('connect', () => {
    connected.value = true
    console.log('Connected to server')
  })

  socket.value.on('disconnect', () => {
    connected.value = false
    console.log('Disconnected from server')
  })
})
</script>

<template>
  <div>
    <!-- <nav class="fixed top-0 right-1/2 p-4 z-50 opacity-20 hover:opacity-100 transition-opacity">
      <div
        class="bg-white/80 backdrop-blur-sm rounded-full px-4 py-2 shadow-sm border border-slate-200 text-xs font-medium flex gap-2">
        <router-link to="/" class="text-slate-600 hover:text-primary"
          active-class="text-primary font-bold">Client</router-link>
        <span class="text-slate-300">|</span>
        <router-link to="/attendant" class="text-slate-600 hover:text-primary"
          active-class="text-primary font-bold">Attendant</router-link>
      </div>
    </nav> -->
    <router-view></router-view>
  </div>
</template>

<style>
body {
  font-family: sans-serif;
  margin: 0;
}
</style>
