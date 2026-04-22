# GitHub y Vercel

## Estado actual

Hoy la app corre como:

- frontend en `public/`
- backend Express en `server.js`
- base Postgres externa via `DATABASE_URL`

## Base de datos recomendada

Segun la documentacion oficial de Vercel consultada hoy, `Vercel Postgres` ya no se ofrece para proyectos nuevos y ahora se usan integraciones Postgres del Marketplace, por ejemplo:

- Neon
- Supabase
- Prisma Postgres

## Flujo sugerido

1. Conectar el repo a Vercel.
2. Crear una base Postgres en Neon o Supabase.
3. Configurar `DATABASE_URL` en Vercel.
4. Desplegar la version online desde Vercel.

## Desarrollo local

1. Crear `.env` a partir de `.env.example`.
2. Pegar la misma `DATABASE_URL` de tu base cloud.
3. Ejecutar `npm install` y luego `npm start`.

## Variables necesarias

```bash
DATABASE_URL=postgres://USER:PASSWORD@HOST:5432/DATABASE?sslmode=require
```
