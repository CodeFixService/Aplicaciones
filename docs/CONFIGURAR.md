# Configurar el servidor (una sola vez)

Guía con botones para copiar cada código: https://claude.ai/artifact/4pBSteVv3Wve8snYTEW9R1
Todo se hace en https://supabase.com/dashboard → proyecto **CodeFix**. Unos 15 minutos.

## 1. Crear la base de datos
**SQL Editor** → **+ New query** → pega **todo** [`supabase/instalar.sql`](../supabase/instalar.sql) → **Run**.
Si aparece un aviso de operación destructiva, toca **Run this query** (es normal).

## 2. Configurar el inicio de sesión
- **Authentication → Sign In / Providers → Email**: apaga **Confirm email** → Save.
- **Authentication → URL Configuration**: Site URL `https://codefixservice.github.io/Aplicaciones/` →
  Save. Redirect URLs → Add URL `https://codefixservice.github.io/Aplicaciones/**` → Save URLs.

## 3. Crear la cuenta de administrador (después del paso 1)
**Authentication → Users → Add user → Create new user**: email `juanjosuecastilloloyola@gmail.com`,
una contraseña nueva solo tuya, **Auto Confirm User** marcado → Create user.

## 4. Crear el enviador de notificaciones
**Edge Functions → Deploy a new function → Via Editor** → borra el ejemplo → pega
[`supabase/functions/enviar/index.ts`](../supabase/functions/enviar/index.ts) → nombre `enviar` → **Deploy function**.
Luego en la función: **Details/Settings** → apaga **Verify JWT** → Save changes.

## 5. Enviar la clave pública
**Project Settings → API Keys → Legacy API Keys** → copia **anon public** (empieza con `eyJ`) y envíala por el chat.
Nunca compartas la **service_role** ni la **secret key**.

## 6. Cuando la app esté publicada
1. Abre la app, instálala e ingresa con la cuenta del paso 3 (verás **ADMIN**).
2. **Administración → Ajustes → Generar claves push** (una sola vez).
3. Inicio → **Activar notificaciones**. Luego **Avisos → Prueba: solo a mí → Enviar**.

## 7. (Opcional) Correos con Gmail
1. Crea una contraseña de aplicación en https://myaccount.google.com/apppasswords (requiere verificación en 2 pasos).
2. App → **Administración → Ajustes → Correo (Gmail)** → tu Gmail + las 16 letras → Guardar.
3. Para "¿Olvidaste tu contraseña?": Supabase → **Authentication → Emails → SMTP Settings** → Enable custom SMTP:
   `smtp.gmail.com`, puerto `465`, usuario tu Gmail, contraseña las 16 letras, nombre `CodeFix`.

## Límites del plan gratis (suficientes para empezar)
- Supabase Free: 50 000 usuarios, 500 MB de datos, 1 GB de imágenes. Se pausa si no hay actividad en 7 días
  (se reactiva con un clic en el panel).
- Gmail: ~500 correos al día. La app se detiene en 450 y lo avisa en el historial.

## 8. Compartir la app con otras personas
**Administración → Resumen → Compartir la app**: envía el enlace por WhatsApp o muestra el QR.
Cada persona abre el enlace → toca **Instalar** (iPhone: Compartir → Agregar a inicio) → crea su cuenta
(entra en Free) → activa las notificaciones. Tú la ves en **Usuarios** y le das Pro con una key.

## 9. Ocultar el código (recomendado antes de vender)
Hoy el repositorio es público. Para que nadie pueda ver ni copiar el proyecto:
1. Crea una cuenta gratis en https://dash.cloudflare.com → **Workers & Pages** → **Create** → pestaña **Pages**
   → **Connect to Git** → autoriza GitHub y elige `CodeFixService/Aplicaciones`.
2. Configuración: *Framework preset* **None**, *Build command* vacío, *Build output directory* `/` → **Save and Deploy**.
   Te da una dirección gratis tipo `https://aplicaciones.pages.dev`.
3. En GitHub: **Settings → General → Danger Zone → Change visibility → Private**.
   (GitHub Pages deja de funcionar; Cloudflare sigue publicando cada cambio en `main`.)
4. En Supabase → **Authentication → URL Configuration**: cambia **Site URL** y **Redirect URLs** a la nueva dirección.
5. Vuelve a compartir el enlace nuevo (Administración → Compartir la app ya lo muestra solo).

> Toda app web descarga su código al celular para funcionar, eso no se puede evitar. Lo que protege tu
> negocio es el servidor: sin tu cuenta de administrador nadie puede activar Pro ni enviar notificaciones.

## 10. (Opcional) Archivo APK para Android
No hace falta (la app instalada desde el enlace ya recibe notificaciones), pero si quieres un archivo `.apk`:
https://www.pwabuilder.com → pega la dirección de la app → **Package for stores** → **Android** → descarga.
Para publicarla en Google Play se necesita una cuenta de desarrollador (pago único de 25 USD).
