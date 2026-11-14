# APP.md

(Mapa completo pendiente: G42j.)

## ✉️ Correo (G42f, 6.19 · bd 5.50 · enviar 3.5)
- CodeFix → negocios/todos: Gmail de Josué (app_secrets gmail_*), se pone en CM → Control → ✉️ Correo.
- Tienda → SUS clientes (pedido_correo, avisos con email): Gmail del negocio en Más → 🏪 Mi tienda → ✉️ Correo (tabla negocio_correo, sin políticas; rpc mi_correo / mi_correo_guardar / mi_correo_quitar). Sin él no se manda correo (nunca cae al de CodeFix).
- La función "enviar" pregunta notif_correo(id) por cada notificación con email (solo el servidor puede).

## 🧠 Del núcleo: falta aplicar aquí
- ✅ G37 (núcleo 2.76): shared/comprobante.js e impresora.js vienen del núcleo (no editar aquí: SaaS/nucleo). Logo y firma (boleta_estado) los da window.CFX_COMPROBANTE_DATOS al final de shared/cuenta.js. La 🧾 boleta SII (boleta_*) sigue en el SQL de Despega.
- ✅ G42e (núcleo 2.78, 6.24): utilidades Bootstrap 5.3.8 con los colores de la tienda (--bs-* → --cfx-*), claro/oscuro y Colores a tu gusto. El diseño galáctico es solo del CM.
- ✅ G48 (núcleo 2.77): ✋ secciones del Más se mueven completas desde su título (también en el celular); 🎨 Mi perfil → Color y modo → Colores a tu gusto (fondo, texto, íconos y +).
- ✅ G42 (núcleo 2.75): ⬆️ 🪟 📌 ✋ activos (Más → secciones y opciones se ordenan manteniendo presionado); 🔐 aviso de enlace tapado; links de boleta/pago con CFX_URL.
