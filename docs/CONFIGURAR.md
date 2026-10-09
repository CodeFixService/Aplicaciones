# Configurar el servidor (una sola vez)

Todo se hace desde el navegador del celular o la PC, en https://supabase.com/dashboard → proyecto **CodeFix**.
Tiempo: unos 15 minutos.

## 1. Crear la base de datos
1. Menú izquierdo → **SQL Editor** → **New query**.
2. Copia **todo** el archivo [`supabase/schema.sql`](../supabase/schema.sql) y pégalo.
3. Toca **Run**. Debe decir *Success*.

## 2. Crear el enviador de notificaciones
1. Menú izquierdo → **Edge Functions** → **Deploy a new function** → **Via Editor**.
2. Nombre: `enviar` (exacto, en minúsculas).
3. Borra el código de ejemplo, pega **todo** [`supabase/functions/enviar/index.ts`](../supabase/functions/enviar/index.ts) y toca **Deploy**.
4. Entra a la función → **Settings** (Details) → desactiva **Verify JWT** / **Enforce JWT verification** → **Save**.

## 3. Activar el envío automático (cada minuto)
1. **SQL Editor** → **New query**.
2. Pega [`supabase/cron.sql`](../supabase/cron.sql) → **Run**.

## 4. Inicio de sesión y correos de confirmación
1. **Authentication** → **URL Configuration**:
   - **Site URL**: `https://codefixservice.github.io/Aplicaciones/`
   - **Redirect URLs** → Add: `https://codefixservice.github.io/Aplicaciones/**`
2. **Authentication** → **Emails** → **SMTP Settings** → activa **Enable custom SMTP**:
   - Host `smtp.gmail.com` · Port `465`
   - Username: tu Gmail · Password: la **contraseña de aplicación** de Google (paso 5)
   - Sender email: tu Gmail · Sender name: `CodeFix`
   - Sin esto Supabase solo envía 2 correos por hora y a nadie fuera de tu equipo: tus clientes no podrían confirmar su cuenta.

## 5. Contraseña de aplicación de Gmail
1. https://myaccount.google.com/security → activa **Verificación en 2 pasos** (si no la tienes).
2. https://myaccount.google.com/apppasswords → nombre `CodeFix` → **Crear**.
3. Copia las 16 letras. Se usan en el paso 4 y en el paso 7. **No las compartas con nadie.**

## 6. Enviar la clave pública
**Project Settings** → **API Keys** → pestaña **Legacy API Keys** → copia la clave **anon / public**
(empieza con `eyJ…`). Es pública, se puede compartir: envíala por el chat para conectar la app.

> La clave **service_role** es secreta: no la compartas nunca.

## 7. Activar tu cuenta de administrador (cuando la app esté publicada)
1. Abre la app → **Crear cuenta** con `juanjosuecastilloloyola@gmail.com` y una contraseña nueva.
2. Confirma el correo con el enlace que te llega e inicia sesión. Verás la etiqueta **ADMIN**.
3. **Administración → Ajustes**:
   - **Generar claves push** (una sola vez).
   - **Gmail**: tu correo + la contraseña de aplicación + nombre del remitente → Guardar.
4. **Avisos** → *Prueba: solo a mí* → Enviar. Debe llegarte la notificación y el correo.

## Límites del plan gratis (suficientes para empezar)
- Supabase Free: 50 000 usuarios, 500 MB de datos, 1 GB de imágenes. Se pausa si no hay actividad en 7 días
  (se reactiva con un clic en el panel).
- Gmail: ~500 correos al día. La app se detiene en 450 y lo avisa en el historial.
