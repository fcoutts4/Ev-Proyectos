# GitHub y Vercel

## Estado actual

Hoy la app corre como:

- frontend en `public/`
- backend Express en `server.js`
- base local SQLite en `db.sqlite`

## Lo que ya podemos hacer

1. Subir este repo a GitHub.
2. Dejar conectado el proyecto con Vercel.
3. Seguir iterando sobre esta base dinamica.

## Lo que falta para que quede funcional online

Antes del deploy productivo necesitamos migrar la persistencia a una base externa compatible con Vercel.

Opciones recomendadas:

- Vercel Postgres
- Neon
- Supabase

## Flujo sugerido

1. Subir repo a GitHub.
2. Mantener esta version para desarrollo local.
3. Migrar `db.js` a base cloud.
4. Desplegar la version online desde Vercel.
