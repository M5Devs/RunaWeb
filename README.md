<div align="center">

# 🎮 RunaWeb

### Standalone, Zero-Backend HTML5 & WebGL Game Runner

[![License: GPL v3](https://img.shields.io/badge/License-GPLv3-blue.svg)](https://www.gnu.org/licenses/gpl-3.0)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.4-blue?logo=typescript&logoColor=white)](https://www.typescriptlang.org/)
[![Vite](https://img.shields.io/badge/Vite-5.2-646CFF?logo=vite&logoColor=white)](https://vitejs.dev/)
[![PWA Ready](https://img.shields.io/badge/PWA-Offline%20Ready-success?logo=pwa&logoColor=white)]()
[![Deploy](https://img.shields.io/badge/Demo-Live%20on%20GitHub%20Pages-brightgreen)](https://m5devs.github.io/RunaWeb/)

**Play web games offline with zero servers, zero setup, and zero CORS headaches.**

[🚀 Play Live Demo](https://m5devs.github.io/RunaWeb/) · [Report Bug](https://github.com/M5Devs/RunaWeb/issues) · [Request Feature](https://github.com/M5Devs/RunaWeb/issues)

</div>

---

## ✨ Overview

Running exported HTML5 and WebGL games locally often results in frustrating browser security errors (`CORS`, `file:///` restrictions, or missing web servers). 

**RunaWeb** solves this completely by embedding an in-browser virtual server and runtime. It intercepts asset requests via Service Workers and shared `CacheStorage`, allowing games to run seamlessly offline—directly in your browser or installed as a standalone PWA.

---

## 🌟 Key Features

- **🚀 Zero-Server Architecture:** Drag & drop any game `.zip` file—runs in-memory without external hosting or CORS errors.
- **📴 100% Offline & PWA:** Installable directly to your home screen or desktop. Works completely in Airplane mode.
- **🕹️ On-Screen Virtual Gamepad:** Translucent Cyberpunk touch controls (D-Pad & Action buttons) that simulate keyboard events on mobile devices.
- **🎮 Physical Controller Support:** Native Gamepad API integration for Bluetooth and USB controllers (PlayStation, Xbox, 8BitDo).
- **💾 Persistent Arcade Library:** Saves uploaded games in `IndexedDB` (Afterplay-style) with auto-detected box art thumbnails.
- **📦 Save State Manager:** Export and import game `localStorage` save states across devices.
- **📺 Retro Visuals & Theater Mode:** Full-viewport immersion with CRT scanline filter toggles and 4:3 / 16:9 aspect ratio controls.
- **⚡ Blazing Fast:** Powered by `fflate` for near-instant client-side zip decompression without frame drops.

---

## 🛠️ Tech Stack

- **Core Engine:** TypeScript, Vite, Modern Web APIs (Service Worker, CacheStorage, Gamepad API)
- **Archive Engine:** [fflate](https://github.com/101arrowz/fflate) (Ultra-fast in-memory zip handling)
- **Storage:** IndexedDB + CacheStorage
- **Deployment:** GitHub Pages via automated GitHub Actions CI/CD

---

## 🚀 Getting Started Locally

Clone the repository and spin up the development environment:

```bash
# 1. Clone the repo
git clone https://github.com/M5Devs/RunaWeb.git

# 2. Navigate to project
cd RunaWeb

# 3. Install dependencies
npm install

# 4. Start dev server
npm run dev
```

Build for production:
```bash
npm run build
```

---

## 🗺️ Roadmap

- [x] Service Worker zero-CORS runtime pipeline
- [x] Responsive Cyberpunk UI & Auto-Theater Mode
- [x] On-screen Virtual Touch Gamepad & Physical Gamepad API
- [x] IndexedDB game library & offline PWA caching
- [x] Save data export / import
- [ ] Standalone Desktop & Android builds via **Tauri 2 (Rust backend)**
- [ ] Built-in **WASM-4** fantasy console cartridge support

---

## 📄 License

Distributed under the **GNU General Public License v3.0 (GPL-3.0)**. See `LICENSE` for more information.

<div align="center">
  <sub>Crafted with passion by <a href="https://github.com/M5Devs">M5Devs</a> 🎮</sub>
</div>
