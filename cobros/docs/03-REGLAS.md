# 3. Reglas y validaciones

Regla de oro: **todo se valida dos veces.** Primero en la pantalla, para avisar al tiro y en simple, y después en el servidor
(reglas de Supabase y funciones de la base de datos), que tiene la última palabra. La pantalla nunca es la única defensa.

## 3.1 Cuentas y acceso
| Regla | Detalle |
|---|---|
| Registro | **Abierto** para dueños: correo, contraseña y nombre del negocio. Así crece solo (decisión pendiente, ver `09-PLAN.md`) |
| Correo | Formato válido, en minúsculas y sin espacios. No se aceptan correos desechables (lista de dominios bloqueados) |
| Contraseña | Mínimo 8 caracteres, con al menos una letra y un número. No puede ser igual al correo. Indicador de seguridad |
| Términos | Para crear la cuenta hay que marcar que se aceptan los Términos y la Privacidad. Se guarda la fecha y la versión aceptada |
| Recuperar contraseña | Por correo. Requiere el SMTP propio con Gmail (ver `08-PREPARATIVOS.md`) |
| Intentos de inicio de sesión | Los limita Supabase. Después de 5 errores, la pantalla espera 30 s antes de dejar intentar de nuevo |
| Superadmin | Lo reconoce **solo** el correo fijo en el servidor (`juanjosuecastilloloyola@gmail.com`) con el correo confirmado. No hay ningún botón para convertirse en admin |
| Cuenta suspendida (por el admin) | Puede entrar y exportar su CSV, pero no anotar nada. Ve un aviso con el motivo |
| Ayudante | Entra con el link de invitación (de un solo uso, vence en 48 h) y crea su propia contraseña. El dueño puede quitarlo cuando quiera y pierde el acceso al instante |
| Bloqueo local (opcional) | PIN de 4 dígitos para abrir la app en ese celular. Sirve si se comparte el teléfono del negocio |
| Cerrar sesión | Borra los datos guardados en ese celular, salvo los movimientos sin sincronizar: si hay pendientes, avisa y no deja cerrar hasta sincronizar |

## 3.2 Negocio (Ajustes)
| Campo | Validación |
|---|---|
| Nombre del negocio | 2–50 caracteres. Obligatorio |
| Rubro | Lista: almacén, feria, catálogo, emprendimiento, servicios, educación, club, personal, otro |
| WhatsApp del negocio | Formato chileno `+56 9 XXXX XXXX` (se normaliza a `+569XXXXXXXX`). Si no es de Chile: formato internacional de 8–15 dígitos. Obligatorio para cobrar |
| Datos para transferir | Banco (lista de bancos chilenos y "Otro"), tipo de cuenta (Corriente, Vista/RUT, Ahorro), número (solo dígitos, 4–20), **RUT del titular con dígito verificador válido (módulo 11)**, nombre del titular (2–60) y correo (opcional, válido) |
| Vencimiento por defecto | Al día, 7, 15 o 30 días, o fin de mes |
| Límite de fiado general | $0 (sin límite) a $5.000.000 |
| PIN del link de clientes | Activado por defecto. Se puede apagar con una advertencia de privacidad |
| Permitir saldo a favor | Apagado por defecto (ver abonos) |
| Logo (Premium) | Imagen de hasta 5 MB. Se achica en el celular a 256 × 256 webp (menos de 40 KB) antes de subirla |
| Color (Premium) | 8 colores probados para que el texto se lea bien. No se acepta un color libre |

## 3.3 Clientes (deudores)
| Campo | Validación |
|---|---|
| Nombre | 2–60 caracteres. Obligatorio. Se quitan los espacios dobles |
| Nombre repetido | Si ya existe uno igual (sin importar mayúsculas ni tildes), avisa: "Ya tienes a *Juan Pérez*. ¿Es otra persona?". Si es otra, sugiere agregar un apodo |
| Apodo / referencia | Opcional, 0–30 ("la vecina del 5") |
| Teléfono | Opcional al crear, **obligatorio para enviar el recordatorio o el link**. Misma validación que el WhatsApp del negocio. Si el teléfono se repite en otro cliente, avisa |
| RUT | Opcional, con validación módulo 11 |
| Nota | Opcional, 0–200 |
| Límite de fiado (Premium) | $0 a $5.000.000. Si queda vacío, se usa el límite general |
| Estados | **Activo**, **Solo cobro** (sobre el límite del plan o bloqueado por el dueño: no admite más deuda), **Archivado** (no cuenta en el plan; solo se puede archivar con saldo $0, y se reactiva cuando quieras si hay cupo) |
| Borrar cliente | Solo el dueño, solo con saldo $0, y escribiendo el nombre para confirmar. Se borran sus datos personales y los movimientos quedan **anonimizados** para que los totales sigan cuadrando |
| Cupo del plan | Al crear o reactivar, el servidor cuenta los clientes activos. Si ya hay 20 en Normal, rechaza con el mensaje del límite |

## 3.4 Movimientos (lo más importante)
La libreta funciona **como un libro contable: nunca se edita ni se borra un movimiento.** Para corregir, se **anula**
(queda tachado, con motivo, quién y cuándo) y se anota de nuevo. Así nadie puede "arreglar" una deuda sin dejar rastro.

| Tipo | Efecto en el saldo |
|---|---|
| **Fiado / cargo** | Suma deuda |
| **Abono / pago** | Resta deuda |
| **Ajuste** (solo el dueño, con motivo obligatorio) | Suma o resta. Ej.: "descuento acordado", "perdonado" |
| **Anulación** | Marca de un movimiento; deja de contar en el saldo |

| Regla | Detalle |
|---|---|
| Monto | **Entero en pesos**, de $1 a $9.999.999. Sin decimales. Teclado numérico con miles separados por punto al escribir |
| Descripción | Opcional, 0–80 caracteres. Se puede llenar tocando un producto frecuente |
| Fecha | Por defecto, ahora. El dueño puede elegir una fecha hasta 1 año atrás (para pasar el cuaderno a la app); el ayudante, hasta 3 días atrás. **Nunca una fecha futura** |
| Vencimiento del fiado | Según la configuración por defecto, editable. Debe ser igual o posterior a la fecha del fiado |
| Límite de fiado | Si con el cargo el saldo pasa el límite: el dueño ve una advertencia y puede seguir; **el ayudante no puede** |
| Abono mayor que el saldo | Se rechaza con "El cliente debe $X". Si el negocio activó "Permitir saldo a favor", deja seguir y el saldo queda negativo, mostrado como **"A favor del cliente"** |
| Abono con saldo $0 | Solo si está permitido el saldo a favor |
| Medio del abono | Efectivo, transferencia u otro. Se guarda para el reporte |
| Doble toque | Si se anota el mismo cliente, tipo y monto antes de 60 segundos, pregunta "¿Anotar de nuevo?". Además, cada movimiento lleva un **id único creado en el celular**, así un reintento sin internet nunca se duplica en el servidor |
| Deshacer | Después de guardar aparece "Deshacer" por 8 segundos. Deshacer lo anula con el motivo "deshecho al instante" |
| Anular | El dueño anula cualquier movimiento, con motivo obligatorio (5–100 caracteres). El ayudante solo anula **lo suyo** y solo en los primeros **10 minutos** |
| Movimiento del plan | Cada fiado y cada abono suma 1 al contador del mes (zona horaria America/Santiago). Los abonos **siempre** se permiten, aunque el contador esté lleno: los que pasan el límite no se cuentan |
| Saldo | Siempre calculado por el servidor: suma de fiados y ajustes, menos abonos, sin contar los anulados. Nunca se escribe a mano |

## 3.5 Ventas en cuotas
| Regla | Detalle |
|---|---|
| Datos | Descripción (obligatoria, 2–80), total ($1.000–$9.999.999), pie opcional (menor que el total), número de cuotas (2–24), frecuencia (semanal, quincenal o mensual) y fecha de la primera cuota (hoy o hasta 60 días más) |
| Cálculo | Cuota = (total − pie) ÷ n, en pesos enteros. **La diferencia por redondeo va en la última cuota**, para que la suma sea exacta. Se muestra el calendario completo antes de confirmar |
| Mensual | Si el día no existe en un mes (por ejemplo el 31), se usa el último día de ese mes |
| Cómo se registra | Un fiado por el total (y, si hay pie, un abono por el pie). Las cuotas son un **calendario de vencimientos**, no deudas separadas |
| Cómo se pagan | Cada abono se aplica **a la cuota más antigua sin pagar**. Una cuota puede quedar pagada en parte |
| Estados | Pendiente, por vencer (3 días o menos), **atrasada** (vencida y sin pagar completa) y pagada. Una tarea diaria en el servidor los actualiza |
| Anular la venta | Anula el fiado y el calendario. Si ya hubo abonos, quedan como saldo a favor o se anulan aparte (la app pregunta) |
| Plan | Normal: 2 ventas en cuotas activas (con cuotas por pagar) |

## 3.6 Link del cliente y PIN
| Regla | Detalle |
|---|---|
| Link | `…/cobros/c/#<código>`, con un código aleatorio de **24 caracteres** generado con criptografía segura. Va después del `#` para que no quede en los registros del servidor |
| Revocar link | El dueño genera uno nuevo y el anterior deja de funcionar al instante |
| PIN | Por defecto, los **últimos 4 dígitos del teléfono del cliente**. El dueño puede ponerle otro. Si el cliente no tiene teléfono, el PIN se define al compartir |
| Intentos | 5 errores bloquean ese link por 15 minutos. 20 errores en un día lo bloquean hasta que el dueño lo reactive. Todo se cuenta en el servidor |
| Sesión del cliente | Después del PIN correcto queda abierto 30 días en ese celular. El botón "Salir" lo cierra |
| Qué ve el cliente | Solo **su** saldo, sus movimientos (sin las notas internas del negocio), sus cuotas, los datos para transferir y el nombre del negocio. Nunca ve otros clientes |
| Acceso técnico | El cliente **no tiene acceso a ninguna tabla**: todo pasa por funciones del servidor que reciben el código y el PIN y devuelven solo lo permitido |

## 3.7 Comprobantes (los sube el cliente)
| Regla | Detalle |
|---|---|
| Datos | Monto que dice haber pagado ($1 a su saldo + $100.000), fecha de la transferencia (hasta 30 días atrás, nunca futura), foto (opcional pero recomendada) y comentario (0–100) |
| Foto | JPG, PNG, WEBP o HEIC, de hasta 10 MB al elegirla. **Se achica en el celular** a 1280 px webp (menos de 300 KB). El servidor rechaza más de 1 MB o un archivo que no sea imagen |
| Límites | 3 comprobantes **pendientes** a la vez por cliente, y máximo 5 por día por link. Además, el límite mensual del plan del negocio |
| Revisión | El dueño o el ayudante aprueban (se crea un abono con medio "transferencia" y el monto, que se puede corregir) o rechazan con motivo (mal monto, no llegó, ilegible u otro) |
| Aviso | El cliente ve el resultado en su link y, si activó los avisos, le llega push |
| Fotos viejas | Las fotos de comprobantes ya revisados se borran a los **90 días**. El registro queda (monto, fecha, quién aprobó). Esto cuida el espacio gratis |

## 3.8 Confirmar o reclamar cargos (el cliente)
- Cada fiado nuevo aparece en el link con los botones **"Lo reconozco"** y **"No lo reconozco"**.
- "No lo reconozco" pide un motivo (5–150). El cargo queda **en reclamo**, sigue sumando y se avisa al negocio.
  El negocio lo resuelve: lo mantiene (con un comentario que ve el cliente) o lo anula.
- Si el cliente no responde, el cargo queda "sin confirmar". **No cambia el saldo**: es solo una señal de confianza.
- Cargos confirmados: se ven con un ✓ y, en Premium, mejoran el puntaje.

## 3.9 Recordatorios de cobro (dentro de la ley)
Según el artículo 37 de la Ley 19.496, detalle en `07-LEGAL.md`. **Lo hace cumplir el servidor, no solo la pantalla.**
| Regla | Detalle |
|---|---|
| Horario | Lunes a sábado, de 08:00 a 20:00 (hora de Chile). Domingos y **feriados** no: hay una tabla de feriados chilenos en la base de datos |
| Frecuencia | Máximo **2 recordatorios por semana por cliente**, con al menos **2 días** entre uno y otro. Se cuentan juntos el WhatsApp y el push de cobro |
| Fuera de regla | El botón queda gris con el motivo: "Puedes enviarlo el jueves desde las 08:00" |
| Destinatario | Solo el teléfono del cliente. No hay opción de avisarle a familiares, vecinos ni terceros |
| Contenido | Solo las plantillas aprobadas: amables y sin amenazas. El mensaje propio (Premium) se revisa con una lista de palabras prohibidas ("demanda", "tribunal", "embargo", "DICOM", "abogado", "policía"…) y no se acepta si las tiene |
| Registro | Cada recordatorio queda guardado (fecha, canal, plantilla y quién lo mandó). Sirve como respaldo si hay un reclamo |
| No cuentan como cobro | El aviso de "abono recibido", "comprobante aprobado o rechazado" y "nuevo cargo anotado": son informativos, no cobranza |

## 3.10 Notificaciones
| Para | Evento | Normal | Premium |
|---|---|---|---|
| Negocio | Comprobante nuevo, cargo reclamado, cliente confirmó | Bandeja dentro de la app y push | Igual |
| Negocio | Resumen diario a las 09:00 (vencen hoy, atrasados) | En la bandeja | **Push** |
| Negocio | Plan por vencer, avisos del admin | Bandeja y push | Igual |
| Cliente (con push activado) | Fiado nuevo anotado, abono registrado, comprobante revisado | ✓ | ✓ |
| Cliente | Cuota vence mañana o está atrasada (cuenta como cobro, con las reglas 3.9) | — | ✓ automático |
| Admin | Cuenta nueva, "Ya pagué", reportes del sistema | Bandeja y push | — |

- Push en iPhone: solo si se instaló la app o el link del cliente en la pantalla de inicio (iOS 16.4 o más nuevo). La pantalla lo explica paso a paso.
- Cada celular recibe solo los avisos de la sesión abierta en él. Al cerrar sesión, se borra su suscripción.

## 3.11 Seguridad y anti-abuso
- **Reglas en Supabase (RLS) en todas las tablas**: cada fila tiene `negocio_id` y solo la ven los miembros de ese negocio.
- Las funciones sensibles (cupos del plan, anular, aprobar comprobantes, ver el link del cliente) corren en el servidor con permisos controlados.
- **Nunca** se inserta texto del usuario como HTML en la pantalla (todo con `textContent`): evita inyección de código.
- La clave pública de Supabase va en el código (es pública por diseño). La clave secreta **nunca** sale de Supabase.
- Límites de velocidad: crear clientes (30 por hora), movimientos (300 por hora por negocio), comprobantes (5 por día por link) e intentos de PIN (5 cada 15 minutos).
- Auditoría: anulaciones, ajustes, cambios de límite, borrado de clientes y cambios de plan quedan registrados con quién, cuándo y el antes y después.
- Fotos: el bucket de Supabase es **privado**. Se ven con links firmados que duran 10 minutos.
