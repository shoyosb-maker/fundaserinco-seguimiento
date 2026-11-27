# Fundaserinco · Sistema de Seguimiento

Aplicación web de seguimiento personal para **Fundaserinco**: tablero kanban, tareas, métricas, roadmap, reuniones y repositorios de proyectos, con la identidad visual oficial de la marca (Tech Blue `#0086C8`, Solar Coral `#F48A56`, Orbit Cyan `#4EA8DE`, Plus Jakarta Sans y favicons oficiales).

Funciona **sin backend** (los datos se guardan en el navegador) y opcionalmente se conecta a **Google Sheets** como base de datos y a **Google Calendar** para crear eventos con enlace de **Google Meet**.

> El estado detallado de lo hecho y lo pendiente está en [`estado-del-proyecto.txt`](./estado-del-proyecto.txt).

---

## 1. Abrir la aplicación

### Opción recomendada: servidor local

```bash
# Python 3
python -m http.server 8000

# o con Node
npx serve .
```

Luego abre <http://localhost:8000>.

También puedes abrir `index.html` con doble clic, pero un servidor local evita restricciones del navegador (por ejemplo, portapapeles).

### Publicar en GitHub Pages

Esta carpeta ya se entrega con un repositorio Git local en la rama `main` y un commit inicial. Solo falta crear el repositorio remoto y hacer push:

```bash
git remote add origin https://github.com/<usuario>/<repositorio>.git
git push -u origin main
```

Si partes desde cero (por ejemplo, clonando en otro equipo):

```bash
git init -b main
git add .
git commit -m "Sistema de seguimiento Fundaserinco v0.1.0"
git remote add origin https://github.com/<usuario>/<repositorio>.git
git push -u origin main
```

Después:

1. En GitHub: **Settings → Pages**.
2. En *Build and deployment* elige **Deploy from a branch**, rama `main`, carpeta `/ (root)`.
3. Guarda. La app quedará en `https://<usuario>.github.io/<repositorio>/`.

No hay build ni dependencias que instalar. No se sube ningún secreto: la URL y el token de Google se guardan solo en el navegador (`localStorage`).

---

## 2. Qué incluye

| Vista | Función |
|---|---|
| **Tablero** | Kanban con 5 estados, arrastrar y soltar, prioridades, etiquetas, proyectos asignados, puntos, responsable, vencimiento y filtros (panel de proyectos con selección múltiple y calendario de día de cierre). Cuadrícula adaptable (1/2/3/5 columnas) sin scroll horizontal. |
| **UI glass** | Superficies translúcidas, desenfoque y desplegables personalizados con animación, teclado y modo claro/oscuro. |
| **Mis tareas** | Lista con búsqueda, filtros (panel de proyectos y calendario de día de cierre incluidos), orden y exportación a CSV. |
| **Métricas** | KPIs, ritmo de cierre semanal, distribución por estado, prioridades, etiquetas, vencimientos y reuniones. |
| **Roadmap** | Hitos por mes, progreso, cambio rápido de estado y carga de trabajo por vencimiento. |
| **Reuniones** | Calendario mensual y agenda, reuniones propias, eliminación directa desde la agenda, categorías, invitados, notas, plantilla de Google Calendar y Meet. |
| **Repositorios** | Biblioteca de enlaces a los proyectos existentes con nombre, URL, descripción, etiquetas y estado (activo, en pausa o finalizado). Cada proyecto muestra sus tareas vinculadas y permite abrir Mis tareas filtrada por él. Búsqueda, filtro, copiar enlace, acceso directo y sincronización con la hoja **Repositorios** de Google Sheets. |
| **Guías por sección** | Cada vista incluye una tarjeta de ayuda con 4 pasos. Se oculta con la X y se reabre con el botón **Guía**; el estado se recuerda por sección. |
| **Terminal** | Consola funcional (`Ctrl + \``) para crear/mover/completar tareas, agendar reuniones, consultar métricas y navegar. |
| **Ajustes** | Conexión con Google, copiar URL/token, exportar/importar conexión, prueba de conexión, respaldo/importación JSON y borrado de datos locales. |
| **Apps Script** | Ventana emergente desde el menú lateral con la URL y el token editables, botones para copiar cada uno o ambos, descargar un TXT, importar conexión, guardar y acceso directo a Ajustes. |
| **Google (menú lateral)** | **Descargar de Google** y **Subir a Google** también en el menú lateral, visibles en escritorio y móvil. |

### Atajos

- `Ctrl + \`` — abrir/cerrar la terminal.
- `n` — nueva tarea.
- `m` — nueva reunión.
- `?` — ayuda de la terminal.
- `Esc` — cerrar modal, terminal o menú móvil.

---

## 3. Estructura

```
index.html                     Shell de la aplicación (SPA por hash)
css/styles.css                 Tokens de marca, componentes, temas y responsive
js/config.js                   Catálogos, ajustes y utilidades
js/local-config.js             Configuración personal (IGNORADA por Git)
js/local-config.example.js     Plantilla de configuración local
js/store.js                    Estado local, CRUD, métricas y sincronización
js/api.js                      Cliente del Web App de Google Apps Script
js/glass.js                    Desplegables glass accesibles
js/app.js                      Vistas, modales, drag & drop e integraciones
js/terminal.js                 Terminal de comandos
assets/img/                    Logos, favicons y OG image oficiales
google-apps-script/Code.gs     Backend opcional para Sheets + Calendar + Meet
google-apps-script/appsscript.json
site.webmanifest               Iconos y metadatos de instalación
estado-del-proyecto.txt        Bitácora de avance y pendientes
```

---

## 4. Configuración local (valores predeterminados)

Para dejar la URL y el token precargados sin subirlos a GitHub:

```bash
cp js/local-config.example.js js/local-config.js
```

Completa `apiUrl` y `token` en `js/local-config.js`. Ese archivo:

- Está incluido en `.gitignore` y no se versiona.
- Se carga antes que `config.js` y actúa como valor predeterminado.
- Tiene prioridad menor que lo guardado desde **Ajustes**, así que puedes
  cambiarlo desde la interfaz sin tocar el archivo.
- En GitHub Pages no existirá (o estará vacío), por lo que allí se
  configura una vez en **Ajustes** por navegador.

Si el archivo no existe, la app arranca en modo local sin errores
funcionales (el navegador puede registrar un 404 por el script opcional).

### Pasar la conexión a GitHub Pages sin publicar el token

El token no debe subirse al repositorio: GitHub Pages es público y
cualquiera podría escribir en la hoja. Para configurar la página
publicada sin escribirlo a mano:

1. En la copia local, abre **Ajustes** y pulsa **Exportar conexión**.
   Se descarga `fundaserinco-conexion.json`.
2. En la página de GitHub Pages, abre **Ajustes** y pulsa
   **Importar conexión**; selecciona ese archivo.
3. La conexión se guarda solo en ese navegador. Puedes usar
   **Probar conexión** para verificarla.

El archivo contiene el token. Guárdalo en un lugar privado y no lo subas
a GitHub (ya está incluido en `.gitignore`). Como alternativa, usa los
botones **Copiar** junto a la URL y al token y pégalos una vez en la
página publicada; después quedan visibles y guardados en **Ajustes** de
ese navegador.

---

## 5. Conectar Google Sheets y Google Calendar

La app funciona en modo local desde el primer momento. Para usar Google:

1. Crea una hoja de cálculo en Google Sheets.
2. **Extensiones → Apps Script**.
3. Pega [`google-apps-script/Code.gs`](./google-apps-script/Code.gs) y crea el archivo de manifiesto con [`google-apps-script/appsscript.json`](./google-apps-script/appsscript.json).
4. Ejecuta la función `instalar` y autoriza los permisos. Copia el **TOKEN** que aparece en el registro.
5. **Implementar → Nueva implementación → Aplicación web**:
   - Ejecutar como: **yo**
   - Quién tiene acceso: **cualquier persona**
6. Copia la URL que termina en `/exec`.
7. En la app: **Ajustes → Conexión con Google**, pega la URL y el token, guarda y pulsa **Probar conexión**.

### Actualizar una integración existente

Si ya tenías la versión anterior del backend, actualízala sin cambiar la URL:

1. Pega el nuevo [`google-apps-script/Code.gs`](./google-apps-script/Code.gs) en **Extensiones → Apps Script**.
2. Ejecuta la función `instalar` para crear la hoja **Repositorios**.
3. En **Implementar → Administrar implementaciones**, edita la implementación existente y elige **Nueva versión → Implementar** (así conservas la misma URL `/exec`).
4. En la app pulsa **Descargar de Google** o **Subir a Google** para estrenar la sincronización de repositorios.

### Descargar y subir por separado

- **Descargar de Google** (nube hacia abajo): trae tareas, reuniones, hitos y repositorios de la hoja y los mezcla con los locales por id y fecha. No envía nada a Google.
- **Subir a Google** (nube hacia arriba): envía el estado de este navegador (tareas, reuniones, hitos y repositorios) a la hoja. Pide confirmación y no borra filas que no existan en la app.
- Los **repositorios** se sincronizan con la hoja `Repositorios` y también viajan en **Exportar JSON** e **Importar JSON**.
- El comando `sync` de la terminal sigue haciendo ambas operaciones.
- En móvil, las dos acciones también están en el menú lateral, sección **Google**.

Con eso:

- Tareas, reuniones, hitos y repositorios se escriben en las hojas `Tareas`, `Reuniones`, `Hitos` y `Repositorios`.
- Al crear una reunión con la casilla de Meet activa, el backend crea el evento en Calendar con `conferenceData` y devuelve el enlace de Meet.
- **Importar de Google** trae eventos del calendario al mes/agenda de la app.

### Servicio avanzado de Calendar

El manifiesto habilita `Calendar API v3`. Si no está disponible, el backend crea el evento con `CalendarApp` (sin Meet automático) y devuelve una advertencia. Para habilitarlo manualmente: **Apps Script → Servicios → + → Google Calendar API**.

El menú lateral **Apps Script** abre una ventana con la URL y el token guardados en ese navegador. Puedes editarlos y pulsar **Guardar**, importar una conexión, copiarlos o descargar un **TXT** con ambos valores. No están escritos en el código: se leen de la configuración de la app.

La guía completa, con contrato de la API, columnas de las hojas y solución de problemas, está en [`estado-del-proyecto.txt`](./estado-del-proyecto.txt).

---

## 6. Privacidad

- Los datos viven en `localStorage` de tu navegador.
- La URL y el token de Google se guardan en `js/local-config.js` (ignorado por Git) y/o en `localStorage`; nunca se versionan.
- El archivo `fundaserinco-conexion.json` que genera **Exportar conexión** contiene el token. No lo subas a GitHub; también está en `.gitignore`.
- El archivo `fundaserinco-apps-script.txt` que genera **Descargar TXT** contiene el token. No lo subas a GitHub; también está en `.gitignore`.
- La ventana **Apps Script** solo muestra los valores guardados en el navegador; no los incrusta en el código ni los publica.
- Cualquier persona con la URL `/exec` y el token puede escribir en la hoja. Trata el token como una contraseña.
- La app aún no tiene usuarios ni autenticación (pendiente acordado).
- Al actualizar CSS/JS se usa un parámetro `?v=` para evitar caché antigua.

---

## 7. Marca

- Logos y favicons oficiales en `assets/img/`.
- Paleta: Tech Blue `#0086C8`, Solar Coral `#F48A56`, Orbit Cyan `#4EA8DE`, navy `#0F172A`.
- Tipografía principal: **Plus Jakarta Sans** (fallback Outfit, Montserrat, system-ui).
- Radios de 8–16 px y rejilla base de 8 pt.

© Fundaserinco. Uso personal.
