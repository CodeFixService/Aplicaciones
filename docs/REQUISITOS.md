# Requisitos — versión 2 (cuentas, Free/Pro, push)

Pedido por Josué (administrador general). Servidor elegido: **Supabase (gratis)**. Correo: **Gmail**.

## Cuentas y roles
- [x] Cada persona crea su cuenta e inicia sesión con **correo y contraseña**; el servidor valida si son correctos.
- [x] Recuperar contraseña por correo.
- [x] Cada usuario ve **solo sus propios datos** (en el servidor y separados por usuario en el celular).
- [x] Un único **administrador general**: Josué (juanjosuecastilloloyola@gmail.com), reconocido solo con el correo confirmado.
  La contraseña no está en el código.
- [x] Solo el administrador ve y usa el panel de **Administración** (keys, usuarios, avisos, ajustes).
- [x] Usuarios y empresas **no pueden ver ni crear keys** (bloqueado en el servidor, probado).

## Free y Pro
- [x] Al registrarse el usuario entra en **Free**.
- [x] Con la key del administrador su cuenta pasa a **Pro** al instante, en todos sus dispositivos.
- [x] Keys aleatorias, de un solo uso, con duración (1/3/6/12 meses o permanente) y precio registrado.
- [x] El administrador puede dar/quitar Pro, renovar, suspender y revocar keys.
- [x] Reparto Free/Pro aplicado (ver README).

## Notificaciones
- [x] **Push real** programado: el administrador avisa a todos / Pro / Free y les llega automáticamente aunque la app esté cerrada.
- [x] El mismo aviso también por **correo** (Gmail).
- [x] Entre usuarios: cada negocio Pro tiene un enlace/QR; sus clientes se suscriben y reciben sus campañas por push y correo.
- [x] Bandeja de avisos dentro de la app.

## Marca y protección
- [x] Marca **CodeFix · Josué Castillo** fija en todas las pantallas y en las fichas Free.
- [x] Licencia propietaria (LICENSE).
- [x] La versión Pro depende del servidor: una copia de la app no puede activar Pro sin el administrador.
- [ ] Pendiente: pasar el repositorio a **privado** y publicar desde Cloudflare Pages (gratis) para que nadie copie el código.

## Pendiente del lado de Josué
- [ ] Seguir `docs/CONFIGURAR.md` y enviar la clave **anon public**.
- [ ] Definir precios de la versión Pro.

## Ideas para después (si va bien)
- Plan Supabase Pro para más capacidad; dominio propio (y correo con Resend en vez de Gmail).
- Estadísticas de clics de las campañas.
- Más apps dentro de la misma cuenta.
