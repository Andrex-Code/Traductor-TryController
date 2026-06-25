# Despliegue del backend en Vercel

## Objetivo

La extension no debe guardar claves en el navegador de los asesores. El navegador solo llama a un backend en Vercel. Vercel guarda la variable privada y el backend llama al proveedor de IA.

## Variables requeridas en Vercel

Configura estas variables en el proyecto de Vercel:

```txt
OPENAI_API_KEY
OPENAI_TRANSLATION_MODEL=gpt-4o-mini
OPENAI_TRANSCRIPTION_MODEL=gpt-4o-mini-transcribe
```

`OPENAI_API_KEY` debe agregarse solo en Vercel, nunca dentro del codigo de la extension.

## Pasos recomendados

1. Entra a Vercel.
2. Importa el repositorio de GitHub `Andrex-Code/Traductor-TryController`.
3. En Project Settings, abre Environment Variables.
4. Agrega `OPENAI_API_KEY` para Production, Preview y Development si aplica.
5. Agrega los modelos opcionales.
6. Haz Deploy.
7. Copia la URL final de produccion.
8. Si la URL no es `https://traductor-try-controller.vercel.app`, actualiza `backendUrl` en `src/background.js` y `src/options.js`.
9. Descarga el ZIP del repositorio y entregalo a los asesores.

## Endpoints

```txt
POST /api/translate
POST /api/transcribe
```

## Instalacion de la extension

1. Descargar ZIP desde GitHub.
2. Descomprimir.
3. Abrir `chrome://extensions` o `edge://extensions`.
4. Activar modo desarrollador.
5. Cargar descomprimida.
6. Seleccionar la carpeta donde esta `manifest.json`.
