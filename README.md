# SincroLista 🛒

Una aplicación de lista de supermercado inteligente diseñada para parejas que necesitan sincronización en tiempo real y organización automática.

## ✨ Características

- **Sincronización en Tiempo Real:** Comparte tu lista con tu pareja y vean los cambios instantáneamente gracias a Firebase.
- **Categorización Inteligente (Pasillos):** Los productos se organizan automáticamente en secciones del supermercado.
- **Modo Tienda (Rayo):** Una interfaz optimizada con barra de progreso para cuando estás comprando.
- **Sugerencias de IA:** Recomendaciones basadas en tus hábitos de compra y productos básicos esenciales.
- **Gestión de Prioridades:** Marca artículos urgentes o deja que la IA detecte lo que es básico.
- **Diseño Minimalista:** Listas limpias y fáciles de leer en cualquier dispositivo.

## 🚀 Tecnologías

- **Frontend:** React + Vite + Tailwind CSS
- **Animaciones:** Framer Motion
- **Base de Datos & Auth:** Firebase (Firestore & Google Auth)
- **IA:** Google Gemini (Generative AI)

## 🛠️ Instalación y Configuración

1.  **Clona el repositorio:**
    ```bash
    git clone <tu-url-de-github>
    cd sincrolista
    ```

2.  **Instala las dependencias:**
    ```bash
    npm install
    ```

3.  **Configura Firebase:**
    - Crea un proyecto en [Firebase Console](https://console.firebase.google.com/).
    - Habilita **Firestore** y **Google Auth**.
    - Copia tus credenciales en un archivo `src/firebase-config.ts` o usa las variables de entorno indicadas en `.env.example`.

4.  **Inicia el servidor de desarrollo:**
    ```bash
    npm run dev
    ```

## Configuración local

Copia `.env.example` a `.env` y completa las variables para ejecutar el servidor local. `GEMINI_API_KEY` y `VAPID_PRIVATE_KEY` solo se usan en el servidor; no las incluyas en variables con prefijo `VITE_`.

## 🌐 Despliegue en Vercel

1. Sube tu código a GitHub.
2. Conecta tu repositorio en [Vercel](https://vercel.com/).
3. Configura en Vercel estas variables de entorno:
   - `GEMINI_API_KEY`: clave de Gemini; se usa solo en el servidor.
   - `FIREBASE_API_KEY`: la misma clave web de Firebase usada como `VITE_FIREBASE_API_KEY`.
   - `VAPID_PUBLIC_KEY` y `VAPID_PRIVATE_KEY`: un par VAPID nuevo para Web Push. Guarda la privada solo en Vercel.
   - `VAPID_SUBJECT`: dirección `mailto:` de contacto.
4. Aplica las variables a Production y Preview y vuelve a desplegar. Si la clave VAPID anterior ya fue publicada, rótala y deja que cada navegador vuelva a suscribirse.

---
Creado con ❤️ para compras más inteligentes.
