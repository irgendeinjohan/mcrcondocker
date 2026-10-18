import { mount } from "svelte";
import App from "./App.svelte";
import "./app.css";

mount(App, { target: document.getElementById("app")! });

// Service Worker nur über HTTPS (im Heimnetz per HTTP bewusst nicht).
if ("serviceWorker" in navigator && window.isSecureContext && location.protocol === "https:") {
  navigator.serviceWorker.register("/sw.js").catch(() => {});
}
