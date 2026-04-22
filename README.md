# Evaluacion de Proyectos Inmobiliarios

Base dinamica inicial de la app para evaluacion de proyectos inmobiliarios.

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

Abrir en `http://localhost:3000`.

Para desarrollo:

```bash
npm run dev
```

## Estado actual

- `public/index.html` es la entrada oficial del frontend.
- `public/app.js` consume la API real de Express.
- La pestaña de cabida ya carga y guarda datos en SQLite.
- Los archivos anteriores quedaron archivados en `legacy/`.

## Siguiente etapa para Vercel

La app ya es dinamica en local, pero para dejarla funcional online en Vercel hay que reemplazar `SQLite` local por una base externa como `Vercel Postgres`, `Neon` o `Supabase`.
