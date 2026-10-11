# 8. Preparativos (tu paso a paso)

Marca cada casilla al terminar. **La parte A se puede hacer ahora**, antes del código. La parte B se hace cuando el código esté en el repo.

## A. Antes de programar (unos 10 minutos)

### A1. Crear el proyecto Supabase nuevo
- [ ] Entra a https://supabase.com/dashboard → **New project**.
- [ ] Organización: la misma de siempre. El plan gratis permite **2 proyectos**: el de CodeFix y este.
- [ ] Nombre: `libreta-cobros` (o el nombre final de la app).
- [ ] Contraseña de la base de datos: genera una y **guárdala tú**, no la mandes por el chat.
- [ ] Región: **South America (São Paulo)** → **Create new project**. Espera 1–2 minutos.

### A2. Configurar el inicio de sesión
- [ ] **Authentication → Sign In / Providers → Email**: deja **Enable email** encendido. **Confirm email**: apágalo por ahora (Save).
- [ ] **Authentication → URL Configuration**:
  - Site URL: `https://codefixservice.github.io/Aplicaciones/cobros/` → Save.
  - Redirect URLs → Add URL: `https://codefixservice.github.io/Aplicaciones/cobros/**` → Save URLs.

### A3. Correo para "olvidé mi contraseña" (obligatorio)
El correo de fábrica de Supabase **solo envía a los miembros de tu equipo** (máximo 2 por hora). Para los clientes hay que usar Gmail.
- [ ] Crea una contraseña de aplicación en https://myaccount.google.com/apppasswords (requiere la verificación en 2 pasos activada).
- [ ] Supabase → **Authentication → Emails → SMTP Settings** → **Enable custom SMTP**:
  host `smtp.gmail.com`, puerto `465`, usuario tu Gmail, contraseña las 16 letras, remitente tu Gmail, nombre `Libreta de Cobros` → Save.

### A4. Mandarme las 2 claves públicas
- [ ] **Project Settings → Data API**: copia la **Project URL** (`https://xxxx.supabase.co`).
- [ ] **Project Settings → API Keys → Legacy API Keys**: copia **anon public** (empieza con `eyJ`).
- [ ] Mándame las dos por el chat.
- ⚠️ **Nunca** mandes la `service_role` ni la `secret key`, ni la contraseña de la base de datos.

### A5. Decisiones
- [ ] Responde las **decisiones pendientes** de `09-PLAN.md` (nombre, precio, registro abierto).

## B. Cuando el código esté listo (unos 15 minutos)
Te mandaré cada código con su botón para copiar, igual que en CodeFix.
1. [ ] **SQL Editor → New query** → pega `cobros/supabase/instalar-corto.sql` → **Run**. Si sale un aviso de operación destructiva, toca *Run this query* (es normal). Al final debe decir `Libreta instalada vX`.
2. [ ] **Authentication → Users → Add user → Create new user**: tu correo `juanjosuecastilloloyola@gmail.com`, una contraseña **distinta** a la de CodeFix, con **Auto Confirm User** marcado.
3. [ ] **Edge Functions → Deploy a new function → Via Editor** → pega `cobros/supabase/functions/enviar/index.ts` → nombre `enviar` → Deploy. Después, en Settings de la función, apaga **Verify JWT** → Save.
4. [ ] **Database → Extensions**: revisa que **pg_cron** y **pg_net** estén activas (el SQL las activa; si no, actívalas aquí y corre el paso 1 de nuevo).
5. [ ] **Storage**: revisa que existan los buckets `comprobantes`, `logos` y `pagos` (los crea el SQL).
6. [ ] Si GitHub Pages publica con Actions: **Settings → Pages**. Si dice "GitHub Actions", ya agregué `cobros` a `pages.yml`. Si dice "Deploy from a branch", no hay que hacer nada.
7. [ ] Abre `https://codefixservice.github.io/Aplicaciones/cobros/admin/` → ingresa → **Ajustes → Generar claves push** (una vez) → pon los precios y el link de Mercado Pago.
8. [ ] Prueba completa con tu celular:
   - [ ] crear una cuenta de negocio de prueba;
   - [ ] anotar un fiado y un abono;
   - [ ] abrir el link del cliente con el PIN;
   - [ ] subir un comprobante y aprobarlo;
   - [ ] mandar el recordatorio por WhatsApp;
   - [ ] activar las notificaciones y recibir una.
9. [ ] **GitHub → Actions → "Libreta ping"** → **Run workflow** una vez, para ver que queda en verde.

## C. Antes de vender
- [ ] Hacer privado el repo y publicar en Cloudflare Pages (gratis), o comprar el dominio. Al cambiar la URL, actualiza las URLs de A2.
- [ ] Revisar los textos legales con un abogado (ver `07-LEGAL.md`).
- [ ] Cuando la base de datos pase el 70 % (el admin lo muestra), pasar a Supabase Pro (US$25 al mes) y encender "Confirm email".
