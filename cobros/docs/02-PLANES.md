# 2. Planes: Normal (gratis) y Premium (mensual)

## Cómo se pensaron los límites
- El plan **Normal sirve de verdad** para un negocio chico, así el negocio se acostumbra y le cuenta a otros.
- Los límites aparecen **justo cuando el negocio ya depende de la app**, a las 2–4 semanas de uso real en un almacén,
  y no el primer día.
- **Nunca se bloquea cobrar.** Registrar abonos, aprobar comprobantes y ver saldos funciona siempre, en cualquier plan y
  aunque el negocio esté sobre el límite. Solo se frena **agregar más deuda o más clientes**.
- **Nunca se borra nada** por bajar de plan.
- Cada límite se valida **en el servidor**. Una copia de la app no puede saltárselo.

## Tabla de límites
| Función | Normal (gratis) | Premium |
|---|---|---|
| Clientes activos (los archivados no cuentan) | **20** | Ilimitados |
| Movimientos nuevos (fiados + abonos) al mes | **250** | Ilimitados |
| Ventas en cuotas activas | **2** | Ilimitadas |
| Botones de productos frecuentes | **6** | 30 |
| Historial que se ve en pantalla | Últimos **6 meses** (el saldo siempre es exacto) | Completo |
| Link del cliente con PIN, confirmar cargos y subir comprobante | ✓ | ✓ |
| Comprobantes recibidos al mes | **15** | 300 |
| Recordatorio por WhatsApp (manual, un toque) | ✓ ilimitado (dentro de la ley) | ✓ |
| Tono del mensaje | 1 (amable) | 3 (amable, neutral, firme) + mensaje propio |
| Aviso **push automático al cliente** (cuota por vencer, abono recibido) | — | ✓ |
| Resumen diario al dueño ("hoy vencen 4 por $38.000") | Dentro de la app | Push al celular |
| Límite de fiado | Uno general para todos | Uno distinto por cliente |
| Puntaje del cliente (buen pagador / regular / riesgoso) | — | ✓ |
| Tablero | Mes actual | Histórico, gráficos, mejores y peores pagadores |
| Estado de cuenta en PDF para el cliente | — | ✓ |
| Exportar | CSV con todos los datos (derecho del usuario) | Excel ordenado y PDF |
| Ayudantes | — | Hasta 3 |
| Logo y color del negocio en el link del cliente | — | ✓ |
| Texto "Hecho con Libreta de Cobros" en el link del cliente | Se muestra | Se quita |
| Soporte | Correo | WhatsApp con prioridad |

¿Por qué esos números?
- **20 clientes**: alcanza para probar con los clientes fijos, pero un almacén normal fía a 30–80 vecinos. Ahí está el salto.
- **250 movimientos**: 20 clientes con 2–3 movimientos por semana cada uno. Solo lo pasa quien la usa en serio.
- **2 cuotas activas**: deja probar la función estrella de la venta por catálogo sin regalarla.
- **15 comprobantes**: protege los 1 GB de fotos gratis de Supabase y empuja a Premium a quien más cobra.

## Prueba gratis: 14 días de Premium al crear la cuenta
- Toda cuenta nueva parte con **14 días de Premium completo**, sin tarjeta. En la industria esto se llama "prueba al revés".
  Funciona mejor que partir en gratis, porque el negocio prueba los avisos automáticos y el puntaje y después los extraña.
- Avisos el día 10 y el día 13: *"Te quedan X días de Premium"*. El día 14 la cuenta pasa sola a Normal.
- Es una prueba **por correo**. El servidor la marca como usada y no se repite.

## Cobro mensual de Premium
Mismo sistema que CodeFix Apps, pero en su propia base de datos:
1. El negocio toca **Hazte Premium** y ve el precio, el link de pago (Mercado Pago) y tus datos para transferir.
2. Paga y toca **Ya pagué**. Puede subir el comprobante.
3. Te llega aviso en **Administración**. Apruebas con un toque y se suman **30 días** desde la fecha de vencimiento,
   o desde hoy si ya había vencido.
4. También puedes generar **keys** de 1, 3, 6 o 12 meses (de un solo uso) para vender en persona.
5. Avisos de vencimiento: 7, 3 y 1 día antes, y el mismo día.
6. **Tres días de gracia** después de vencer, con Premium activo y un aviso en rojo. Al día 4 la cuenta pasa a Normal.

Precio: **pendiente de que tú lo definas.** Para referencia: Premium a $4.990 al mes o $49.900 al año (2 meses gratis).
Se cambia desde **Administración → Ajustes** sin tocar código.

## Qué pasa al bajar a Normal (al terminar la prueba o el Premium)
| Situación | Qué pasa |
|---|---|
| Tiene más de 20 clientes activos | Todos siguen visibles. Los 20 **con más movimiento reciente** quedan normales. El resto queda en "solo cobro": se pueden registrar abonos, aprobar comprobantes y mandar recordatorios, pero no agregarles deuda. Si archiva clientes saldados, libera cupos |
| Tiene más de 2 ventas en cuotas | Siguen corriendo hasta terminar. No puede crear una nueva hasta bajar de 2 |
| Ayudantes | Quedan pausados (no pueden entrar). Vuelven solos al renovar |
| Límites por cliente | Se usa el límite general |
| Logo y color | Vuelve el diseño estándar con "Hecho con…" |
| Historial de más de 6 meses | Queda guardado, no se borra. Se ve de nuevo al volver a Premium y se puede exportar en CSV |
| Avisos automáticos programados | Se cancelan. Los recordatorios manuales siguen |

Cada vez que el negocio choca con un límite, la pantalla dice exactamente cuál fue y qué gana con Premium,
con un botón **Hazte Premium**. Nunca muestra un error genérico.
