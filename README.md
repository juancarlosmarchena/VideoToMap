# VideoToMap 📐

Aplicación web (PWA) para **levantar el plano 2D aproximado de una vivienda o local** con el móvil:

- 📍 **Ubicación**: coordenadas GPS con su precisión, dirección aproximada (OpenStreetMap/Nominatim) y mapa.
- 🧭 **Orientación de la fachada**: apuntas la cámara a la fachada y la brújula calcula hacia dónde mira (N, NE, E…), con un comentario sobre el soleamiento según el hemisferio y una foto de referencia.
- 🎥 **Captura de estancias con la cámara**, con tres métodos:
  | Método | Cómo funciona | Precisión |
  |---|---|---|
  | Vídeo + brújula + pasos | Recorres cada pared apuntando la cámara a lo largo de ella; la brújula da la dirección y el podómetro la longitud. Se graba vídeo. | Orientativa (±10 %) |
  | Vídeo + brújula + cinta | Igual, pero escribes la longitud medida con cinta o láser. | Buena |
  | Realidad aumentada (WebXR) | Marcas cada esquina sobre el suelo en la cámara; mide en metros reales (Chrome Android con ARCore). | Muy buena (±2–5 cm) |
  | Manual | Introduces rumbos y longitudes. | La que introduzcas |
- 📏 **Corrección automática**: cierre del polígono (regla de Bowditch), escuadrado a 90° respecto al eje dominante, cierre automático de la última pared y alineación con el eje del resto de la vivienda.
- 🗺️ **Plano 2D orientado al Norte**: arrastra las estancias para encajarlas (se imantan por las esquinas), añade puertas y ventanas, gira estancias, y detecta/marca las paredes de fachada. Incluye cotas, superficies, flecha de Norte, escala gráfica y cajetín con dirección, coordenadas y orientación.
- ⬇️ **Exportación**: SVG, PNG, PDF (imprimir), proyecto JSON (reabrible) y vídeo de cada estancia. Compartir desde el móvil.
- 💾 Funciona sin conexión (service worker) y guarda el proyecto en el dispositivo.

## Uso

1. Abre la app **por HTTPS** en el móvil (la cámara, la brújula y el GPS lo exigen).
2. Pulsa **Activar sensores** (en iPhone aparecerá una petición de permiso).
3. **Ubicación** → «Obtener mi ubicación».
4. **Fachada** → desde la calle, frente a la fachada, apunta la cámara perpendicular a ella y pulsa «Capturar orientación».
5. **Estancias** → pon un nombre, elige el método y sigue las instrucciones en pantalla. Revisa la tabla de paredes y guarda.
6. **Plano** → encaja las estancias, añade puertas/ventanas y exporta.

Consejos: calibra la longitud de paso en ⚙️ Ajustes (con tu altura o midiendo 10 pasos), mantén el móvil lejos de objetos metálicos y, si la brújula marca un error constante, ajusta la corrección/declinación magnética (en la península ibérica es de ~0–1°, despreciable).

## Publicarla (GitHub Pages)

Settings → Pages → *Deploy from a branch* → rama y carpeta `/ (root)`. La app quedará en `https://<usuario>.github.io/VideoToMap/`. No requiere compilación ni dependencias.

## Desarrollo

```bash
npm start      # servidor local en http://localhost:8080 (en escritorio usa el «rumbo simulado» de Ajustes)
npm test       # pruebas de la geometría (Node ≥ 20)
```

Estructura: `js/geometry.js` (cálculo puro, testeado), `js/sensors.js` (brújula, podómetro, GPS), `js/camera.js` (cámara y grabación), `js/ar.js` (WebXR), `js/plan.js` (dibujo SVG y edición), `js/app.js` (interfaz).

## Limitaciones

- Es un **plano aproximado**, sin validez técnica, catastral ni legal.
- La brújula del móvil puede desviarse varios grados cerca de hierro/electrónica; el escuadrado y la alineación lo compensan en gran parte.
- El modo AR no graba vídeo (la cámara la usa WebXR) y no está disponible en iPhone (Safari no soporta WebXR AR).
- Los vídeos se guardan solo durante la sesión: descárgalos antes de cerrar la app.
- Para la dirección se envían las coordenadas a Nominatim (OpenStreetMap) solo al pulsar «Buscar dirección».
