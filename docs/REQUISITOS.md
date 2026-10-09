# Requisitos — versión 2 (cuentas, Free/Pro, push)

Anotado a partir de lo que pidió Josué (administrador general). Estado: **pendiente de decidir el servidor**.

## Cuentas y roles
- [ ] Cada persona crea su cuenta e inicia sesión con **usuario (correo) y contraseña**; el servidor valida si son correctos.
- [ ] Cada usuario ve **solo sus propios datos** (clientes, fichas, campañas, ventas).
- [ ] Un único **administrador general**: Josué (juanjosuecastilloloyola@gmail.com).
  La contraseña se define al crear la cuenta en el servidor; **no se guarda en el código ni en el repositorio**.
- [ ] Solo el administrador ve el panel de **Licencias**: escribe el nombre de la empresa, genera la key y se la envía.
- [ ] Los usuarios **no pueden crear keys** ni ver el panel de administración (bloqueado en el servidor, no solo escondido).

## Free y Pro
- [ ] Al registrarse el usuario entra en **Free**: misma app, con buenas opciones pero limitadas.
- [ ] Al pegar la key que le da el administrador, su cuenta pasa a **Pro** al instante (en todos sus dispositivos).
- [ ] El administrador puede ver, activar, suspender o renovar cuentas.
- Propuesta de reparto (por confirmar):

| Función | Free | Pro |
|---|---|---|
| Diseñar fichas | 4 plantillas, máx. 5 guardadas, marca de agua | Todas las plantillas, ilimitadas, sin marca de agua, kit de marca |
| Clientes | máx. 30 | Ilimitados, importación masiva, segmentos |
| Envío por WhatsApp (manual) | Sí | Sí |
| **Notificaciones push automáticas** a suscriptores | No | Sí, programadas |
| **Campañas por correo** | No | Sí |
| Estadísticas (entregas, aperturas, clics) | No | Sí |
| Sincronización en la nube / varios dispositivos | No | Sí |
| Caja Rápida | Básica | Reportes avanzados, inventario, exportación |

## Notificaciones
- [ ] Notificaciones **push reales**: el administrador (y los usuarios Pro) programan un aviso y a la hora indicada **les llega a todos automáticamente**, sin pasar por WhatsApp, aunque la app esté cerrada.
- [ ] Opcional: el mismo aviso también por **correo**.
- [ ] Notificaciones entre usuarios (por definir quién puede enviar a quién).

## Marca y protección
- [ ] App marcada como de **CodeFix / Josué** de forma visible y fija.
- [ ] Que no se pueda revender: licencia validada en el servidor y código fuente fuera de un repositorio público.

## Decisiones pendientes
1. Servidor: Supabase (gratis, recomendado) / Firebase / computador propio encendido.
2. ¿Quién puede enviar notificaciones entre usuarios?
3. Confirmar el reparto Free/Pro y los precios.
