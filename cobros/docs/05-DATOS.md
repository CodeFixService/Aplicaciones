# 5. Base de datos (Supabase nuevo, solo para esta app)

Proyecto Supabase **propio**, por ejemplo con el nombre `libreta-cobros` y región São Paulo. No comparte tablas, usuarios ni claves con CodeFix.
Se instala con un solo archivo `cobros/supabase/instalar.sql`, que se puede correr de nuevo sin romper nada.
Todas las fechas se guardan en UTC y se muestran en hora de Chile (`America/Santiago`).

## Tablas
| Tabla | Para qué | Campos principales |
|---|---|---|
| `ajustes` | Una sola fila con la configuración global (solo el admin escribe) | precios, link de Mercado Pago, datos de transferencia del admin, días de prueba, **límites del plan Normal (jsonb)**, versión de términos, versión mínima, clave push pública |
| `perfiles` | Una fila por usuario de Supabase | nombre, términos aceptados (fecha y versión), prueba usada |
| `negocios` | La libreta | dueño, nombre, rubro, WhatsApp, datos bancarios, vencimiento por defecto, límite general, PIN activo, saldo a favor, logo, color, **plan, premium_hasta, en_prueba**, estado (activo o suspendido) y motivo |
| `miembros` | Quién entra a cada negocio | negocio, usuario, rol (`dueno` o `ayudante`), activo |
| `invitaciones` | Links para ayudantes | código (guardado con hash), negocio, vence, usada por |
| `clientes` | Deudores | nombre, nombre normalizado (para buscar sin tildes), apodo, teléfono, RUT, nota, límite, estado (`activo`, `solo_cobro` o `archivado`), **saldo (lo mantiene el servidor)**, próximo vencimiento, último movimiento, código del link, PIN (con hash), intentos y bloqueo |
| `movimientos` | El libro (no se edita) | **id creado en el celular**, negocio, cliente, tipo (`cargo`, `abono` o `ajuste`), monto (entero > 0), signo (para el ajuste), medio, descripción, fecha, vence, venta en cuotas, creado por, **anulación (fecha, quién y motivo)**, confirmación del cliente (`pendiente`, `reconocido` o `reclamado`), motivo del reclamo, respuesta del negocio, si cuenta en el plan |
| `ventas_cuotas` | Cabecera de cada venta en cuotas | cliente, cargo asociado, descripción, total, pie, n, frecuencia, primera fecha, estado |
| `cuotas` | Calendario | venta, número, monto, vence, pagado, estado |
| `comprobantes` | Lo que sube el cliente | cliente, monto, fecha de la transferencia, foto, comentario, estado, motivo de rechazo, abono creado, revisado por y cuándo |
| `recordatorios` | Registro legal de cada cobro | cliente, canal (`whatsapp` o `push`), tono, enviado por, cuándo |
| `productos` | Botones frecuentes | nombre, precio, orden |
| `uso_mensual` | Contadores del plan | negocio, mes, movimientos y comprobantes |
| `notificaciones` | Bandeja dentro de la app | para quién (usuario), título, texto, link, leído |
| `push_subs` | Celulares con avisos | usuario **o** sesión del cliente, endpoint (único), claves |
| `sesiones_cliente` | Sesión del link después del PIN | código (con hash), cliente, vence (30 días) |
| `solicitudes_pago` | "Ya pagué" de Premium | negocio, monto, comprobante, estado, revisado por |
| `keys` | Keys Premium | código (con hash), meses, precio, usada por, cuándo, revocada |
| `feriados` | Feriados de Chile (2026–2027, se agregan cada año) | fecha, nombre |
| `auditoria` | Todo cambio sensible | negocio, usuario, acción, tabla, fila, antes, después, cuándo |
| `limites_velocidad` | Contador anti-abuso | clave, ventana, contador |

**Saldo**: un disparador (trigger) lo actualiza en `clientes` cada vez que se crea o anula un movimiento. Así la lista carga
rápido sin sumar todo cada vez. Una tarea semanal recalcula todos los saldos desde cero y avisa al admin si alguno no cuadra.

## Permisos (RLS)
- **Todas** las tablas tienen RLS activado.
- Funciones de ayuda: `es_miembro(negocio)`, `es_dueno(negocio)` y `es_admin()` (este último, por el correo fijo y confirmado).
- Dueño y ayudante **leen** solo las filas de su negocio. Las tablas importantes (`movimientos`, `clientes`, `cuotas`, `comprobantes`,
  `negocios.plan`) **no se escriben directo**: solo a través de funciones del servidor que validan todo (sección siguiente).
- El ayudante no lee `auditoria`, `solicitudes_pago` ni los reportes.
- El admin lee `negocios`, `uso_mensual`, `solicitudes_pago`, `keys` y `ajustes`, pero **no** `clientes`, `movimientos` ni `comprobantes`.
- El cliente (sin cuenta) **no tiene acceso a ninguna tabla**. Solo puede llamar a las funciones `portal_*`.
- Almacenamiento: `comprobantes` (privado, máx. 1 MB, solo imágenes), `logos` (lectura pública, máx. 100 KB) y `pagos` (privado).

## Funciones del servidor (todas validan las reglas de `03-REGLAS.md`)
| Función | Quién | Qué hace |
|---|---|---|
| `crear_negocio(...)` | Dueño nuevo | Crea el negocio, lo hace miembro dueño, activa 14 días de prueba (si no la usó) |
| `crear_cliente(...)` / `editar_cliente` / `archivar_cliente` / `borrar_cliente` | Miembros (borrar: dueño) | Revisa el cupo del plan, los duplicados y el formato |
| `registrar_movimiento(id, cliente, tipo, monto, ...)` | Miembros | Revisa el límite de crédito, el estado del cliente, el abono contra el saldo, la fecha y el contador del plan. **No hace nada si el id ya existe** (por si llega dos veces) |
| `anular_movimiento(id, motivo)` | Dueño, o ayudante solo con lo suyo en 10 minutos | Anula, recalcula el saldo y las cuotas, y deja auditoría |
| `crear_venta_cuotas(...)` / `anular_venta_cuotas` | Miembros | Calcula el calendario, crea el cargo y el pie, y revisa el plan |
| `puede_recordar(cliente)` → `{ok, proxima}` | Miembros | Revisa horario, feriado y frecuencia |
| `registrar_recordatorio(cliente, canal, tono)` | Miembros | Vuelve a validar y guarda. Si es push, lo envía |
| `aprobar_comprobante(id, monto)` / `rechazar_comprobante(id, motivo)` | Miembros | Crea el abono y avisa al cliente |
| `responder_reclamo(mov, mantener, comentario)` | Dueño | Mantiene o anula el cargo reclamado |
| `invitar_ayudante()` / `aceptar_invitacion(codigo)` / `quitar_ayudante` | Dueño (Premium) | Hasta 3 ayudantes |
| `regenerar_link(cliente)` / `cambiar_pin(cliente, pin)` | Miembros | El link anterior deja de servir |
| `portal_entrar(codigo, pin)` → sesión | Cliente | Revisa el PIN y el límite de intentos y entrega una sesión de 30 días |
| `portal_ver(sesion)` | Cliente | Devuelve **solo** lo permitido (sin notas internas) |
| `portal_confirmar(sesion, mov, reconoce, motivo)` | Cliente | Reconoce o reclama un cargo |
| `portal_comprobante(sesion, monto, fecha, foto, comentario)` | Cliente | Revisa los límites. La foto se sube con un link firmado de un solo uso |
| `portal_push(sesion, suscripcion)` / `portal_salir(sesion)` | Cliente | Activa los avisos o cierra la sesión |
| `usar_key(codigo)` / `solicitar_pago(...)` | Dueño | Premium |
| `admin_plan(negocio, accion, dias)` / `admin_suspender` / `admin_keys` / `admin_aviso` / `admin_resumen` | Admin | Panel |
| `exportar_csv()` | Dueño | Todos sus datos (derecho del usuario) |
| `ping()` | Cualquiera | Respuesta mínima para que el proyecto gratis no se pause |

## Tareas automáticas (pg_cron, hora de Chile)
| Cuándo | Tarea |
|---|---|
| Todos los días a las 00:10 | Actualizar el estado de las cuotas (por vencer y atrasadas) y el próximo vencimiento de cada cliente. Vencer planes: gracia y luego bajar a Normal, aplicando las reglas de `02-PLANES.md` |
| Todos los días a las 09:00 | Resumen al dueño: bandeja para todos y push para Premium. Avisos de plan o prueba por vencer |
| Lunes a sábado a las 10:00, salvo feriados | Avisos automáticos de cuota (Premium): mañana vence o atrasada, respetando la regla 2/semana |
| Domingos a las 03:00 | Borrar fotos de comprobantes revisados con más de 90 días. Limpiar sesiones vencidas, contadores anti-abuso e invitaciones viejas. Recalcular saldos y comparar |

El envío de push lo hace una **Edge Function** propia (`cobros/supabase/functions/enviar`), con sus propias claves VAPID.

## Espacio (plan gratis: 500 MB de datos y 1 GB de archivos)
- Un movimiento ocupa unos 300 bytes con índices, así que caben **más de 1 millón de movimientos**.
  Con 200 negocios de 1.000 movimientos al mes, alcanza para unos 5 años.
- Una foto de comprobante pesa unos 150 KB y se borra a los 90 días: caben unas 6.000 a la vez.
- El admin ve en **Resumen** el uso de la base de datos. Al pasar el 70 % se recomienda pasar a Supabase Pro.
