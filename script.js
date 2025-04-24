// URL de tu Web App de Google Apps Script (¡Asegúrate que sea la correcta!)
const apiUrl = "https://script.google.com/macros/s/AKfycby9UyKr-UcWOCvrMGCsgvc38_-HmKZpXjlj9THbGLNK0lhLJ7B-_RSVpxFpP76eWjeP/exec";

// Referencias a elementos del DOM
const btnKPIs = document.getElementById("btn-kpis");
const btnFaltantes = document.getElementById("btn-faltantes");
const content = document.getElementById("data-content");
const chartContainer = document.getElementById('chart-container');
const kpiChartCanvas = document.getElementById('kpiChart'); // Solo el elemento canvas

// Variable para almacenar la instancia del gráfico actual y poder destruirla
let currentChart = null;

// --- Event Listeners para los botones ---
if (btnKPIs) {
    btnKPIs.addEventListener("click", () => {
      cargarDatos("kpi");
    });
}

if (btnFaltantes) {
    btnFaltantes.addEventListener("click", () => {
      cargarDatos("faltantes");
    });
}

// --- Función principal para cargar datos ---
function cargarDatos(tipo) {
  // Mostrar animación de carga
  content.innerHTML = "<p class='loading'>Cargando datos...</p>";
  // Ocultar contenedor del gráfico y destruir gráfico anterior
  chartContainer.style.display = 'none';
  if (currentChart) {
    currentChart.destroy();
    currentChart = null;
  }

  // Realizar la llamada fetch a la API de Apps Script
  fetch(`${apiUrl}?tipo=${tipo}`)
    .then(res => {
      if (!res.ok) {
        // Si la respuesta HTTP no es exitosa, lanzar un error
        throw new Error(`Error HTTP: ${res.status} ${res.statusText}`);
      }
      return res.json(); // Convertir la respuesta a JSON
    })
    .then(data => {
      if (data.error) {
        // Si la API devuelve un error en el JSON, lanzarlo
        throw new Error(`Error desde API: ${data.error}`);
      }
      // Mostrar los datos en la tabla (¡aquí se aplica la lógica de resaltado!)
      mostrarDatos(data.datos, tipo);

      // Si los datos son de tipo 'kpi' y existen, mostrar el gráfico
      if (tipo === 'kpi' && data.datos && data.datos.length > 0) {
         mostrarGraficoKPI(data.datos);
      }
    })
    .catch(err => {
      // Manejar cualquier error ocurrido durante el fetch o procesamiento
      console.error("Error detallado:", err);
      content.innerHTML = `<p class='error'>❌ Error al cargar datos: ${err.message}</p>`;
      chartContainer.style.display = 'none'; // Asegurarse que el gráfico esté oculto en caso de error
    });
}

// --- Función para mostrar los datos en la tabla ---
function mostrarDatos(datos, tipo) {
  // Si no hay datos o no es un array, mostrar mensaje informativo
  if (!Array.isArray(datos) || datos.length === 0) {
    content.innerHTML = "<p class='info'>ℹ️ No hay datos disponibles para mostrar.</p>";
    return;
  }

  // --- Inicio: Calcular proporción del mes transcurrido ---
  const hoy = new Date();
  const diaActual = hoy.getDate(); // Día del mes (1-31)
  const mesActual = hoy.getMonth(); // Mes (0-11)
  const anioActual = hoy.getFullYear();
  // Calcular el último día del mes actual (truco: día 0 del mes siguiente)
  const diasTotalesMes = new Date(anioActual, mesActual + 1, 0).getDate();
  // Proporción del mes que debería haberse cumplido hoy (evitar división por cero si hay error)
  const proporcionMes = diasTotalesMes > 0 ? diaActual / diasTotalesMes : 0;
  // --- Fin: Calcular proporción del mes ---

  // Construir el HTML de la tabla
  let html = "<table><thead><tr>";

  // Definir las cabeceras de la tabla según el tipo de datos
  if (tipo === "kpi") {
    // Ajustamos títulos para mayor claridad
    html += "<th>KPI</th><th>Meta (100%)</th><th>125%</th><th>70%</th><th>Resultado Actual</th><th>Arrastre</th><th>Total</th>";
  } else { // tipo === "faltantes"
    html += "<th>KPI</th><th>Faltante 100%</th><th>Faltante 150%</th><th>Faltante 250%</th>";
  }
  html += "</tr></thead><tbody>";

  // Llenar las filas de la tabla con los datos
  datos.forEach(fila => {
    html += "<tr>";
    if (tipo === "kpi") {
      // --- Lógica para KPIs ---
      html += `<td>${fila.kpi || '-'}</td>`;
      html += `<td>${formatNumber(fila.valor100)}</td>`; // Celda de Meta
      html += `<td>${formatNumber(fila.valor125)}</td>`;
      html += `<td>${formatNumber(fila.valor70)}</td>`;

      // --- Celda de Resultado con posible resaltado ---
      const metaKPI = parseFloat(fila.valor100); // La meta es el 100%
      const resultadoActual = parseFloat(fila.resultado);
      let claseExtraResultado = ''; // Clase CSS adicional, vacía por defecto

      // Solo aplicar lógica si tenemos números válidos para meta y resultado, y la meta es > 0
      if (!isNaN(metaKPI) && metaKPI > 0 && !isNaN(resultadoActual)) {
        const resultadoEsperadoHoy = metaKPI * proporcionMes;

        // Comprobar si el resultado actual es menor que lo esperado para hoy
        // Añadimos una pequeña tolerancia (ej. 0.001) si no queremos marcar algo que está casi igual
        // if (resultadoActual < (resultadoEsperadoHoy - 0.001)) {
        if (resultadoActual < resultadoEsperadoHoy) { // Sin tolerancia por ahora
          claseExtraResultado = 'kpi-atrasado'; // Añadir la clase si está por debajo
        }
      }

      // Generar el HTML de la celda de resultado con la clase extra si aplica
      html += `<td class="${claseExtraResultado}">${formatNumber(fila.resultado)}</td>`;
      // --- Fin Celda Resultado ---

      html += `<td>${formatNumber(fila.arrastre)}</td>`;
      html += `<td>${formatNumber(fila.total)}</td>`;

    } else { // tipo === "faltantes"
      // --- Lógica para Faltantes (sin cambios) ---
      html += `<td>${fila.kpi || '-'}</td>`;
      html += `<td>${formatNumber(fila.faltante100)}</td>`;
      html += `<td>${formatNumber(fila.faltante150)}</td>`;
      html += `<td>${formatNumber(fila.faltante250)}</td>`;
    }
    html += "</tr>";
  });

  html += "</tbody></table>";
  // Insertar la tabla construida en el contenedor
  content.innerHTML = html;
}

// --- Función auxiliar para formatear números ---
function formatNumber(value) {
  // Si es null o undefined, devuelve un guion
  if (value === null || typeof value === 'undefined') {
    return '-';
  }
  // Si es número, formatea con separadores de miles y decimales si los tiene
  if (typeof value === 'number') {
    return value.toLocaleString('es-ES', { minimumFractionDigits: 0, maximumFractionDigits: 2 });
  }
  // Devuelve el valor original si es string u otro tipo
  return value;
}

// --- Función para mostrar el gráfico de KPIs usando Chart.js ---
function mostrarGraficoKPI(datosKPI) {
    // Obtener el contexto 2D del canvas (necesario para Chart.js)
    const ctx = kpiChartCanvas.getContext('2d');
    if (!ctx) {
        console.error("No se pudo obtener el contexto del canvas para el gráfico.");
        return;
    }

    // Preparar los datos para el gráfico
    const labels = datosKPI.map(item => item.kpi || 'Sin nombre');
    const dataResultados = datosKPI.map(item => parseFloat(item.resultado) || 0);
    const dataTotales = datosKPI.map(item => parseFloat(item.total) || 0);

    // Mostrar el contenedor del gráfico
    chartContainer.style.display = 'block';

    // Crear la instancia del gráfico (o actualizar si ya existe)
    currentChart = new Chart(ctx, {
        type: 'bar', // Tipo de gráfico
        data: {
            labels: labels, // Etiquetas del eje X
            datasets: [
              {
                label: 'Resultado Actual', // Leyenda actualizada
                data: dataResultados, // Datos de resultados
                backgroundColor: 'rgba(40, 167, 69, 0.6)', // Verde semitransparente
                borderColor: 'rgba(40, 167, 69, 1)',       // Borde verde opaco
                borderWidth: 1,
                yAxisID: 'yValuesPrimary' // Asociar con el eje Y primario (antes yPercentage)
              },
              {
                  label: 'Total', // Leyenda para la segunda serie
                  data: dataTotales, // Datos totales
                  backgroundColor: 'rgba(0, 123, 255, 0.6)', // Azul semitransparente
                  borderColor: 'rgba(0, 123, 255, 1)',      // Borde azul opaco
                  borderWidth: 1,
                  yAxisID: 'yValuesSecondary' // Asociar con el eje Y secundario (antes yValues)
              }
          ]
        },
        options: {
            responsive: true, // Hacer que el gráfico se ajuste al contenedor
            maintainAspectRatio: false, // No mantener una relación de aspecto fija
            scales: {
                 x: { // Configuración del eje X
                    ticks: {
                        autoSkip: false, // Intentar mostrar todas las etiquetas
                        maxRotation: 45, // Rotar etiquetas si son largas
                        minRotation: 30
                    }
                },
                // Configuración del eje Y izquierdo (Resultados)
                yValuesPrimary: { // Cambiado de yPercentage a yValuesPrimary
                    type: 'linear',
                    position: 'left',
                    beginAtZero: true, // Empezar en 0
                    // No ponemos max: 100 aquí ya que resultado no es necesariamente %
                    title: {
                        display: true,
                        text: 'Resultado Actual' // Título del eje actualizado
                    },
                    grid: {
                        drawOnChartArea: true // Mostrar rejilla para este eje
                    }
                },
                // Configuración del eje Y derecho (Valores Totales)
                yValuesSecondary: { // Cambiado de yValues a yValuesSecondary
                    type: 'linear',
                    position: 'right',
                    beginAtZero: true,
                    title: {
                        display: true,
                        text: 'Total'
                    },
                    grid: {
                       drawOnChartArea: false, // No dibujar rejilla para este eje (evita sobrecarga visual)
                    }
                }
            },
            plugins: {
                legend: {
                    position: 'bottom', // Mover leyenda abajo
                },
                tooltip: { // Configuración de las "cajitas" de información al pasar el ratón
                    mode: 'index', // Mostrar tooltip para todos los datasets en ese índice X
                    intersect: false, // Mostrar aunque no se esté exactamente sobre la barra
                }
            }
        }
    });
}
