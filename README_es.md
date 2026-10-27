<p align="center">
  <picture>
    <source media="(prefers-color-scheme: dark)" srcset="docs/assets/brand/banner-dark.svg">
    <img src="docs/assets/brand/banner-light.svg" alt="BreezyBoard: Organize at the speed of wind." width="100%">
  </picture>
</p>

<p align="center">
  <a href="https://github.com/kfeuerschvenger/BreezyBoard/actions/workflows/ci.yml"><img src="https://img.shields.io/github/actions/workflow/status/kfeuerschvenger/BreezyBoard/ci.yml?branch=main&style=flat-square&label=CI&logo=githubactions&logoColor=white" alt="Estado de CI"></a>
  <a href="LICENSE"><img src="https://img.shields.io/badge/licence-MIT-46b1e3?style=flat-square" alt="Licencia MIT"></a>
  <img src="https://img.shields.io/badge/Node-22-5FA04E?style=flat-square&logo=nodedotjs&logoColor=white" alt="Node 22">
  <img src="https://img.shields.io/badge/React-19-61DAFB?style=flat-square&logo=react&logoColor=black" alt="React 19">
  <img src="https://img.shields.io/badge/TypeScript-5.8-3178C6?style=flat-square&logo=typescript&logoColor=white" alt="TypeScript 5.8">
  <img src="https://img.shields.io/badge/MongoDB-7-47A248?style=flat-square&logo=mongodb&logoColor=white" alt="MongoDB 7">
  <img src="https://img.shields.io/badge/Docker-Compose-2496ED?style=flat-square&logo=docker&logoColor=white" alt="Docker Compose">
</p>

<p align="center"><a href="README.md">English</a> · <strong>Español</strong></p>

<p align="center">
  <img src="docs/assets/screens/hero.gif" alt="Una tarjeta arrastrada de Airborne a Landed en el tablero Kite Festival, donde aterriza" width="100%">
</p>

**BreezyBoard es un tablero Kanban para equipos a los que les gusta que el trabajo fluya.**

Los espacios de trabajo contienen tableros, los tableros contienen columnas y las columnas contienen tarjetas que se lanzan de un lado a otro con el mouse o con el teclado.

Hecho donde el viento nunca se toma un día libre, así que nada sale volando: los borradores sobreviven a una recarga, lo eliminado se puede recuperar y las sesiones terminan con buenos modales.

## El recorrido

<table>
  <tr>
    <td width="50%" valign="top">
      <img src="docs/assets/screens/boards-overview.png" alt="La página de inicio con un saludo, los totales y cuatro tableros">
      <p><strong>Todo de un vistazo.</strong> Un saludo, tus totales y cada tablero que puedes abrir, cada uno pintado con su propio tono.</p>
    </td>
    <td width="50%" valign="top">
      <img src="docs/assets/screens/board.png" alt="El tablero Kite Festival con cuatro columnas de tarjetas">
      <p><strong>Arrastrar, soltar, listo.</strong> Las tarjetas se deslizan entre columnas con el mouse o solo con el teclado, y aterrizan justo donde las sueltas.</p>
    </td>
  </tr>
  <tr>
    <td width="50%" valign="top">
      <img src="docs/assets/screens/task-detail.png" alt="Una tarjeta abierta para editar con prioridad, responsable, color, descripción y checklist">
      <p><strong>Tarjetas con bolsillos.</strong> Prioridad, responsable, color, descripción y checklist. Lo que quedó a medio escribir se guarda como borrador, incluso tras una recarga.</p>
    </td>
    <td width="50%" valign="top">
      <img src="docs/assets/screens/edit-columns.png" alt="El diálogo de gestión de columnas para renombrar, reordenar y cambiar el color">
      <p><strong>Tus columnas, tu clima.</strong> Renombra, reordena y cambia colores de una sola vez. ¿Dos pestañas editando a la vez? Un guardado desactualizado se rechaza en lugar de borrar una columna en silencio.</p>
    </td>
  </tr>
</table>

### Por qué se siente liviano

- **Acceso en dos niveles.** Quien administra un espacio de trabajo gestiona todos sus tableros; los miembros ven los tableros que crearon o a los que fueron agregados. Nadie más ve nada.
- **Deshacer lo importante.** Un tablero o una tarjeta eliminados esperan siete días en la papelera antes de que se los lleve el viento.
- **Sesiones que se deslizan.** Mientras haya actividad, la sesión sigue abierta; sin actividad, termina a los 15 minutos, con un aviso previo.
- **Accesible por defecto.** Cada pantalla se analiza con axe y un barrido de contraste en un navegador real, y el margen de errores solo puede bajar.

Cada tarjeta sigue la misma ruta de vuelo, con una red de seguridad debajo:

```mermaid
%%{init: {"theme": "base", "themeVariables": {"fontFamily": "Segoe UI, Helvetica, Arial, sans-serif", "primaryColor": "#cbeeff", "primaryBorderColor": "#00557e", "primaryTextColor": "#00557e", "lineColor": "#46b1e3", "textColor": "#2f7fa8", "edgeLabelBackground": "#ffffff"}}}%%
flowchart LR
  Backlog --> Rigging --> Airborne --> Landed
  Airborne -.->|eliminar| Trash["papelera<br/>7 días para arrepentirse"]
  Trash -.->|restaurar| Airborne
  classDef sky fill:#cbeeff,stroke:#00557e,color:#00557e
  classDef lavender fill:#ede0ff,stroke:#563e7b,color:#563e7b
  classDef sand fill:#fbe5bf,stroke:#684600,color:#684600
  classDef green fill:#cff3d5,stroke:#195c2e,color:#195c2e
  classDef coral fill:#ffdcce,stroke:#7a3621,color:#7a3621
  class Backlog sky
  class Rigging lavender
  class Airborne sand
  class Landed green
  class Trash coral
```

## Bajo el capó

<picture>
  <source media="(prefers-color-scheme: dark)" srcset="docs/assets/diagrams/architecture-dark.svg">
  <img src="docs/assets/diagrams/architecture-light.svg" alt="El navegador ejecuta la SPA de React, que llama a la API de Express en /api/v1; la API guarda los datos en un replica set de MongoDB, los avatares en un volumen de uploads y envía el correo de restablecimiento por SMTP" width="100%">
</picture>

Una aplicación de una sola página en React habla con una API de Express por capas a través de `/api/v1`, y MongoDB corre como replica set para que un tablero y sus tarjetas se eliminen en una sola transacción. El contrato OpenAPI se genera a partir de los mismos esquemas de Zod que validan cada petición, así que la documentación no puede desviarse del código.

<p align="center">
  <img src="https://skillicons.dev/icons?i=react,ts,vite,tailwind,nodejs,express,mongodb,docker,nginx,githubactions,vitest,playwright" alt="React, TypeScript, Vite, Tailwind CSS, Node.js, Express, MongoDB, Docker, nginx, GitHub Actions, Vitest y Playwright">
</p>

## Inicio rápido

Solo hace falta Docker Desktop en ejecución.

```bash
docker compose up -d --build
docker compose exec back npm run seed:templates
docker compose exec -e DEMO_PASSWORD=<8 caracteres o más> back npm run seed:demo
```

Después abre http://localhost:5173 e inicia sesión como `demo@breezyboard.local` con la contraseña que elegiste. Te esperan cuatro tableros, dos compañeros de equipo y un festival de cometas.

> [!TIP]
> El correo de restablecimiento llega a Mailpit en http://localhost:8025, y Swagger UI está en http://localhost:5000/api/docs/. Todo lo demás, desde las cuentas de ejemplo hasta cómo correrlo sin Docker, está en [ENVIRONMENT.md](docs/ENVIRONMENT.md).

## Para profundizar

El README es la postal. La documentación técnica es el mapa, en inglés.

| Documento | De qué trata |
|---|---|
| [Architecture](docs/ARCHITECTURE.md) | Capas del backend, control de acceso, la sesión deslizante, el modelo de datos y la estructura del frontend |
| [Environment](docs/ENVIRONMENT.md) | Puesta en marcha, cada variable, los seeds y la demo, y qué revisar cuando algo se frena |
| [Testing](docs/TESTING.md) | Tests unitarios, Playwright, los scripts de verificación y el proceso que toma estas capturas |
| [CI](docs/CI.md) | Los cinco jobs, el flujo de ramas, el control de auditoría y la política de scripts de instalación |
| [API](docs/API.md) | Autenticación, convenciones, códigos de error y límites de peticiones |
| [Roadmap](docs/ROADMAP.md) | Ideas en el horizonte, y lo que cada una necesita antes de despegar |
| [openapi.yaml](docs/openapi.yaml) | El contrato HTTP completo, generado a partir de los esquemas de las rutas |

---

<p align="center">
  <strong>Made in Patagonia · 50°20′S</strong><br>
  Hecho con cuidado (y mucho viento) por <strong>Kevin Feuerschvenger</strong> · Software Engineer
</p>

<p align="center">
  <a href="https://github.com/kfeuerschvenger"><img src="https://img.shields.io/badge/GitHub-kfeuerschvenger-181717?style=flat-square&logo=github&logoColor=white" alt="GitHub"></a>
  <a href="https://www.linkedin.com/in/kevin-feuerschvenger/"><img src="https://img.shields.io/badge/LinkedIn-kevin--feuerschvenger-0A66C2?style=flat-square&logo=data%3Aimage%2Fsvg%2Bxml%3Bbase64%2CPHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHZpZXdCb3g9IjAgMCAyNCAyNCI%2BPHBhdGggZmlsbD0id2hpdGUiIGQ9Ik0yMC40NSAyMC40NWgtMy41NnYtNS41N2MwLTEuMzMtLjAyLTMuMDQtMS44NS0zLjA0LTEuODUgMC0yLjE0IDEuNDUtMi4xNCAyLjk0djUuNjdIOS4zNVY5aDMuNDF2MS41NmguMDVjLjQ4LS45IDEuNjQtMS44NSAzLjM3LTEuODUgMy42IDAgNC4yNyAyLjM3IDQuMjcgNS40NnY2LjI4ek01LjM0IDcuNDNhMi4wNiAyLjA2IDAgMSAxIDAtNC4xMyAyLjA2IDIuMDYgMCAwIDEgMCA0LjEzek03LjEyIDIwLjQ1SDMuNTZWOWgzLjU2djExLjQ1eiIvPjwvc3ZnPg%3D%3D" alt="LinkedIn"></a>
  <a href="https://feuerschvenger.com/"><img src="https://img.shields.io/badge/Portfolio-feuerschvenger.com-00557e?style=flat-square&logo=googlechrome&logoColor=white" alt="Portfolio"></a>
</p>

<p align="center"><sub>Publicado bajo la <a href="LICENSE">licencia MIT</a>.</sub></p>
