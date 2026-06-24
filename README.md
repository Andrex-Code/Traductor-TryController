# Traductor iKono PT-BR

Extensión de navegador para apoyar atención en iKono Chat cuando llegan clientes en portugués brasileño.

## Qué hace

- Agrega menú contextual al seleccionar texto:
  - **Traducir PT-BR → Español** para mensajes del cliente.
  - **Falar Español → PT-BR** para texto que el asesor está escribiendo.
- Muestra una ventana flotante con el texto original y la traducción.
- Permite copiar la traducción.
- Intenta reemplazar el texto seleccionado cuando se usa **Falar** dentro de un campo editable.
- Funciona como extensión local de Chrome/Edge.
- Puede trabajar en modo gratuito con:
  - **Modo básico offline**: diccionario de frases comunes.
  - **LibreTranslate local**: traducción completa corriendo en la propia máquina.

## Instalación en Chrome o Edge

1. Descarga o clona este repositorio.
2. Abre `chrome://extensions` o `edge://extensions`.
3. Activa **Modo desarrollador**.
4. Haz clic en **Cargar descomprimida**.
5. Selecciona la carpeta del proyecto.
6. Abre iKono Chat y selecciona un texto.
7. Clic derecho y usa la opción verde del traductor.

## Uso

### Traducir mensaje del cliente

1. Selecciona el mensaje en portugués.
2. Clic derecho.
3. Haz clic en **Traducir PT-BR → Español**.
4. Verás una ventana flotante con la traducción.

### Escribir respuesta en portugués

1. Escribe tu respuesta en español en el campo de mensaje.
2. Selecciona el texto que escribiste.
3. Clic derecho.
4. Haz clic en **Falar Español → PT-BR**.
5. La extensión intentará reemplazar el texto seleccionado por portugués brasileño.

## Traducción gratuita completa con LibreTranslate local

El modo offline incluido solo sirve para frases comunes. Para traducción real y gratuita, puedes correr LibreTranslate localmente.

Ejemplo con Docker:

```bash
docker run -ti --rm -p 5000:5000 libretranslate/libretranslate
```

Luego en la extensión:

1. Abre las opciones de la extensión.
2. Cambia el proveedor a **LibreTranslate local**.
3. Usa la URL:

```txt
http://localhost:5000/translate
```

## Archivos principales

```txt
manifest.json
src/background.js
src/content.js
src/content.css
src/options.html
src/options.css
src/options.js
src/popup.html
icons/
```

## Nota para la empresa

Esta extensión está pensada como prototipo gratuito para presentar al equipo. Para producción se recomienda:

- Limitar `host_permissions` al dominio exacto de iKono.
- Revisar políticas internas de privacidad.
- Validar que los textos de clientes no se envíen a servicios externos no aprobados.
- Usar LibreTranslate local o un servidor interno si se manejan datos sensibles.
