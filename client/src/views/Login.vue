<script setup>
import { ref } from 'vue';
import { useRouter } from 'vue-router';

const router = useRouter();
const username = ref('');
const password = ref('');
const error = ref('');
const loading = ref(false);

const handleLogin = async () => {
    error.value = '';
    loading.value = true;

    try {
        // PLACEHOLDER: Replace with actual API call
        // const response = await fetch('YOUR_API_URL/login', {
        //   method: 'POST',
        //   headers: { 'Content-Type': 'application/json' },
        //   body: JSON.stringify({ username: username.value, password: password.value })
        // });
        // const data = await response.json();

        // MOCK LOGIN FOR DEMO
        // Simulate network delay
        await new Promise(resolve => setTimeout(resolve, 1000));

        if (username.value && password.value) {
            // Mock success
            const mockToken = `mock-token-${Date.now()}`;
            localStorage.setItem('authToken', mockToken);
            localStorage.setItem('username', username.value);
            router.push('/chat');
        } else {
            throw new Error('Invalid credentials');
        }

    } catch (err) {
        error.value = 'Falha no login. Verifique suas credenciais.';
        console.error(err);
    } finally {
        loading.value = false;
    }
};
</script>

<template>
    <div class="min-h-screen bg-slate-100 flex items-center justify-center p-4">
        <div class="bg-white p-8 rounded-2xl shadow-xl w-full max-w-md">
            <div class="text-center mb-8">
                <div class="h-16 w-16 bg-primary/10 rounded-full flex items-center justify-center mx-auto mb-4">
                    <svg xmlns="http://www.w3.org/2000/svg" class="h-8 w-8 text-primary" fill="none" viewBox="0 0 24 24"
                        stroke="currentColor">
                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
                            d="M11 16l-4-4m0 0l4-4m-4 4h14m-5 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h7a3 3 0 013 3v1" />
                    </svg>
                </div>
                <h1 class="text-2xl font-bold text-slate-800">Bem-vindo</h1>
                <p class="text-slate-500 mt-2">Faça login para iniciar o atendimento</p>
            </div>

            <form @submit.prevent="handleLogin" class="space-y-6">
                <div>
                    <label class="block text-sm font-medium text-slate-700 mb-2">Usuário</label>
                    <input v-model="username" type="text" required
                        class="w-full px-4 py-3 rounded-xl border border-slate-200 focus:ring-2 focus:ring-primary/20 focus:border-primary outline-none transition-all"
                        placeholder="Seu usuário" />
                </div>

                <div>
                    <label class="block text-sm font-medium text-slate-700 mb-2">Senha</label>
                    <input v-model="password" type="password" required
                        class="w-full px-4 py-3 rounded-xl border border-slate-200 focus:ring-2 focus:ring-primary/20 focus:border-primary outline-none transition-all"
                        placeholder="Sua senha" />
                </div>

                <div v-if="error" class="text-red-500 text-sm text-center bg-red-50 p-3 rounded-lg">
                    {{ error }}
                </div>

                <button type="submit" :disabled="loading"
                    class="w-full bg-primary hover:bg-primary-dark text-white font-bold py-3 rounded-xl shadow-lg shadow-primary/20 transition-all disabled:opacity-70 disabled:cursor-not-allowed flex items-center justify-center">
                    <svg v-if="loading" class="animate-spin h-5 w-5 mr-3 text-white" xmlns="http://www.w3.org/2000/svg"
                        fill="none" viewBox="0 0 24 24">
                        <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4">
                        </circle>
                        <path class="opacity-75" fill="currentColor"
                            d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z">
                        </path>
                    </svg>
                    {{ loading ? 'Entrando...' : 'Entrar' }}
                </button>
            </form>
        </div>
    </div>
</template>
