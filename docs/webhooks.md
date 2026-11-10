# Órbita · Avisos a tu sistema (webhooks) y catálogo en JSON

Para el programador de la tienda, o para Zapier o Make. Se configura en **Ajustes → 📲 Vender en redes → 🔌 Avisos a tu sistema** (plan Pro).

## Qué llega

Órbita manda un `POST` con un cuerpo JSON a tu URL (https) en estos casos:

| `evento` | Cuándo |
|---|---|
| `pedido.creado` | Entra un pedido nuevo |
| `pedido.estado` | El pedido cambia de estado (`pagando`, `en_revision`, `recibido`, `preparando`, `listo`, `en_camino`, `entregado`, `cancelado`, `rechazado`, `expirado`) |
| `ping` | Tocaste 🧪 Probar |

```json
{
  "id": "5b0f…",               // id del evento: guárdalo y no proceses dos veces el mismo
  "evento": "pedido.estado",
  "creado": "2026-11-10T15:04:05Z",
  "tienda": { "slug": "mitienda", "nombre": "Mi Tienda" },
  "pedido": {
    "id": "9c1e…", "estado": "preparando", "estado_anterior": "recibido",
    "fecha": "…", "pagado": true, "total": 25990, "subtotal": 25990, "descuento": 0, "costo_despacho": 0,
    "cupon": null, "entrega": "despacho", "direccion": "…", "comuna": "Ñuñoa", "nota": "…",
    "lineas": [{ "clave": "p1", "nombre": "Polerón", "opcion": "L", "cantidad": 1, "precio": 25990, "subtotal": 25990 }],
    "cliente": { "nombre": "Ana", "telefono": "56912345678" }
  }
}
```

Los montos van en pesos chilenos (CLP).

## Encabezados

- `X-CodeFix-Evento`: el mismo valor que `evento`.
- `X-CodeFix-Id`: el id del evento. Si llega dos veces (por un reintento), procésalo una sola vez.
- `X-CodeFix-Firma`: `t=<segundos unix>,v1=<firma>`.

## Revisar la firma (obligatorio)

`v1` es el HMAC-SHA256 en hexadecimal del texto `t + "." + cuerpo`, con tu **secreto** (`whsec_…`) como clave. Usa el cuerpo **tal como llegó**, sin volver a armar el JSON. Rechaza el aviso si la firma no coincide o si `t` tiene más de 5 minutos de diferencia con tu hora.

```js
// Node.js
const crypto = require('crypto');
function valido(cuerpoCrudo, firma, secreto) {
  const [, t, v1] = /^t=(\d+),v1=([0-9a-f]+)$/.exec(firma || '') || [];
  if (!t || Math.abs(Date.now() / 1000 - t) > 300) return false;
  const esperado = crypto.createHmac('sha256', secreto).update(t + '.' + cuerpoCrudo).digest('hex');
  return v1.length === esperado.length && crypto.timingSafeEqual(Buffer.from(v1), Buffer.from(esperado));
}
```

```python
# Python
import hmac, hashlib, re, time
def valido(cuerpo_crudo: bytes, firma: str, secreto: str) -> bool:
    m = re.fullmatch(r"t=(\d+),v1=([0-9a-f]+)", firma or "")
    if not m or abs(time.time() - int(m[1])) > 300: return False
    esperado = hmac.new(secreto.encode(), m[1].encode() + b"." + cuerpo_crudo, hashlib.sha256).hexdigest()
    return hmac.compare_digest(m[2], esperado)
```

## Respuesta y reintentos

- Responde con un **2xx en menos de 5 segundos**. Si tienes que hacer algo largo, guárdalo y hazlo después.
- Si la respuesta no es 2xx, Órbita reintenta a los 1, 5 y 30 minutos, a las 2 horas y a las 12 horas (6 intentos en total).
- Si fallan **20 envíos seguidos**, los avisos quedan en pausa y la tienda recibe un aviso. Se reactivan marcando **Activo** y tocando **Guardar**.
- Los avisos pueden llegar desordenados: usa `pedido.estado` y `creado` como fuente de verdad.
- El historial de envíos se borra a los 7 días.

## Seguridad

- La URL tiene que ser `https://` a un dominio público. No se aceptan IPs, `localhost` ni dominios internos.
- Si tu secreto se filtra, toca **🔄 Secreto nuevo**. El anterior deja de servir de inmediato.

## Catálogo (lectura, sin clave)

- `GET /t/feed?s=<slug>`: feed RSS 2.0 con `g:*` para Google Merchant Center y el Commerce Manager de Meta.
- `GET /t/feed?s=<slug>&f=json`: el mismo catálogo en JSON (`tienda`, `actualizado`, `productos[]` con `id`, `titulo`, `descripcion`, `precio`, `moneda`, `disponible`, `stock`, `categoria`, `link` e `imagen`).

Se actualiza cada hora (caché). Permite CORS (`*`).
