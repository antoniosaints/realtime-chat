import { createRouter, createWebHistory } from "vue-router";
import ClientChat from "./views/ClientChat.vue";
import AttendantDashboard from "./views/AttendantDashboard.vue";

const routes = [
  {
    path: "/",
    name: "ClientChat",
    component: ClientChat,
  },
  {
    path: "/attendant",
    name: "AttendantDashboard",
    component: AttendantDashboard,
  },
];

const router = createRouter({
  history: createWebHistory(),
  routes,
});

export default router;
