# Fundaserinco · Sistema de Seguimiento

Aplicación web de seguimiento personal para **Fundaserinco**: tablero kanban, tareas, métricas, roadmap y reuniones, con la identidad visual oficial de la marca (Tech Blue `#0086C8`, Solar Coral `#F48A56`, Orbit Cyan `#4EA8DE`, Plus Jakarta Sans y favicons oficiales).

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
| **Tablero** | Kanban con 5 estados, arrastrar y soltar, prioridades, etiquetas, puntos, responsable, vencimiento y filtros. |
| **Mis tareas** | Lista con búsqueda, filtros, orden y exportación a CSV. |
| **Métricas** | KPIs, ritmo de cierre semanal, distribución por estado, prioridades, etiquetas, vencimientos y reuniones. |
| **Roadmap** | Hitos por mes, progreso, cambio rápido de estado y carga de trabajo por vencimiento. |
| **Reuniones** | Calendario mensual y agenda, reuniones propias (sin ejemplos), categorías, invitados, notas, plantilla de Google Calendar y Meet. |
| **Terminal** | Consola funcional (`Ctrl + \``) para crear/mover/completar tareas, agendar reuniones, consultar métricas y navegar. |
| **Ajustes** | Conexión con Google, prueba de conexión, sincronización, respaldo/importación JSON y borrado de datos locales. |

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
js/store.js                    Estado local, CRUD, métricas y sincronización
js/api.js                      Cliente del Web App de Google Apps Script
js/app.js                      Vistas, modales, drag & drop e integraciones
js/terminal.js                 Terminal de comandos
assets/img/                    Logos, favicons y OG image oficiales
google-apps-script/Code.gs     Backend opcional para Sheets + Calendar + Meet
google-apps-script/appsscript.json
site.webmanifest               Iconos y metadatos de instalación
estado-del-proyecto.txt        Bitácora de avance y pendientes
```

---

## 4. Conectar Google Sheets y Google Calendar

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

Con eso:

- Tareas, reuniones e hitos se escriben en las hojas `Tareas`, `Reuniones` e `Hitos`.
- Al crear una reunión con la casilla de Meet activa, el backend crea el evento en Calendar con `conferenceData` y devuelve el enlace de Meet.
- **Importar de Google** trae eventos del calendario al mes/agenda de la app.

### Servicio avanzado de Calendar

El manifiesto habilita `Calendar API v3`. Si no está disponible, el backend crea el evento con `CalendarApp` (sin Meet automático) y devuelve una advertencia. Para habilitarlo manualmente: **Apps Script → Servicios → + → Google Calendar API**.

La guía completa, con contrato de la API, columnas de las hojas y solución de problemas, está en [`estado-del-proyecto.txt`](./estado-del-proyecto.txt).

---

## 5. Privacidad

- Los datos viven en `localStorage` de tu navegador.
- La URL y el token de Google nunca se incluyen en el código ni en el repositorio.
- Cualquier persona con la URL `/exec` y el token puede escribir en la hoja. Trata el token como una contraseña.
- La app aún no tiene usuarios ni autenticación (pendiente acordado).

---

## 6. Marca

- Logos y favicons oficiales en `assets/img/`.
- Paleta: Tech Blue `#0086C8`, Solar Coral `#F48A56`, Orbit Cyan `#4EA8DE`, navy `#0F172A`.
- Tipografía principal: **Plus Jakarta Sans** (fallback Outfit, Montserrat, system-ui).
- Radios de 8–16 px y rejilla base de 8 pt.

© Fundaserinco. Uso personal.
