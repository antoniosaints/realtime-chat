import { createRouter, createWebHistory } from "vue-router";
import ClientChat from "./views/ClientChat.vue";
import AttendantDashboard from "./views/AttendantDashboard.vue";
import Login from "./views/Login.vue";

const routes = [
  { path: "/", redirect: "/login" }, // Redirect root to login
  { path: "/login", component: Login },
  { path: "/chat", component: ClientChat, meta: { requiresAuth: true } },
  { path: "/attendant", component: AttendantDashboard }, // Attendant might need separate auth later
];

const router = createRouter({
  history: createWebHistory(),
  routes,
});

router.beforeEach((to, from, next) => {
  const isAuthenticated = localStorage.getItem("authToken");

  if (to.meta.requiresAuth && !isAuthenticated) {
    next("/login");
  } else if (to.path === "/login" && isAuthenticated) {
    next("/chat");
  } else {
    next();
  }
});

export default router;
