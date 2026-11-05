# Align Web

Frontend de **Align**, una plataforma de productividad personal que reúne tareas, finanzas, hábitos y calendario, con un asistente de IA que actúa sobre esos datos desde el chat.

Es una aplicación Angular instalable como PWA. Este repositorio solo contiene el frontend: se comunica por HTTP con el backend en Spring Boot, que vive en un repositorio aparte ([`jhontaff/align`](https://github.com/jhontaff/align)).

## Funcionalidades

- **Inicio**: panel con calendario, resumen de tareas, finanzas y hábitos, y creación rápida.
- **Tareas**: listado, detalle, creación, edición y borrado, con prioridad y fecha de vencimiento.
- **Finanzas**: panel de 12 columnas que cada usuario puede reordenar y redimensionar, con gráficos, historial de movimientos y formularios de ingresos y gastos.
- **Hábitos**: seguimiento diario con rachas calculadas por el servidor.
- **Calendario**: agenda de eventos integrada en Inicio.
- **Asistente de IA**: chat persistente con dictado por voz. Crea y modifica datos directamente, y pide confirmación antes de eliminar.
- **Cuenta**: registro, inicio de sesión, recuperación y cambio de contraseña, edición de perfil y foto.
- **PWA**: instalable, con notificaciones push y aviso de versión nueva. Los datos no están disponibles sin conexión; solo se cachea la aplicación.
- **Interfaz**: tema claro, oscuro o del sistema, diseño adaptable a móvil y escritorio, y tours de bienvenida.

## Tecnologías

| Área | Tecnología |
| --- | --- |
| Framework | Angular 20 (componentes standalone, signals, Zone.js) |
| Lenguaje | TypeScript 5.8, SCSS |
| PWA | `@angular/service-worker` |
| Panel de Finanzas | `angular-gridster2` |
| Otras librerías | `driver.js` (tours), `marked` (Markdown en el chat), DiceBear (avatares), Bootstrap Icons |
| Pruebas | Karma y Jasmine |
| Despliegue | Docker, Nginx, GitHub Actions |

## Puesta en marcha

### Requisitos

- [Git](https://git-scm.com/)
- [Node.js](https://nodejs.org/) `^20.19`, `^22.12` o `>=24`, con npm
- El [backend de Align](https://github.com/jhontaff/align) para usar la aplicación con datos reales

### Pasos

1. Clona el repositorio y entra en la carpeta:

   ```bash
   git clone https://github.com/jhontaff/align-web.git
   cd align-web
   ```

2. Instala las dependencias:

   ```bash
   npm ci
   ```

3. Arranca el backend en el puerto 1010, que es al que apunta el proxy. El backend usa `8080` por defecto, así que hay que indicárselo. Sigue la configuración de su repositorio y, desde esa carpeta, ejecuta:

   ```bash
   ./mvnw spring-boot:run -Dspring-boot.run.profiles=dev -Dspring-boot.run.arguments=--server.port=1010
   ```

4. Arranca el servidor de desarrollo:

   ```bash
   npm start
   ```

5. Abre <http://localhost:4200> y crea una cuenta desde la pantalla de registro.

No hace falta configurar variables de entorno. El frontend usa rutas relativas (`/api`, `/auth`), y `npm start` las reenvía al puerto 1010 mediante [`proxy.conf.json`](proxy.conf.json), lo que además evita los problemas de CORS en local.

> Si la consola muestra `ECONNREFUSED` en peticiones a `/api` o `/auth`, el backend no está en marcha en el puerto 1010.

## Scripts

| Comando | Qué hace |
| --- | --- |
| `npm start` | Servidor de desarrollo en el puerto 4200, con proxy al backend |
| `npm run build` | Build de producción en `dist/align-web/` |
| `npm run watch` | Build de desarrollo que se regenera al guardar |
| `npm test` | Pruebas unitarias con Karma (requiere Chrome) |
| `npm run serve:pwa` | Compila y sirve el build de producción en el puerto 4300, con proxy al backend |
| `npm run icons` | Regenera el registro de iconos desde `tools/generate-icons.mjs` |

El Service Worker no existe en `npm start`. Para probar la instalación, las notificaciones push o el aviso de actualización, usa `npm run serve:pwa`.

## Estructura del proyecto

```text
src/
├── app/
│   ├── core/       Lógica transversal sin UI: sesión, interceptores, tema, PWA, notificaciones
│   ├── layout/     Elementos persistentes de la aplicación: cabecera, navegación, panel de chat
│   ├── shared/     Componentes de presentación reutilizables (iconos, avatar…)
│   └── features/   Un dominio por carpeta: auth, calendar, chat, finance, habits, home, tasks, user
└── styles/         Sistema de diseño: tokens, base y componentes globales
landing/            Página de presentación estática, servida en la raíz en producción
tools/              Scripts de desarrollo
public/             Manifest e iconos de la PWA
```

Las convenciones de código y las decisiones de arquitectura están documentadas en [`CLAUDE.md`](CLAUDE.md).

## Despliegue

Cada push a la rama `Release` ejecuta [`docker-image.yml`](.github/workflows/docker-image.yml), que:

1. Construye la imagen Docker: compila Angular y la sirve con Nginx.
2. La publica en `ghcr.io/jhontaff/align-web:latest`.
3. Se conecta por SSH al VPS y actualiza el contenedor con `docker compose`.

En producción, [`nginx.conf`](nginx.conf) sirve la landing en `/` y la aplicación en el resto de rutas, y reenvía `/api` y `/auth` al backend en el puerto 8080 del host. El contenedor no publica puertos: recibe el tráfico a través de Nginx Proxy Manager.
