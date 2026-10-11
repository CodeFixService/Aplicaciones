# 4. Pantallas

Diseño: **primero el celular** (desde 360 px de ancho), con una mano y botones grandes de al menos 48 px. En el computador se ve
en dos columnas. Modo claro y oscuro automático. Letra grande y opción "Texto más grande". Español de Chile, sin palabras técnicas.

Colores con significado, iguales en toda la app:
- 🔴 **Rojo** = deuda o fiado
- 🟢 **Verde** = pagado o abono
- 🟠 **Naranja** = por vencer
- ⚫ **Gris** = archivado o anulado

## A. Público (sin sesión) — `cobros/`
1. **Portada**: frase de venta, 3 beneficios con dibujos, botones **Crear cuenta gratis** e **Ingresar**, botón **Instalar app** y pie con Términos y Privacidad.
2. **Crear cuenta**: nombre del negocio, rubro, correo, contraseña, casilla de términos. Al terminar entra directo con *14 días de Premium*.
3. **Ingresar** y **¿Olvidaste tu contraseña?**
4. **Bienvenida (3 pasos, se puede saltar)**: tu WhatsApp → tus datos para transferir → anota tu primer fiado.
   Ofrece **"Pasar mi cuaderno"**: crea clientes en fila (nombre, teléfono y saldo inicial) para empezar con lo que ya te deben.

## B. Negocio — `cobros/app/`
Barra de abajo con 4 botones: **Inicio · Clientes · ➕ Anotar · Más**.

### B1. Inicio (tablero)
- Tarjeta grande: **Te deben en total $X**, con la flecha de cómo va contra el mes pasado.
- 3 tarjetas: **Vence hoy** · **Atrasados** · **Recuperado este mes**.
- Lista **"Para cobrar hoy"**: clientes con vencimiento hoy o atrasados, con el botón 💬 Cobrar al lado de cada uno.
- Avisos: comprobantes por revisar (con número), reclamos y prueba o plan por vencer.
- Indicador de conexión: "Sin internet: 3 movimientos por sincronizar".

### B2. Clientes
- Buscador por nombre, apodo o teléfono, sin importar tildes.
- Filtros en chips: Todos · Deben · Atrasados · Por vencer · Al día · Solo cobro · Archivados.
- Orden: mayor deuda · más atrasado · nombre · último movimiento.
- Cada fila: inicial o color, nombre, apodo, **saldo en grande** con su color y un punto de estado. En Premium, el puntaje.
- Contador del plan: "17 de 20 clientes (Normal)".
- Botón flotante **+ Cliente**.

### B3. Ficha del cliente
- Arriba: nombre, teléfono y **saldo gigante** ("Debe $45.300" en rojo o "Al día ✓" en verde). Debajo: límite usado (barra) y puntaje (Premium).
- Botones grandes: **🔴 Fiado** · **🟢 Abono** · **💬 Cobrar** · **🔗 Link**.
- Pestañas:
  - **Movimientos**: estilo chat, con fiados a la derecha y abonos a la izquierda, fecha, descripción, quién anotó y marca ✓ si el cliente confirmó. Al mantener apretado: Anular.
  - **Cuotas**: cada venta en cuotas con su calendario y estado.
  - **Datos**: editar, límite, PIN, revocar link, archivar y borrar.
- Menú: Estado de cuenta en PDF (Premium) y exportar a CSV.

### B4. ➕ Anotar (lo más usado: tiene que tomar 3 segundos)
1. Elegir cliente: los recientes primero, buscador y "+ nuevo" en la misma pantalla.
2. Arriba, el selector **Fiado / Abono**.
3. **Teclado numérico gigante** propio, sin abrir el teclado del celular. Botones rápidos: +$500, +$1.000, +$5.000.
4. Fila de **productos frecuentes** (por ejemplo "Pan $1.500" o "Gas $22.000"). Tocar uno suma su monto y su nombre.
5. Botón **Guardar**. Vibra un poco, muestra el saldo nuevo y la opción "Deshacer" por 8 s.
6. Para abonos, el medio: efectivo, transferencia u otro.
7. Opción "Venta en cuotas" (abre B5).

### B5. Venta en cuotas
Formulario (ver regla 3.5) más la vista previa del calendario. Al confirmar se puede mandar el detalle por WhatsApp al cliente.

### B6. Cobrar por WhatsApp
- Vista previa del mensaje con el tono elegido. Abre WhatsApp con el mensaje listo (`wa.me`), y la persona solo toca enviar.
- Si no se puede mandar todavía (horario o frecuencia): botón gris con la próxima fecha permitida.
- Plantillas (las variables se rellenan solas):
  - **Amable**: "¡Hola {nombre}! 😊 Te escribo de {negocio}. Tu saldo pendiente es de {saldo}. Puedes ver el detalle y pagar por transferencia aquí: {link} (tu PIN son los últimos 4 dígitos de tu teléfono). ¡Gracias!"
  - **Neutral** (Premium): "Hola {nombre}, te recordamos que en {negocio} tienes un saldo de {saldo}{, con una cuota vencida el {fecha}}. Detalle y datos para pagar: {link}"
  - **Firme** (Premium): "Hola {nombre}. Tu cuenta en {negocio} tiene {saldo} vencido desde el {fecha}. Te pedimos ponerte al día o escribirnos para acordar una fecha. Detalle: {link}"
- **Compartir link** (sin cobro): "Hola {nombre}, aquí puedes ver tu cuenta en {negocio} cuando quieras: {link}". No cuenta como recordatorio.

### B7. Comprobantes
Lista de pendientes: foto (se amplía al tocarla), monto, fecha y cliente. Botones **Aprobar** (con el monto editable) y **Rechazar** (con motivo).

### B8. Más
- **Reportes**: Normal ve el mes actual. Premium ve meses anteriores, gráfico de lo fiado contra lo cobrado, mejores y peores pagadores y cobrado por medio de pago. Exportar.
- **Productos frecuentes**: nombre (2–30) y precio. Se ordenan arrastrando.
- **Ayudantes** (Premium): invitar con un link, ver la lista y quitar.
- **Ajustes del negocio** (ver 3.2), **Plantillas** (Premium) y **Apariencia** (Premium).
- **Mi plan**: plan actual, días restantes, uso (clientes, movimientos y comprobantes contra el límite) y botones Hazte Premium, Ya pagué y Usar key.
- **Avisos**: la bandeja de notificaciones.
- **Mi cuenta**: cambiar contraseña, bloqueo con PIN, activar notificaciones, cerrar sesión y borrar la cuenta.
- **Ayuda**: preguntas frecuentes, cómo instalar y contacto.
- Pie con la versión y el botón "Actualizar" cuando hay una nueva.

## C. Cliente (deudor) — `cobros/c/#código`
Una sola página, liviana (carga en menos de 1 s con 3G), con el logo y el color del negocio en Premium.
1. **PIN**: "Ingresa los últimos 4 dígitos de tu teléfono". Teclado grande. Muestra los intentos que quedan.
2. **Mi cuenta**:
   - **Saldo gigante** y próxima cuota, con su fecha.
   - Botón **💸 Pagar por transferencia**: muestra los datos del negocio, con **copiar** al lado de cada dato y un botón **Copiar todo** (formato listo para pegar en la app del banco).
   - Botón **📤 Ya pagué: subir comprobante**.
   - Botón **💬 Escribir a {negocio}** por WhatsApp.
3. **Por confirmar**: fiados nuevos con los botones *Lo reconozco* y *No lo reconozco*.
4. **Movimientos** y **Cuotas** (solo lectura).
5. **🔔 Avisarme**: activa push. En iPhone muestra cómo agregar a la pantalla de inicio.
6. Pie: privacidad, "Salir" y, en Normal, *"Hecho con Libreta de Cobros: ¿tienes negocio? Crea tu libreta gratis"*.
   **Este pie es el motor de crecimiento**: cada cliente que paga ve la marca.

## D. Superadmin — `cobros/admin/`
- **Resumen**: negocios totales, activos en 7 días, en prueba, Premium y Normal, ingresos del mes, pagos por aprobar y uso de la base de datos (MB usados de 500).
- **Negocios**: buscador y filtros por plan o estado. Cada ficha muestra plan, vencimiento, uso y fecha de registro, con los botones dar o quitar Premium, sumar días, suspender (con motivo) y nota interna. **No muestra los clientes ni las deudas de cada negocio.**
- **Pagos**: solicitudes "Ya pagué" con comprobante. Aprobar suma 30 días; rechazar pide motivo.
- **Keys**: generar (1, 3, 6 o 12 meses), copiar, ver usadas o libres y revocar.
- **Avisos**: mandar a todos, a Premium, a Normal o a uno solo (bandeja y push).
- **Ajustes**: precios, link de Mercado Pago, tus datos para transferir, días de prueba, límites del plan Normal (editables sin tocar código), textos legales con su versión, versión mínima de la app y botón para generar las claves push.
