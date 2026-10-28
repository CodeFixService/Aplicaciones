/* CodeFix · Núcleo · Calidad de las fotos según para qué son (mismo archivo en cada repositorio).
   Se cambia aquí y aplica en las 6 apps. Las fotos se achican en el celular antes de subirlas.
   · comprobante: voucher o captura de pago. Basta con que se lea: liviano.
   · documento:   carnet o documentos para verificar identidad. Que se lean bien los números.
   · vitrina:     productos, servicios, ofertas, fotos de trabajo y de estacionamientos: calidad mínima para que no se pixele en un teléfono.
   · portada:     imagen grande de la tienda o negocio.
   · perfil / logo: chicas. */
(function () {
  'use strict';
  window.CFX_FOTO = window.CFX_FOTO || {
    comprobante: { lado: 1000, calidad: 0.6, kb: 110 },
    documento: { lado: 1400, calidad: 0.72, kb: 300 },
    vitrina: { lado: 1080, calidad: 0.8, kb: 220 },
    portada: { lado: 1280, calidad: 0.8, kb: 300 },
    perfil: { lado: 400, calidad: 0.8, kb: 45 },
    logo: { lado: 256, calidad: 0.85, kb: 30 }
  };
  // Para las apps: CFX_FOTO_DE('vitrina') devuelve siempre algo (aunque este archivo no haya cargado aún).
  window.CFX_FOTO_DE = (k) => window.CFX_FOTO[k] || window.CFX_FOTO.comprobante;
})();
