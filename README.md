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

## 🌐 Despliegue en Vercel

1. Sube tu código a GitHub.
2. Conecta tu repositorio en [Vercel](https://vercel.com/).
3. Asegúrate de añadir las **Environment Variables** (Variables de Entorno) que configuraste para Firebase en el panel de Vercel.

---
Creado con ❤️ para compras más inteligentes.
