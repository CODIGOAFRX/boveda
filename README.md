# Bóveda

El cielo de cualquier noche entre 1800 y 2050, calculado estrella a estrella en el navegador y grabado como un atlas celeste de 1690.

Elige un lugar y una fecha —la noche en que naciste, por ejemplo— y Bóveda dibuja ese cielo: 5.044 estrellas, 88 constelaciones con sus nombres en castellano, la Vía Láctea en trama de grabado, los siete planetas, la Luna con su fase y el Sol. Se arrastra para mover las horas, se comparte por URL y se descarga como lámina de 2400 × 3200 px.

Tercera pieza de una serie con [Catábasis](https://www.pedrogomez.dev/proyecto/catabasis) (bestiario) y el [Herbario del año](https://www.pedrogomez.dev/proyecto/herbario) (botánica).

## Qué hay dentro

- **Motor astronómico propio, sin librerías** (`src/astro`): día juliano, tiempo sidéreo, precesión rigurosa J2000 → fecha, coordenadas horizontales y refracción; Sol (Meeus cap. 25), Luna (ELP-2000/82 truncada, con paralaje y fase), planetas por elementos keplerianos del JPL con corrección de tiempo de luz y magnitud estimada; ortos, culminaciones y ocasos por muestreo y bisección.
- **Probado contra los ejemplos resueltos de Meeus**, *Astronomical Algorithms* (1998): Sputnik, tiempo sidéreo, Venus desde Washington, θ Persei, Sol, Luna, Venus 1992, la gran conjunción de 2020 y horarios reales de orto y ocaso en Granada (23 pruebas, `npm test`).
- **Grabado en Canvas 2D** (`src/render`): proyección estereográfica desde el cénit, tramas cruzadas por nivel de brillo para la Vía Láctea, estrellas con rayos como en Bayer y Hevelius, rótulos que no se pisan y Luna con terminador elíptico orientado hacia el Sol.
- **Interfaz** sin frameworks: arrastrar el cielo gira alrededor del polo y mueve las horas; regla de 24 h sombreada por la altura del Sol; ficha de cada objeto; lista accesible de lo que hay sobre el horizonte; tres tintas (papel, cianotipia y una roja que no deslumbra de noche); estado completo en la URL.
- **Datos** (`scripts/build-data.mjs`): compacta los catálogos de d3-celestial (Hipparcos, IAU) de ~1 MB a un único JSON de 319 KB.

## Uso

```bash
npm install
npm run dev      # http://localhost:5173
npm test         # pruebas del motor
npm run build    # dist/proyecto/boveda
npm run deploy   # Cloudflare Workers, ruta pedrogomez.dev/proyecto/boveda
```

## Fuentes y licencias

Catálogos de [d3-celestial](https://github.com/ofrohn/d3-celestial) de Olaf Frohn (BSD-3). Elementos orbitales aproximados de E. M. Standish (JPL). Tipografías IM Fell (Igino Marini, OFL) y EB Garamond (OFL).
