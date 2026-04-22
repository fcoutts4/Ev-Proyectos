# Evaluacion de Proyectos Inmobiliarios

Base dinamica inicial de la app para evaluacion de proyectos inmobiliarios, preparada para Vercel + Postgres.

## Estructura

```text
Ev-Proyectos/
|- public/
|  |- index.html
|  |- app.js
|  |- styles.css
|  `- fragments/
|- docs/
|  `- DEPLOY_VERCEL.md
|- legacy/
|  `- archivos estaticos anteriores
|- server.js
|- db.js
|- package.json
`- README.md
```

## Uso local

```bash
npm install
npm start
```

Antes de iniciar, crea tu `.env` usando `.env.example` y define `DATABASE_URL`.

Ejemplo:

```bash
DATABASE_URL=postgres://USER:PASSWORD@HOST:5432/DATABASE?sslmode=require
```

Abrir en `http://localhost:3000`.

Para desarrollo:

```bash
npm run dev
```

## Estado actual

- `public/index.html` es la entrada oficial del frontend.
- `public/app.js` consume la API real de Express.
- La persistencia ahora usa Postgres mediante `DATABASE_URL`.
- Los archivos anteriores quedaron archivados en `legacy/`.

## Vercel

La app ya quedo alineada con el enfoque recomendado por Vercel:

- Express en `server.js`
- archivos estaticos en `public/`
- Postgres externo conectado por `DATABASE_URL`
- carga de variables local con `dotenv`

Segun la documentacion oficial de Vercel consultada hoy, desde 2025 los proyectos nuevos usan integraciones Postgres del Marketplace en lugar del antiguo Vercel Postgres, y Express puede desplegarse en Vercel sin configuracion especial.
