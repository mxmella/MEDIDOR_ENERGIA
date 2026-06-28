document.addEventListener('DOMContentLoaded', () => {
  // --- LÓGICA DE AUTENTICACIÓN Y SESIÓN ---
  // Puedes cambiar el usuario y contraseña aquí
  const CORRECT_USER = 'admin';
  const CORRECT_PASS = 'admin';

  const loginOverlay = document.getElementById('login-overlay');
  const mainContent = document.getElementById('main-content');
  const loginForm = document.getElementById('login-form');
  const loginError = document.getElementById('login-error-message');
  const logoutBtn = document.getElementById('logoutBtn');

  // Función para mostrar el contenido principal
  const showMainContent = () => {
    if (loginOverlay) loginOverlay.style.display = 'none';
    if (mainContent) mainContent.style.display = 'flex';
    if (logoutBtn) logoutBtn.style.display = 'inline-flex';

    // Lógica de Pantalla de Carga
    const loader = document.getElementById('app-loader');
    if (loader) {
      // Mantenemos el loader visible por al menos 2.5 segundos para dar tiempo a la conexión
      setTimeout(() => {
        loader.classList.add('loader-hidden');
        // Remover del DOM después de la transición CSS
        setTimeout(() => {
          loader.style.display = 'none';
        }, 600);
      }, 2500);
    }
  };

  // Comprobar si ya está autenticado en la sesión
  if (sessionStorage.getItem('isAuthenticated') === 'true') {
    showMainContent();
  } else {
    if (loginOverlay) loginOverlay.style.display = 'flex';
    const appLoader = document.getElementById('app-loader');
    if (appLoader) appLoader.style.display = 'none'; // Ocultar loader si no está logueado
  }

  if (loginForm) {
    loginForm.addEventListener('submit', (e) => {
      e.preventDefault();
      const username = document.getElementById('username').value;
      const password = document.getElementById('password').value;

      if (username === CORRECT_USER && password === CORRECT_PASS) {
        sessionStorage.setItem('isAuthenticated', 'true');
        showMainContent();
      } else {
        if (loginError) loginError.style.display = 'block';
      }
    });
  }

  if (logoutBtn) {
    logoutBtn.addEventListener('click', () => {
      sessionStorage.removeItem('isAuthenticated');
      // Recargar la página para volver al estado de login
      window.location.reload();
    });
  }

  // Variables para modo oscuro persistente
  const bodyEl = document.body;
  const darkToggle = document.getElementById('darkModeToggle');
  const savedTheme = localStorage.getItem('theme');
  if(savedTheme === 'dark') {
   bodyEl.classList.add('dark-mode');
    if(darkToggle) darkToggle.textContent = 'Modo claro';
    // Llamar a la función aquí para asegurar que los gráficos se inicialicen con los colores correctos
    setTimeout(() => {
      updateChartColors();
    }, 50);
  }

  if(darkToggle) {
    darkToggle.addEventListener('click', () => {
      bodyEl.classList.toggle('dark-mode');
      if(bodyEl.classList.contains('dark-mode')) {
        darkToggle.textContent = 'Modo claro';
        localStorage.setItem('theme', 'dark');
      } else {
        darkToggle.textContent = 'Modo oscuro';
        localStorage.setItem('theme', 'light');
      }
      // Actualizar colores de los gráficos al cambiar de tema
      updateChartColors();
    });
  }

  // Función para actualizar colores de los gráficos
  function updateChartColors() {
    const isDarkMode = document.body.classList.contains('dark-mode');
    const textColor = isDarkMode ? getComputedStyle(document.body).getPropertyValue('--color-text-dark').trim() : getComputedStyle(document.body).getPropertyValue('--color-text-light').trim();
    const gridColor = isDarkMode ? 'rgba(255, 255, 255, 0.1)' : 'rgba(0, 0, 0, 0.08)';

    const charts = [myChart, peakChart, kwhChartInstance, windChartInstance, cgePowerChart, cgeUnbalanceChart, cgeVoltageChart, voltagePhasesChart, voltageLNChart, currentPhasesChart, currentNGChart, window.slowDownChartInstance];

    charts.forEach(chart => {
      if (chart && chart.options) {
        if (chart.options.plugins && chart.options.plugins.legend) {
          chart.options.plugins.legend.labels.color = textColor;
        }
        if (chart.options.scales) {
          Object.keys(chart.options.scales).forEach(axis => {
            if (chart.options.scales[axis].ticks) chart.options.scales[axis].ticks.color = textColor;
            if (chart.options.scales[axis].title) chart.options.scales[axis].title.color = textColor;
            if (chart.options.scales[axis].grid) chart.options.scales[axis].grid.color = gridColor;
          });
        }
        chart.update('none');
      }
    });
  }

  // Botón para generar informe (Imprimir / PDF)
  const reportBtn = document.getElementById('reportBtn');
  if(reportBtn) {
    reportBtn.addEventListener('click', () => {
      showToast("Generando informe para impresión...", "info");
      // Guardar configuración actual
      const originalRows = rowsPerPage;
      // Cambiar a 50 filas para el reporte
      rowsPerPage = 50;
      
      // Agregar fecha y hora al reporte
      const tsEl = document.getElementById('reportTimestamp');
      if(tsEl) tsEl.textContent = `Generado el: ${new Date().toLocaleString()}`;

      renderTable();
      
      // Imprimir y luego restaurar
      setTimeout(() => {
        window.print();
        // Restaurar a 10 filas
        rowsPerPage = originalRows;
        renderTable();
      }, 500);
    });
  }

  // MQTT y Chart.js con Zoom plugin
  const mqttOptions = {
    keepalive: 60,
    reconnectPeriod: 1000,
    clean: true
  };
  const client = mqtt.connect('wss://mqtt-dashboard.com:8884/mqtt', mqttOptions);
  const ctx = document.getElementById('myChart').getContext('2d');
  
  // Variables globales para cálculo de FP
  let cgeActivePower = 0;
  let cgeApparentPower = 0;
  // Variables para gráficos de tendencia CGE
  let cgeCurrentAmp = 0;
  let cgeCurrentUnbalance = 0;
  let cgeVoltageAvg = 0;
  // Variables para voltajes de fase
  let voltAB = 0;
  let voltBC = 0;
  let voltCA = 0;
  let voltAN = 0;
  let voltBN = 0;
  let voltCN = 0;
  // Variables para corrientes (NEW)
  let currA = 0;
  let currB = 0;
  let currC = 0;
  let currN = 0;
  let currG = 0;

  // Variables para Watchdog (Monitor de flujo de datos)
  let lastDataTime = Date.now();
  const DATA_TIMEOUT = 15000; // 15 segundos sin datos = alerta

  // Optimización: Manejo de reconexión al volver a la pestaña
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') {
      lastDataTime = Date.now(); // Resetear watchdog para evitar falsa alarma
      if (client && !client.connected && typeof client.reconnect === 'function') {
        console.log('Pestaña visible: Forzando reconexión...');
        client.reconnect();
      }
    }
  });

  // Verificar flujo de datos periódicamente
  setInterval(() => {
    if (document.hidden) return; // No verificar en segundo plano para evitar falsos positivos

    const statusEl = document.getElementById('connectionStatus');
    const textEl = document.getElementById('connText');
    
    // Solo si el cliente MQTT está conectado, verificamos si llegan datos
    if (client && client.connected) {
      if (Date.now() - lastDataTime > DATA_TIMEOUT) {
        if(statusEl) statusEl.className = 'status-warning';
        if(textEl) textEl.textContent = 'Sin flujo de datos';
      } else if (statusEl && statusEl.className === 'status-warning') {
        if(statusEl) statusEl.className = 'status-connected';
        if(textEl) textEl.textContent = 'Conectado';
      }
    }
  }, 2000);

  // Crear degradados para el gráfico principal
  const gradientCGE = ctx.createLinearGradient(0, 0, 0, 400);
  gradientCGE.addColorStop(0, 'rgba(71, 85, 105, 0.6)'); // Slate 600
  gradientCGE.addColorStop(1, 'rgba(51, 65, 85, 0.1)');  // Slate 700

  const gradientGruas = ctx.createLinearGradient(0, 0, 0, 400);
  gradientGruas.addColorStop(0, 'rgba(255, 199, 44, 0.6)');
  gradientGruas.addColorStop(1, 'rgba(255, 199, 44, 0.05)');
  gradientGruas.addColorStop(0, 'rgba(249, 115, 22, 0.6)'); // Naranja corporativo
  gradientGruas.addColorStop(1, 'rgba(249, 115, 22, 0.05)');

  // Inicialización de datos vacíos para mostrar grilla al inicio
  const initLabels = [];
  const initData1 = [];
  const initData2 = [];
  const nowInit = new Date();
  for(let i=19; i>=0; i--) {
    initLabels.push(new Date(nowInit.getTime() - i*2000).toLocaleTimeString());
    initData1.push(null);
    initData2.push(null);
  }

  const data = {
    labels: initLabels, 
    datasets: [{
      label: 'Medidor CGE (I Max)', 
      data: initData1,
      borderColor: 'var(--color-primary-light)', // Slate 600
      backgroundColor: gradientCGE,
      fill: true,
      tension: 0.3,
      pointRadius: 0,
      pointHoverRadius: 7,
      borderWidth: 3,
      hoverBorderWidth: 4
    }, {
      label: 'I_MAX_GRUAS', 
      data: initData2,
      borderColor: '#ffc72c',
      borderColor: '#f97316', // Naranja corporativo
      backgroundColor: gradientGruas,
      fill: true,
      tension: 0.3,
      pointRadius: 0,
      pointHoverRadius: 7,
      borderWidth: 3,
      hoverBorderWidth: 4
    }
  ]
  };

  const config = {
    type: 'line',
    data,
    options: {
      maintainAspectRatio: false,
      animation: { duration: 0 }, // Desactivar animación para rendimiento
      responsive: true,
      plugins: {
        legend: {
          labels: { color: getComputedStyle(document.body).getPropertyValue('--color-text-light').trim(), font: { size: 16, weight: 'bold' } }
        },
        tooltip: {
          mode: 'index',
          intersect: false,
          backgroundColor: 'var(--color-primary)',
          titleFont: { size: 16, weight: 'bold' },
          bodyFont: { size: 14 }
        },
      },
      scales: {
        x: {
          title: { display: true, text: 'Tiempo', color: getComputedStyle(document.body).getPropertyValue('--color-text-light').trim(), font: { size: 18, weight: 'bold' } },
          ticks: { color: getComputedStyle(document.body).getPropertyValue('--color-text-light').trim(), maxRotation: 45, minRotation: 30 },
          grid: { color: 'rgba(0, 0, 0, 0.08)', borderDash: [5, 5] }
        },
        y: {
          beginAtZero: true,
          title: { display: true, text: 'I Max', color: getComputedStyle(document.body).getPropertyValue('--color-text-light').trim(), font: { size: 18, weight: 'bold' } },
          ticks: { color: getComputedStyle(document.body).getPropertyValue('--color-text-light').trim() },
          grid: { color: 'rgba(0, 0, 0, 0.08)', borderDash: [5, 5] }
        }
      },
      interaction: {
        mode: 'nearest',
        axis: 'x',
        intersect: false
      }
    }
  };
  const myChart = new Chart(ctx, config);

  // Optimización: Throttle para actualizaciones del gráfico principal
  let myChartUpdatePending = false;
  function requestMyChartUpdate() {
    if (!myChartUpdatePending) {
      myChartUpdatePending = true;
      requestAnimationFrame(() => {
        myChart.update();
        myChartUpdatePending = false;
      });
    }
  }
  
  // Configuración del Gráfico de Peaks
  const ctxPeak = document.getElementById('peakChart').getContext('2d');
  const gradientPeak = ctxPeak.createLinearGradient(0, 0, 0, 400);
  gradientPeak.addColorStop(0, 'rgba(220, 53, 69, 0.6)');
  gradientPeak.addColorStop(1, 'rgba(220, 53, 69, 0.05)');

  const peakChart = new Chart(ctxPeak, {
    type: 'line',
    data: {
      labels: [],
      datasets: [{
        label: 'Valor del Peak (Amp)',
        data: [],
        borderColor: '#dc3545',
        backgroundColor: gradientPeak,
        fill: true,
        tension: 0.3,
        pointRadius: 4,
        pointHoverRadius: 6,
        borderWidth: 2
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      interaction: {
        mode: 'nearest',
        axis: 'x',
        intersect: false
      },
      plugins: {
        legend: {
          labels: { color: getComputedStyle(document.body).getPropertyValue('--color-text-light').trim(), font: { size: 14, weight: 'bold' } }
        },
        tooltip: {
          mode: 'index',
          intersect: false
        }
      },
      scales: {
        x: { 
          display: true,
          ticks: { 
            color: getComputedStyle(document.body).getPropertyValue('--color-text-light').trim(),
            maxRotation: 45,
            minRotation: 0,
            autoSkip: true,
            maxTicksLimit: 8
          },
          grid: { color: 'rgba(0, 0, 0, 0.08)' }
        },
        y: { ticks: { color: getComputedStyle(document.body).getPropertyValue('--color-text-light').trim() }, grid: { color: 'rgba(0, 0, 0, 0.08)' } }
      }
    }
  });

  // Alertas
  const alertContainer = document.getElementById('alertContainer');
  const peakHistoryTableBody = document.querySelector('#peakHistoryTable tbody');
  let alertActive = false;
  
  // Variables para paginación de historial
  let peakHistoryData = [];
  let renderTimeout;
  let rowsPerPage = 10;
  const maxPages = 150; 
  let currentPage = 1;

  const btnPrev = document.getElementById('btnPrev');
  const btnNext = document.getElementById('btnNext');
  const pageInfo = document.getElementById('pageInfo');

  if(btnPrev) {
    btnPrev.addEventListener('click', () => {
      if (currentPage > 1) {
        currentPage--;
        renderTable();
      }
    });
  }

  if(btnNext) {
    btnNext.addEventListener('click', () => {
      const totalPages = Math.ceil(peakHistoryData.length / rowsPerPage) || 1;
      if (currentPage < totalPages) {
        currentPage++;
        renderTable();
      }
    });
  }

  function renderTable() {
    if(!peakHistoryTableBody) return;
    peakHistoryTableBody.innerHTML = '';
    const start = (currentPage - 1) * rowsPerPage;
    const end = start + rowsPerPage;
    const pageData = peakHistoryData.slice(start, end);

    pageData.forEach(item => {
      const row = peakHistoryTableBody.insertRow();
      // Separar la fecha y la hora para mostrarlas en columnas distintas.
      const [datePart, timePartWithZ] = (item.fechaRegistroStr || 'T').split('T');
      const timePart = (timePartWithZ || '').substring(0, 8); // Extraer solo HH:mm:ss

      // Columnas: ID, Fecha, Hora, Valor
      row.innerHTML = `<td>${item.ID || '--'}</td><td>${datePart}</td><td>${timePart}</td><td><strong>${item.value.toFixed(2)}</strong></td>`;
    });

    const totalPages = Math.ceil(peakHistoryData.length / rowsPerPage) || 1;
    if(pageInfo) pageInfo.textContent = `Página ${currentPage} de ${totalPages}`;
    if(btnPrev) btnPrev.disabled = currentPage === 1;
    if(btnNext) btnNext.disabled = currentPage === totalPages;
  }

  function updateLastPeakWidget() {
    const loader = document.getElementById('lastPeakLoader');
    const content = document.getElementById('lastPeakContent');
    
    if (peakHistoryData.length > 0) {
      const latest = peakHistoryData[0];
      const [datePart, timePartWithZ] = (latest.fechaRegistroStr || 'T').split('T');
      const timePart = (timePartWithZ || '').substring(0, 8);
      const displayDate = `${datePart} ${timePart}`;

      const valEl = document.getElementById('lastPeakValue');
      const dateEl = document.getElementById('lastPeakDate');
      if(valEl) valEl.innerHTML = `${latest.value.toFixed(2)} <span class="sts-unit">Amp</span>`;
      if(dateEl) dateEl.textContent = displayDate;
    }
    if(loader) loader.style.display = 'none';
    if(content) content.style.display = 'block';
  }

  function updatePeakChart(dataToRender) {
    const reversedData = [...(dataToRender || [])].reverse();
    peakChart.data.labels = reversedData.map(item => {
      return (item.fechaRegistroStr || '')
        .replace('T', '_')
        .substring(0, 19);
    });
    peakChart.data.datasets[0].data = reversedData.map(d => d.value);
    peakChart.update();
  }

  function addPeakToHistory(value, datetime) {
    const newItem = { 
      ID: 'RT', // Real-Time
      value: value, 
      fechaRegistroStr: new Date().toISOString(),
      timestamp: Date.now()
    };
    peakHistoryData.unshift(newItem);
    
    const maxRecords = rowsPerPage * maxPages;
    if (peakHistoryData.length > maxRecords) peakHistoryData.pop();

    if (currentPage === 1) {
      renderTable();
    } else {
      const totalPages = Math.ceil(peakHistoryData.length / rowsPerPage) || 1;
      if(pageInfo) pageInfo.textContent = `Página ${currentPage} de ${totalPages}`;
      if(btnNext) btnNext.disabled = currentPage === totalPages;
    }

    updateLastPeakWidget();
  }

  function showVisualAlert(value) {
    if(alertContainer) {
      alertContainer.style.display = 'block';
      alertContainer.textContent = `⚠️ Alerta: Valor alto detectado! Valor actual: ${value.toFixed(2)}`;

      setTimeout(() => {
        if(alertActive) return;
        alertContainer.style.display = 'none';
      }, 5000);
    }
  }

  // --- Lógica del Historial KWH (Modal) ---
  let currentStsHistoryId = null;
  let kwhChartInstance = null;
  let kwhData = []; // Datos completos sin filtrar
  let kwhFilteredData = []; // Datos filtrados por la búsqueda
  let currentKwhPage = 1;
  const kwhRowsPerPage = 10;

  const btnKwhPrev = document.getElementById('btnKwhPrev');
  const btnKwhNext = document.getElementById('btnKwhNext');

  if(btnKwhPrev) {
    btnKwhPrev.addEventListener('click', () => {
      if (currentKwhPage > 1) {
        currentKwhPage--;
        renderKwhTable();
      }
    });
  }
  if(btnKwhNext) {
    btnKwhNext.addEventListener('click', () => {
      const totalPages = Math.ceil(kwhFilteredData.length / kwhRowsPerPage) || 1;
      if (currentKwhPage < totalPages) {
        currentKwhPage++;
        renderKwhTable();
      }
    });
  }

  function renderKwhTable() {
    const tbody = document.querySelector('#kwhHistoryTable tbody');
    if(!tbody) return;
    tbody.innerHTML = '';
    const start = (currentKwhPage - 1) * kwhRowsPerPage;
    const end = start + kwhRowsPerPage;
    const pageData = kwhFilteredData.slice(start, end);

    pageData.forEach(item => {
      const row = tbody.insertRow();
      // Separar la fecha y la hora para mostrarlas en columnas distintas.
      const [datePart, timePartWithZ] = (item.fechaRegistroStr || 'T').split('T');
      const timePart = (timePartWithZ || '').substring(0, 8); // Extraer solo HH:mm:ss

      row.innerHTML = `<td>${item.ID || '--'}</td><td>${datePart}</td><td>${timePart}</td><td><strong>${item.energiaStr} kWh</strong></td>`;
    });
    
    const totalPages = Math.ceil(kwhFilteredData.length / kwhRowsPerPage) || 1;
    const pageKwhInfo = document.getElementById('pageKwhInfo');
    if(pageKwhInfo) pageKwhInfo.textContent = `Página ${currentKwhPage} de ${totalPages}`;
    if(btnKwhPrev) btnKwhPrev.disabled = currentKwhPage === 1;
    if(btnKwhNext) btnKwhNext.disabled = currentKwhPage >= totalPages;
  }

  window.filterKwhTable = () => {
    const timeInput = document.getElementById('kwhTimeInput');
    const filterTime = timeInput.value; // Formato "HH:mm"

    if (!filterTime) {
      kwhFilteredData = kwhData;
    } else {
      const [filterH, filterM] = filterTime.split(':').map(Number);
      kwhFilteredData = kwhData.filter(item => {
        // Extraer la parte de la hora (HH:mm:ss) del string original para comparar
        const timePartWithZ = (item.fechaRegistroStr || '').split('T')[1] || '';
        return timePartWithZ.startsWith(`${String(filterH).padStart(2, '0')}:${String(filterM).padStart(2, '0')}`);
      });
    }
    
    currentKwhPage = 1;
    renderKwhTable();
  }

  window.clearKwhFilter = () => {
    const timeInput = document.getElementById('kwhTimeInput');
    if (timeInput) timeInput.value = '';
    kwhFilteredData = kwhData;
    currentKwhPage = 1;
    renderKwhTable();
  }

  function updateKwhChart(items) {
    if (kwhChartInstance) kwhChartInstance.destroy();
    
    // Filtrar datos para mostrar solo los cambios de valor.
    // 1. Ordenar cronológicamente (ascendente) para un filtrado correcto.
    const sortedForFiltering = [...items].sort((a, b) => a.timestamp - b.timestamp);
    const uniqueData = [];
    let lastValue = null;

    sortedForFiltering.forEach(item => {
      if (item.energiaVal !== lastValue) {
        uniqueData.push(item);
        lastValue = item.energiaVal;
      }
    });

    // Usar los datos filtrados para el gráfico
    const chartData = uniqueData;
    
    const labels = chartData.map(item => {
      return (item.fechaRegistroStr || '')
        .replace('T', '_')
        .substring(0, 19);
    });
    const data = chartData.map(i => i.energiaVal);
    const average = data.length > 0 ? data.reduce((a, b) => a + b, 0) / data.length : 0;
    const averageData = new Array(labels.length).fill(average);

    const ctxModal = document.getElementById('kwhShiftChart').getContext('2d');
    
    const gradient = ctxModal.createLinearGradient(0, 0, 0, 400);
    gradient.addColorStop(0, 'rgba(10, 114, 193, 0.6)');
    gradient.addColorStop(1, 'rgba(10, 114, 193, 0.05)');

    kwhChartInstance = new Chart(ctxModal, {
      type: 'line',
      data: {
        labels: labels,
        datasets: [{
          label: 'Energía (kWh)',
          data: data,
          backgroundColor: gradient,
          borderColor: '#0a72c1',
          borderWidth: 2,
          fill: true,
          tension: 0.1,
          pointRadius: 2,
          pointHoverRadius: 5
        }, {
          label: `Promedio (${average.toFixed(2)} kWh)`,
          data: averageData,
          borderColor: '#dc3545',
          borderWidth: 2,
          fill: false,
          pointRadius: 0,
          borderDash: [5, 5], // Línea discontinua
          tension: 0,
          pointHoverRadius: 0
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        interaction: {
          mode: 'index',
          intersect: false
        },
        plugins: {
          legend: { display: true },
          title: { display: true, text: 'Historial de Consumo de Energía (kWh)' }
        },
        scales: { 
          y: { beginAtZero: false, title: { display: true, text: 'kWh' } },
          x: {
            ticks: {
              maxRotation: 45,
              minRotation: 30,
              autoSkip: true,
              maxTicksLimit: 15
            }
          }
        }
      }
    });

    // 2. Invertir el array para mostrar el más reciente primero en la tabla.
    kwhData = [...uniqueData].reverse();
    kwhFilteredData = kwhData; // Inicialmente, los datos filtrados son todos los datos
    currentKwhPage = 1;
    const timeInput = document.getElementById('kwhTimeInput');
    if (timeInput) timeInput.value = ''; // Limpiar búsqueda
    renderKwhTable();
  }

  window.clearWindFilter = () => {
    const timeInput = document.getElementById('windTimeInput');
    if (timeInput) timeInput.value = '';
    windFilteredData = windData;
    currentWindPage = 1;
    renderWindTable();
  }

  window.filterWindTable = () => {
    const timeInput = document.getElementById('windTimeInput');
    const filterTime = timeInput.value; // Formato "HH:mm"

    if (!filterTime) {
      windFilteredData = windData;
    } else {
      const [filterH, filterM] = filterTime.split(':').map(Number);
      windFilteredData = windData.filter(item => {
        // Extraer la parte de la hora (HH:mm:ss) del string original para comparar
        const timePartWithZ = (item.fechaRegistroStr || '').split('T')[1] || '';
        const timePart = timePartWithZ.substring(0, 8); // HH:mm:ss
        return timePart.startsWith(`${String(filterH).padStart(2, '0')}:${String(filterM).padStart(2, '0')}`);
      });
    }
    currentWindPage = 1;
    renderWindTable();
  }
  // --- Lógica del Historial de Viento (Modal) ---
  let windChartInstance = null;
  let windData = [];
  let windFilteredData = [];
  let currentWindPage = 1;
  const windRowsPerPage = 10;

  const btnWindPrev = document.getElementById('btnWindPrev');
  const btnWindNext = document.getElementById('btnWindNext');

  if(btnWindPrev) {
    btnWindPrev.addEventListener('click', () => {
      if (currentWindPage > 1) {
        currentWindPage--;
        renderWindTable();
      }
    });
  }
  if(btnWindNext) {
    btnWindNext.addEventListener('click', () => {
      const totalPages = Math.ceil(windFilteredData.length / windRowsPerPage) || 1;
      if (currentWindPage < totalPages) {
        currentWindPage++;
        renderWindTable();
      }
    });
  }

  function renderWindTable() {
    const tbody = document.querySelector('#windHistoryTable tbody');
    if(!tbody) return;
    tbody.innerHTML = '';
    const start = (currentWindPage - 1) * windRowsPerPage;
    const end = start + windRowsPerPage;
    const pageData = windFilteredData.slice(start, end);

    pageData.forEach(item => {
      const row = tbody.insertRow();
      // Separar la fecha y la hora para mostrarlas en columnas distintas.
      const [datePart, timePartWithZ] = item.fechaRegistroStr.split('T');
      const timePart = timePartWithZ.substring(0, 8); // Extraer solo HH:mm:ss

      row.innerHTML = `<td>${item.ID || '--'}</td><td>${datePart}</td><td>${timePart}</td><td><strong>${item.value.toFixed(2)} m/s</strong></td>`;
    });

    const totalPages = Math.ceil(windFilteredData.length / windRowsPerPage) || 1;
    const pageWindInfo = document.getElementById('pageWindInfo');
    if(pageWindInfo) pageWindInfo.textContent = `Página ${currentWindPage} de ${totalPages}`;
    if(btnWindPrev) btnWindPrev.disabled = currentWindPage === 1;
    if(btnWindNext) btnWindNext.disabled = currentWindPage >= totalPages;
  }

  function updateWindChartAndTable(items) {
    if (windChartInstance) windChartInstance.destroy();
    
    // --- OPTIMIZACIÓN: Muestreo de datos cada 3 minutos para la tabla Y EL GRÁFICO ---
    const sortedItems = [...items].sort((a, b) => a.timestamp - b.timestamp); // 1. Ordenar cronológicamente
    const sampledData = [];
    let lastKeptTimestamp = -Infinity;
    const threeMinutesInMillis = 3 * 60 * 1000;

    sortedItems.forEach(item => {
        if (item.timestamp >= lastKeptTimestamp + threeMinutesInMillis) {
            sampledData.push(item);
            lastKeptTimestamp = item.timestamp;
        }
    });
    if (sampledData.length === 0 && sortedItems.length > 0) {
        sampledData.push(sortedItems[sortedItems.length - 1]);
    }

    // Usar los datos muestreados para el gráfico
    const chartData = sampledData;
    
    const labels = chartData.map(item => {
      return (item.fechaRegistroStr || '')
        .replace('T', '_')
        .substring(0, 19);
    });
    const data = chartData.map(i => i.value);

    // Encontrar el valor máximo para resaltarlo en el gráfico
    const maxValue = data.length > 0 ? Math.max(...data) : 0;
    const peakData = data.map(d => (d === maxValue ? d : null));
    // Para asegurar que solo se muestre un punto si hay varios máximos iguales
    const firstMaxIndex = peakData.indexOf(maxValue);
    const singlePeakData = peakData.map((d, i) => (i === firstMaxIndex ? d : null));

    const ctxModal = document.getElementById('windChart').getContext('2d');
    
    const gradient = ctxModal.createLinearGradient(0, 0, 0, 400);
    gradient.addColorStop(0, 'rgba(40, 167, 69, 0.6)');
    gradient.addColorStop(1, 'rgba(40, 167, 69, 0.05)');

    windChartInstance = new Chart(ctxModal, {
      type: 'line',
      data: {
        labels: labels,
        datasets: [{
          label: 'Velocidad del Viento (m/s)',
          data: data,
          backgroundColor: gradient,
          borderColor: '#28a745',
          borderWidth: 2,
          fill: true,
          tension: 0.1,
          pointRadius: 2,
          pointHoverRadius: 5
        }, {
          label: `Peak (${maxValue.toFixed(2)} m/s)`,
          data: singlePeakData,
          type: 'scatter',
          backgroundColor: '#dc3545',
          pointRadius: 6,
          pointHoverRadius: 8,
          borderColor: 'rgba(255,255,255,0.8)',
          borderWidth: 2,
          showLine: false
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        interaction: { mode: 'index', intersect: false },
        plugins: {
          legend: { display: true },
          title: { display: true, text: 'Historial de Velocidad del Viento' }
        },
        scales: { 
          y: { beginAtZero: true, title: { display: true, text: 'm/s' } },
          x: { ticks: { maxRotation: 45, minRotation: 30, autoSkip: true, maxTicksLimit: 15 } }
        }
      }
    });

    windData = [...sampledData].reverse(); // Invertir para mostrar el más reciente primero en la tabla
    windFilteredData = windData;
    currentWindPage = 1;
    const timeInput = document.getElementById('windTimeInput');
    if (timeInput) timeInput.value = '';
    renderWindTable();
  }

  // --- Funciones Globales (accesibles desde HTML) ---
  window.openCgeModal = () => {
    const modal = document.getElementById('cgeModal');
    if(modal) modal.style.display = 'block';
  }

  window.closeCgeModal = () => {
    const modal = document.getElementById('cgeModal');
    if(modal) modal.style.display = 'none';
  }

  window.openVoltageModal = () => {
    const modal = document.getElementById('voltageModal');
    if(modal) modal.style.display = 'block';
  }

  window.closeVoltageModal = () => {
    const modal = document.getElementById('voltageModal');
    if(modal) modal.style.display = 'none';
  }

  window.openCurrentModal = () => {
    const modal = document.getElementById('currentModal');
    if(modal) modal.style.display = 'block';
  }

  window.closeCurrentModal = () => {
    const modal = document.getElementById('currentModal');
    if(modal) modal.style.display = 'none';
  }

  window.toggleGuide = () => {
    const content = document.getElementById("guideContent");
    const arrow = document.getElementById("guideArrow");
    const btn = document.getElementById("btnGuide");
    if (!content || !arrow || !btn) return;

    if (content.style.display === "block") {
      content.style.display = "none";
      arrow.innerHTML = "▼";
      btn.style.borderRadius = "8px"; 
    } else {
      content.style.display = "block";
      arrow.innerHTML = "▲";
      btn.style.borderRadius = "8px 8px 0 0"; 
    }
  }

  window.toggleFp = () => {
    const content = document.getElementById("fpContent");
    const arrow = document.getElementById("fpArrow");
    const btn = document.getElementById("btnFp");
    if (!content || !arrow || !btn) return;

    if (content.style.display === "block") {
      content.style.display = "none";
      arrow.innerHTML = "▼";
      btn.style.borderRadius = "8px"; 
    } else {
      content.style.display = "block";
      arrow.innerHTML = "▲";
      btn.style.borderRadius = "8px 8px 0 0"; 
    }
  }

  let consumoDataPoints = [];

  window.openConsumptionModal = () => {
    const modal = document.getElementById('regenModal');
    if(modal) modal.style.display = 'block';
    
    // Actualizar UI con los datos que ya hayan llegado
    requestAnimationFrame(() => {
        updateConsumptionUI();
    });
    
    // Mostrar estado si no hay datos
    if (consumoDataPoints.length === 0) {
        const status = document.getElementById('regenStatus');
        if(status) {
            status.textContent = "Esperando datos automáticos...";
            status.style.color = "#0a3d66";
        }
        const loader = document.getElementById('regenLoader');
        if(loader) loader.style.display = 'block';
    }
  }

  window.closeConsumptionModal = () => {
    const modal = document.getElementById('regenModal');
    if(modal) modal.style.display = 'none';
    
    if (consumoChartInstance) {
        consumoChartInstance.destroy();
        consumoChartInstance = null;
    }
  }

  function processEnergyData(csvContent) {
    // 1. Procesamiento línea por línea (Más robusto)
    const lines = csvContent.split(/\r?\n/);
    const points = [];
    
    for (let line of lines) {
        line = line.trim();
        // Ignorar encabezados o líneas vacías
        if (!line || line.toLowerCase().startsWith('fecha')) continue;

        const tokens = line.split(',').map(t => t.trim());
        if (tokens.length < 3) continue; // Requiere al menos Fecha, Hora, Valor

        const dateStr = tokens[0];
        const timeStr = tokens[1];
        const valStr = tokens[2];
        
        let val = parseFloat(valStr);
        if(isNaN(val)) continue;
        
        // Heurística: Si el valor es muy grande (>10000), asumir que son Watts y convertir a kW
        if (val > 10000) val = val / 1000;
        
        const dParts = dateStr.split('-');
        if(dParts.length !== 3) continue;
        
        let cleanTime = timeStr.toLowerCase().replace(/\./g, '').replace(/\s/g, '');
        const tMatch = cleanTime.match(/^(\d{1,2}):(\d{1,2}):(\d{1,2})([ap]m)?/);
        
        if (tMatch) {
            let h = parseInt(tMatch[1]);
            const m = parseInt(tMatch[2]);
            const s = parseInt(tMatch[3]);
            const ampm = tMatch[4]; // am o pm
            
            if(ampm === 'pm' && h !== 12) h += 12;
            if(ampm === 'am' && h === 12) h = 0;
            
            const dateObj = new Date(dParts[2], dParts[1]-1, dParts[0], h, m, s);
            points.push({
                t: dateObj.toLocaleString(),
                y: val,
                ms: dateObj.getTime()
            });
        }
    }
    return points.sort((a, b) => a.ms - b.ms);
  }

  function calculateEnergyStats(points) {
    let totalEnergyKwh = 0;
    let totalDurationMs = 0;
    
    for(let i = 0; i < points.length - 1; i++) {
        const p1 = points[i];
        const p2 = points[i+1];
        const dtHours = (p2.ms - p1.ms) / (1000 * 3600); // Horas
        
        // Integración trapezoidal: (y1 + y2) / 2 * dt
        // Asumimos que los puntos son Potencia (kW)
        if(dtHours > 0 && dtHours < 1) { // Ignorar saltos grandes (>1h)
            const avgPower = (Math.abs(p1.y) + Math.abs(p2.y)) / 2;
            totalEnergyKwh += avgPower * dtHours;
            totalDurationMs += (p2.ms - p1.ms);
        }
    }
    
    const minutes = Math.floor(totalDurationMs / 60000);
    return { kwh: totalEnergyKwh, minutes: minutes };
  }

  function updateConsumptionUI() {
    const loader = document.getElementById('regenLoader');
    const status = document.getElementById('regenStatus');
    
    if(status && consumoDataPoints.length > 0) {
        status.textContent = `Datos cargados: ${consumoDataPoints.length} registros.`;
        status.style.color = "#28a745";
    }
    
    // 1. Actualizar Tabla Consumo
    const tbodyCons = document.querySelector('#consumoTable tbody');
    if(tbodyCons) {
        tbodyCons.innerHTML = '';
        consumoDataPoints.sort((a, b) => a.ms - b.ms).forEach(p => {
            const row = tbodyCons.insertRow();
            row.innerHTML = `<td>${p.t}</td><td>${p.y.toFixed(2)}</td>`;
        });
    }

    // 2. Calcular Totales
    const consStats = calculateEnergyStats(consumoDataPoints);

    // Helper para rango de fechas
    const getDateRangeStr = (points) => {
        if (!points || points.length === 0) return "Sin datos";
        const sorted = [...points].sort((a, b) => a.ms - b.ms);
        const start = sorted[0].t;
        const end = sorted[sorted.length - 1].t;
        return `Desde: ${start}<br>Hasta: ${end}`;
    };

    const consVal = document.getElementById('totalConsumoValue');
    const consTime = document.getElementById('totalConsumoTime');
    if(consVal) consVal.textContent = `${consStats.kwh.toFixed(2)} kWh`;
    if(consTime) {
        consTime.innerHTML = `${getDateRangeStr(consumoDataPoints)}<br>Duración: ${consStats.minutes} min aprox.<br><span style="font-size:0.85em; font-style:italic;">(Cálculo Aproximado)</span>`;
    }

    // 3. Gráfico Consumo
    const ctxConsumoEl = document.getElementById('consumoChart');
    if (ctxConsumoEl) {
        const ctx = ctxConsumoEl.getContext('2d');
        // Asegurar orden cronológico y separar labels/data para Chart.js
        const sortedPoints = [...consumoDataPoints].sort((a, b) => a.ms - b.ms);
        const labels = sortedPoints.map(p => p.t);
        const dataValues = sortedPoints.map(p => p.y);

        // Robustez: Si el canvas cambió (DOM refresh), destruir instancia previa
        if (consumoChartInstance && consumoChartInstance.canvas !== ctxConsumoEl) {
            consumoChartInstance.destroy();
            consumoChartInstance = null;
        }

        if (consumoChartInstance) {
            consumoChartInstance.data.labels = labels;
            consumoChartInstance.data.datasets[0].data = dataValues;
            consumoChartInstance.update();
        } else {
            consumoChartInstance = new Chart(ctx, {
                type: 'line',
                data: {
                    labels: labels,
                    datasets: [{
                        label: 'Consumo (kW)',
                        data: dataValues,
                        borderColor: '#0d6efd',
                        backgroundColor: 'rgba(13, 110, 253, 0.1)',
                        fill: true,
                        tension: 0.3,
                        pointRadius: 2,
                        pointHoverRadius: 4
                    }]
                },
                options: {
                    responsive: true,
                    maintainAspectRatio: false,
                    animation: false,
                    interaction: { mode: 'index', intersect: false },
                    scales: { x: { display: false }, y: { beginAtZero: true, title: { display: true, text: 'Potencia (kW)' } } }
                }
            });
        }
    }
  }

  // --- Inicialización de Gráficos CGE (Tendencias) ---
  const commonOptions = {
    responsive: true,
    maintainAspectRatio: false,
    animation: false,
    elements: { point: { radius: 0, hitRadius: 10 } },
    scales: { x: { display: false } },
    plugins: { legend: { labels: { boxWidth: 10, font: { size: 10 } } } }
  };

  // 1. Triángulo de Potencias
  const ctxPower = document.getElementById('cgePowerChart').getContext('2d');
  const gradPowerActive = ctxPower.createLinearGradient(0, 0, 0, 400);
  gradPowerActive.addColorStop(0, 'rgba(40, 167, 69, 0.5)');
  gradPowerActive.addColorStop(1, 'rgba(40, 167, 69, 0.05)');

  const gradPowerApparent = ctxPower.createLinearGradient(0, 0, 0, 400);
  gradPowerApparent.addColorStop(0, 'rgba(255, 199, 7, 0.5)');
  gradPowerApparent.addColorStop(1, 'rgba(255, 199, 7, 0.05)');

  const cgePowerChart = new Chart(ctxPower, {
    type: 'line',
    data: {
        labels: [],
        datasets: [
            { label: 'Potencia Activa (kW)', data: [], borderColor: '#28a745', borderWidth: 2, fill: true, backgroundColor: gradPowerActive },
            { label: 'Potencia Aparente (kVA)', data: [], borderColor: '#ffc107', borderWidth: 2, fill: true, backgroundColor: gradPowerApparent }
        ]
    },
    options: {
        ...commonOptions,
        plugins: { ...commonOptions.plugins, title: { display: true, text: 'Eficiencia: kW vs kVA' } }
    }
  });

  // 2. Carga vs Desbalance
  const ctxUnbal = document.getElementById('cgeUnbalanceChart').getContext('2d');
  const gradUnbalCurrent = ctxUnbal.createLinearGradient(0, 0, 0, 400);
  gradUnbalCurrent.addColorStop(0, 'rgba(10, 114, 193, 0.5)');
  gradUnbalCurrent.addColorStop(1, 'rgba(10, 114, 193, 0.05)');

  const cgeUnbalanceChart = new Chart(ctxUnbal, {
    type: 'line',
    data: {
        labels: [],
        datasets: [
            { label: 'Desbalance (%)', data: [], borderColor: '#dc3545', borderWidth: 2, yAxisID: 'y1', fill: false },
            { label: 'Corriente Avg (A)', data: [], borderColor: '#0a72c1', borderWidth: 1, yAxisID: 'y', fill: true, backgroundColor: gradUnbalCurrent }
        ]
    },
    options: {
        ...commonOptions,
        plugins: { ...commonOptions.plugins, title: { display: true, text: 'Salud: Desbalance vs Carga' } },
        scales: {
            x: { display: false },
            y: { type: 'linear', display: true, position: 'right', title: { display: true, text: 'Amps' } },
            y1: { type: 'linear', display: true, position: 'left', title: { display: true, text: '%' }, grid: { drawOnChartArea: false } }
        }
    }
  });

  // 3. Perfil de Voltaje
  const ctxVolt = document.getElementById('cgeVoltageChart').getContext('2d');
  const gradVolt = ctxVolt.createLinearGradient(0, 0, 0, 400);
  gradVolt.addColorStop(0, 'rgba(23, 162, 184, 0.5)');
  gradVolt.addColorStop(1, 'rgba(23, 162, 184, 0.05)');

  const cgeVoltageChart = new Chart(ctxVolt, {
    type: 'line',
    data: {
        labels: [],
        datasets: [
            { label: 'Voltaje L-L Avg (kV)', data: [], borderColor: '#17a2b8', borderWidth: 2, fill: true, backgroundColor: gradVolt },
            { label: 'Límite Alto (+5%)', data: [], borderColor: 'rgba(220, 53, 69, 0.5)', borderWidth: 1, borderDash: [5, 5], pointRadius: 0 },
            { label: 'Límite Bajo (-5%)', data: [], borderColor: 'rgba(220, 53, 69, 0.5)', borderWidth: 1, borderDash: [5, 5], pointRadius: 0 }
        ]
    },
    options: {
        ...commonOptions,
        plugins: { ...commonOptions.plugins, title: { display: true, text: 'Estabilidad de Red (15 kV Base)' } },
        scales: {
            y: { 
                min: 14, max: 16,
                title: { display: true, text: 'kV' } 
            }
        }
    }
  });

  // 4. Gráfico Lineal para Voltajes de Fase
  const ctxPhaseVolt = document.getElementById('voltagePhasesChart').getContext('2d');
  const gradVAB = ctxPhaseVolt.createLinearGradient(0, 0, 0, 400);
  gradVAB.addColorStop(0, 'rgba(255, 199, 7, 0.5)');
  gradVAB.addColorStop(1, 'rgba(255, 199, 7, 0.05)');

  const gradVBC = ctxPhaseVolt.createLinearGradient(0, 0, 0, 400);
  gradVBC.addColorStop(0, 'rgba(40, 167, 69, 0.5)');
  gradVBC.addColorStop(1, 'rgba(40, 167, 69, 0.05)');

  const gradVCA = ctxPhaseVolt.createLinearGradient(0, 0, 0, 400);
  gradVCA.addColorStop(0, 'rgba(23, 162, 184, 0.5)');
  gradVCA.addColorStop(1, 'rgba(23, 162, 184, 0.05)');

  const voltagePhasesChart = new Chart(ctxPhaseVolt, {
    type: 'line',
    data: {
        labels: [],
        datasets: [
            { label: 'Fase A-B', data: [], borderColor: '#ffc107', borderWidth: 2, fill: false },
            { label: 'Fase B-C', data: [], borderColor: '#28a745', borderWidth: 2, fill: false },
            { label: 'Fase C-A', data: [], borderColor: '#17a2b8', borderWidth: 2, fill: false }
        ]
    },
    options: {
        ...commonOptions,
        plugins: { ...commonOptions.plugins, title: { display: true, text: 'Historial de Voltajes de Línea (L-L)' }, legend: { display: true } },
        scales: { y: { beginAtZero: false, title: { display: true, text: 'kV' } } }
    }
  });

  // 5. Gráfico Lineal para Voltajes de Fase (L-N)
  const ctxPhaseVoltLN = document.getElementById('voltageLNChart').getContext('2d');
  const gradVAN = ctxPhaseVoltLN.createLinearGradient(0, 0, 0, 400);
  gradVAN.addColorStop(0, 'rgba(255, 199, 7, 0.5)');
  gradVAN.addColorStop(1, 'rgba(255, 199, 7, 0.05)');

  const gradVBN = ctxPhaseVoltLN.createLinearGradient(0, 0, 0, 400);
  gradVBN.addColorStop(0, 'rgba(40, 167, 69, 0.5)');
  gradVBN.addColorStop(1, 'rgba(40, 167, 69, 0.05)');

  const gradVCN = ctxPhaseVoltLN.createLinearGradient(0, 0, 0, 400);
  gradVCN.addColorStop(0, 'rgba(23, 162, 184, 0.5)');
  gradVCN.addColorStop(1, 'rgba(23, 162, 184, 0.05)');

  const voltageLNChart = new Chart(ctxPhaseVoltLN, {
    type: 'line',
    data: {
        labels: [],
        datasets: [
            { label: 'Fase A-N', data: [], borderColor: '#ffc107', borderWidth: 2, fill: false },
            { label: 'Fase B-N', data: [], borderColor: '#28a745', borderWidth: 2, fill: false },
            { label: 'Fase C-N', data: [], borderColor: '#17a2b8', borderWidth: 2, fill: false }
        ]
    },
    options: {
        ...commonOptions,
        plugins: { ...commonOptions.plugins, title: { display: true, text: 'Historial de Voltajes de Fase (L-N)' }, legend: { display: true } },
        scales: { y: { beginAtZero: false, title: { display: true, text: 'kV' } } }
    }
  });

  // 6. Gráfico Lineal para Corrientes de Fase
  const ctxCurrPhases = document.getElementById('currentPhasesChart').getContext('2d');
  const gradCurA = ctxCurrPhases.createLinearGradient(0, 0, 0, 400);
  gradCurA.addColorStop(0, 'rgba(255, 199, 7, 0.5)');
  gradCurA.addColorStop(1, 'rgba(255, 199, 7, 0.05)');

  const gradCurB = ctxCurrPhases.createLinearGradient(0, 0, 0, 400);
  gradCurB.addColorStop(0, 'rgba(40, 167, 69, 0.5)');
  gradCurB.addColorStop(1, 'rgba(40, 167, 69, 0.05)');

  const gradCurC = ctxCurrPhases.createLinearGradient(0, 0, 0, 400);
  gradCurC.addColorStop(0, 'rgba(23, 162, 184, 0.5)');
  gradCurC.addColorStop(1, 'rgba(23, 162, 184, 0.05)');

  const currentPhasesChart = new Chart(ctxCurrPhases, {
    type: 'line',
    data: {
        labels: [],
        datasets: [
            { label: 'Fase A', data: [], borderColor: '#ffc107', borderWidth: 2, fill: false },
            { label: 'Fase B', data: [], borderColor: '#28a745', borderWidth: 2, fill: false },
            { label: 'Fase C', data: [], borderColor: '#17a2b8', borderWidth: 2, fill: false }
        ]
    },
    options: {
        ...commonOptions,
        plugins: { ...commonOptions.plugins, title: { display: true, text: 'Historial de Corrientes de Fase' }, legend: { display: true } },
        scales: { y: { beginAtZero: true, title: { display: true, text: 'Amps' } } }
    }
  });

  // 7. Gráfico Lineal para Corrientes Neutro y Tierra
  const ctxCurrNG = document.getElementById('currentNGChart').getContext('2d');
  const gradCurN = ctxCurrNG.createLinearGradient(0, 0, 0, 400);
  gradCurN.addColorStop(0, 'rgba(23, 162, 184, 0.5)');
  gradCurN.addColorStop(1, 'rgba(23, 162, 184, 0.05)');

  const gradCurG = ctxCurrNG.createLinearGradient(0, 0, 0, 400);
  gradCurG.addColorStop(0, 'rgba(108, 117, 125, 0.5)');
  gradCurG.addColorStop(1, 'rgba(108, 117, 125, 0.05)');

  const currentNGChart = new Chart(ctxCurrNG, {
    type: 'line',
    data: {
        labels: [],
        datasets: [
            { label: 'Neutro (N)', data: [], borderColor: '#17a2b8', borderWidth: 2, fill: false },
            { label: 'Tierra (G)', data: [], borderColor: '#6c757d', borderWidth: 2, fill: false }
        ]
    },
    options: {
        ...commonOptions,
        plugins: { ...commonOptions.plugins, title: { display: true, text: 'Historial Corrientes Neutro y Tierra' }, legend: { display: true } },
        scales: { y: { beginAtZero: true, title: { display: true, text: 'Amps' } } }
    }
  });

  function updateCgeCharts() {
      const now = new Date().toLocaleTimeString();
      
      // Actualizar Gráfico de Potencias
      if (cgePowerChart.data.labels.length > 100) {
          cgePowerChart.data.labels.shift();
          cgePowerChart.data.datasets[0].data.shift();
          cgePowerChart.data.datasets[1].data.shift();
      }
      cgePowerChart.data.labels.push(now);
      cgePowerChart.data.datasets[0].data.push(cgeActivePower * 0.001);
      cgePowerChart.data.datasets[1].data.push(cgeApparentPower * 0.001);
      cgePowerChart.update('none');

      // Actualizar Gráfico Desbalance
      if (cgeUnbalanceChart.data.labels.length > 100) {
          cgeUnbalanceChart.data.labels.shift();
          cgeUnbalanceChart.data.datasets[0].data.shift();
          cgeUnbalanceChart.data.datasets[1].data.shift();
      }
      cgeUnbalanceChart.data.labels.push(now);
      cgeUnbalanceChart.data.datasets[0].data.push(cgeCurrentUnbalance);
      cgeUnbalanceChart.data.datasets[1].data.push(cgeCurrentAmp);
      cgeUnbalanceChart.update('none');

      // Actualizar Gráfico Voltaje
      if (cgeVoltageChart.data.labels.length > 100) {
          cgeVoltageChart.data.labels.shift();
          cgeVoltageChart.data.datasets.forEach(d => d.data.shift());
      }
      cgeVoltageChart.data.labels.push(now);
      cgeVoltageChart.data.datasets[0].data.push(cgeVoltageAvg * 0.001);
      cgeVoltageChart.data.datasets[1].data.push(15.75);
      cgeVoltageChart.data.datasets[2].data.push(14.25);
      cgeVoltageChart.update('none');
  }

  function updateVoltagePhaseChart() {
      const now = new Date().toLocaleTimeString();
      
      // Actualizar L-L
      if (voltagePhasesChart.data.labels.length > 100) {
          voltagePhasesChart.data.labels.shift();
          voltagePhasesChart.data.datasets.forEach(d => d.data.shift());
      }
      
      voltagePhasesChart.data.labels.push(now);
      voltagePhasesChart.data.datasets[0].data.push(voltAB * 0.001);
      voltagePhasesChart.data.datasets[1].data.push(voltBC * 0.001);
      voltagePhasesChart.data.datasets[2].data.push(voltCA * 0.001);
      
      voltagePhasesChart.update('none');

      // Actualizar L-N
      if (voltageLNChart.data.labels.length > 100) {
          voltageLNChart.data.labels.shift();
          voltageLNChart.data.datasets.forEach(d => d.data.shift());
      }
      
      voltageLNChart.data.labels.push(now);
      voltageLNChart.data.datasets[0].data.push(voltAN * 0.001);
      voltageLNChart.data.datasets[1].data.push(voltBN * 0.001);
      voltageLNChart.data.datasets[2].data.push(voltCN * 0.001);
      
      voltageLNChart.update('none');
  }

  function updateCurrentCharts() {
      const now = new Date().toLocaleTimeString();
      
      // Actualizar Fases A, B, C
      if (currentPhasesChart.data.labels.length > 100) {
          currentPhasesChart.data.labels.shift();
          currentPhasesChart.data.datasets.forEach(d => d.data.shift());
      }
      currentPhasesChart.data.labels.push(now);
      currentPhasesChart.data.datasets[0].data.push(currA);
      currentPhasesChart.data.datasets[1].data.push(currB);
      currentPhasesChart.data.datasets[2].data.push(currC);
      currentPhasesChart.update('none');

      // Actualizar Neutro y Tierra
      if (currentNGChart.data.labels.length > 100) {
          currentNGChart.data.labels.shift();
          currentNGChart.data.datasets.forEach(d => d.data.shift());
      }
      currentNGChart.data.labels.push(now);
      currentNGChart.data.datasets[0].data.push(currN);
      currentNGChart.data.datasets[1].data.push(currG);
      currentNGChart.update('none');
  }

  window.printKwhReport = () => {
    const originalRows = kwhRowsPerPage;
    const originalPage = currentKwhPage;
    
    currentKwhPage = 1;
    
    const tsEl = document.getElementById('kwhReportTimestamp');
    if(tsEl) tsEl.textContent = `Generado el: ${new Date().toLocaleString()}`;
    
    document.body.classList.add('printing-modal');
    renderKwhTable();
    
    setTimeout(() => {
      window.print();
      document.body.classList.remove('printing-modal');
      kwhRowsPerPage = originalRows;
      currentKwhPage = originalPage;
      renderKwhTable();
    }, 500);
  }

  window.openHistory = (stsId) => {
    currentStsHistoryId = stsId;
    const modal = document.getElementById('kwhModal');
    const title = document.getElementById('modalTitle');
    
    // Limpiar gráfico anterior para evitar datos mezclados
    if (kwhChartInstance) {
      kwhChartInstance.destroy();
      kwhChartInstance = null;
    }

    if(modal) modal.style.display = "block";
    title.innerHTML = `<span>📊</span> Historial KWH - STS ${stsId}`;
    
    const input = document.getElementById('kwhDateInput');
    const now = new Date();
    input.value = new Date(now.getTime() - (now.getTimezoneOffset() * 60000)).toISOString().split('T')[0];
    
    kwhData = [];
    renderKwhTable(); // Limpiar tabla
    
    const responseTopic = `respuesta_hist_kwh_STS${stsId}`;
    
    client.subscribe(responseTopic, (err) => {
      if(!err) {
        console.log(`✅ Suscrito a ${responseTopic} para historial.`);
      }
    });
    
    requestKwhHistoryData();
  }

  window.closeHistory = () => {
    const modal = document.getElementById('kwhModal');
    if(modal) modal.style.display = "none";
    
    if(currentStsHistoryId !== null) {
      const responseTopic = `respuesta_hist_kwh_STS${currentStsHistoryId}`;
      client.unsubscribe(responseTopic);
      currentStsHistoryId = null;
    }
    if (kwhChartInstance) {
      kwhChartInstance.destroy();
      kwhChartInstance = null;
    }
  }

  window.requestKwhHistoryData = () => {
    const dateVal = document.getElementById('kwhDateInput').value;
    if(!dateVal) { showToast("Seleccione una fecha", "error"); return; }

    const loader = document.getElementById('modalLoader');
    const status = document.getElementById('modalStatus');

    if(loader) loader.style.display = 'block';
    if(status) status.style.display = 'none';
    
    kwhData = [];
    renderKwhTable();

    const topic = `consulta_hist_kwh_STS${currentStsHistoryId}`;
    client.publish(topic, dateVal);
    
    setTimeout(() => {
        if(loader) loader.style.display = 'none';
    }, 8000);
  }

  window.openWindHistory = () => {
    const modal = document.getElementById('windModal');
    if(modal) modal.style.display = "block";
    
    const input = document.getElementById('windDateInput');
    const now = new Date();
    input.value = new Date(now.getTime() - (now.getTimezoneOffset() * 60000)).toISOString().split('T')[0];
    
    windData = [];
    renderWindTable();
    
    const responseTopic = `respuesta_hist_viento`;
    client.subscribe(responseTopic, (err) => {
      if(!err) console.log(`✅ Suscrito a ${responseTopic} para historial de viento.`);
    });
    
    window.requestWindHistoryData();
  }

  window.closeWindHistory = () => {
    const modal = document.getElementById('windModal');
    if(modal) modal.style.display = "none";
    
    client.unsubscribe(`respuesta_hist_viento`);
    
    if (windChartInstance) {
      windChartInstance.destroy();
      windChartInstance = null;
    }
  }

  window.requestWindHistoryData = () => {
    const dateVal = document.getElementById('windDateInput').value;
    if(!dateVal) { showToast("Seleccione una fecha", "error"); return; }

    const loader = document.getElementById('windModalLoader');
    const status = document.getElementById('windModalStatus');

    if(loader) loader.style.display = 'block';
    if(status) status.style.display = 'none';
    
    windData = [];
    renderWindTable();

    const topic = `consulta_hist_viento`;
    client.publish(topic, dateVal);
    
    setTimeout(() => {
        if(loader && loader.style.display === 'block') loader.style.display = 'none';
    }, 8000);
  }

  // Cerrar modal si se hace clic fuera
  window.onclick = function(event) {
    const modal = document.getElementById('kwhModal');
    if (event.target == modal) closeHistory();
    
    const cModal = document.getElementById('cgeModal');
    if (event.target == cModal) closeCgeModal();
    
    const v2Modal = document.getElementById('voltageModal');
    if (event.target == v2Modal) closeVoltageModal();
    
    const c2Modal = document.getElementById('currentModal');
    if (event.target == c2Modal) closeCurrentModal();

    const rModal = document.getElementById('regenModal');
    if (event.target == rModal) closeConsumptionModal();

    const wModal = document.getElementById('windModal');
    if (event.target == wModal) closeWindHistory();
    
    if (event.target == document.getElementById('slowDownModal')) closeSlowDownModal();
  }

  window.requestPeakHistoryData = () => {
    const dateInput = document.getElementById('peakDateInput');
    if (!dateInput) return;
    const dateVal = dateInput.value;
    if (!dateVal) {
      showToast("Por favor, seleccione una fecha.", "error");
      return;
    }

    const histInd = document.getElementById('historyIndicator');
    if(histInd) {
      histInd.textContent = "🗂️ Historial: Solicitando...";
      histInd.style.color = "#fd7e14";
    }
    const mainLoader = document.getElementById('mainTableLoader');
    if(mainLoader) mainLoader.style.display = 'block';
    
    // Limpiar datos anteriores
    peakHistoryData = [];
    renderTable();

    client.publish('CONSULTA_PEAKS', dateVal);
  };
   // Suscripción al topic
  client.on('connect', () => {
    console.log('Conectado al broker MQTT');
    showToast("Conectado al servidor de datos", "success");
    const textEl = document.getElementById('connText');
    const statusEl = document.getElementById('connectionStatus');
    if(textEl) textEl.textContent = 'Conectado';
    if(statusEl) statusEl.className = 'status-connected';

    lastDataTime = Date.now();
    client.subscribe('MEDIDOR_CGE');
    client.subscribe('I_MAX_GRUAS');
    client.subscribe('I_STS1');
    client.subscribe('I_STS2');
    client.subscribe('I_STS3');
    client.subscribe('I_STS4');
    client.subscribe('I_STS5');
    client.subscribe('SLOWSTS1');
    client.subscribe('SLOWSTS2');
    client.subscribe('SLOWSTS3');
    client.subscribe('SLOWSTS4');
    client.subscribe('SLOWSTS5');
    client.subscribe('Viento_STS1');
    client.subscribe('REGISTRO_PEAK');
    client.subscribe('RESPUESTA_SLOWSTS');
    client.subscribe('CU_UN_WOR');
    client.subscribe('VOLT_L_L_AVG');
    client.subscribe('VOLT_UB_L_N_WOR');
    client.subscribe('APARENTE_TOTAL');
    client.subscribe('ACTIVE_TOTAL');
    client.subscribe('REACTIVE_TOTAL');
    client.subscribe('VOLTAJE_A-B');
    client.subscribe('VOLTAJE_B-C');
    client.subscribe('VOLTAJE_C-A');
    client.subscribe('VOLTAJE_A-N');
    client.subscribe('VOLTAJE_B-N');
    client.subscribe('VOLTAJE_C-N');
    client.subscribe('VOLTAJE_TOTAL_L-N');
    client.subscribe('CORRIENTE_A');
    client.subscribe('CORRIENTE_B');
    client.subscribe('CORRIENTE_C');
    client.subscribe('CORRIENTE_N');
    client.subscribe('CORRIENTE_TIERRA');
    client.subscribe('RESPUESTA_CONSUMO');
    client.subscribe('respuesta_hist_viento');
    client.subscribe(['valor_actual_kwh_sts1', 'valor_actual_kwh_sts2', 'valor_actual_kwh_sts3', 'valor_actual_kwh_sts4', 'valor_actual_kwh_sts5'], (err) => {
      if (!err) {
        const requestKwhNow = () => {
          client.publish('solicitar_kwh_ahora_sts1', 'req');
          client.publish('solicitar_kwh_ahora_sts2', 'req');
          client.publish('solicitar_kwh_ahora_sts3', 'req');
          client.publish('solicitar_kwh_ahora_sts4', 'req');
          client.publish('solicitar_kwh_ahora_sts5', 'req');
        };
        requestKwhNow();
        setInterval(requestKwhNow, 5000);

        setTimeout(() => {
          client.subscribe('HISTORIAL_PEAKS');
          // Establecer la fecha de hoy y solicitar los datos iniciales
          const dateInput = document.getElementById('peakDateInput');
          if (dateInput) {
            const now = new Date();
            dateInput.value = new Date(now.getTime() - (now.getTimezoneOffset() * 60000)).toISOString().split('T')[0];
            requestPeakHistoryData();
          }
        }, 2500);
      }
    });
  });
   
  client.on('reconnect', () => {
    const textEl = document.getElementById('connText');
    const statusEl = document.getElementById('connectionStatus');
    if(textEl) textEl.textContent = 'Reconectando...';
    if(statusEl) statusEl.className = 'status-reconnecting';
  });

  client.on('close', () => {
    const textEl = document.getElementById('connText');
    const statusEl = document.getElementById('connectionStatus');
    if(textEl) textEl.textContent = 'Desconectado';
    if(statusEl) statusEl.className = 'status-disconnected';
  });

  client.on('error', (err) => {
    console.error('Error MQTT:', err);
    showToast("Error de conexión MQTT", "error");
    const textEl = document.getElementById('connText');
    const statusEl = document.getElementById('connectionStatus');
    if(textEl) textEl.textContent = 'Error de conexión';
    if(statusEl) statusEl.className = 'status-disconnected';
  });

  client.on('message', (topic, message) => {
    lastDataTime = Date.now();

    if (topic === 'MEDIDOR_CGE') {
      const value = parseFloat(message.toString());
      if (!isNaN(value)) {
        const now = new Date();
        const timeLabel = now.toLocaleTimeString();
        const fullDate = now.toLocaleString();

        const topic1El = document.getElementById('topic1');
        const loader1 = document.getElementById('topic1Loader');
        const content1 = document.getElementById('topic1Content');

        if(topic1El) topic1El.innerHTML = `${value.toFixed(2)} <span class="sts-unit">Amp</span>`;
        if(loader1 && loader1.style) loader1.style.display = 'none';
        if(content1) content1.style.display = 'block';

        cgeCurrentAmp = value;
        const modalAmp = document.getElementById('val_CGE_AMP');
        if (modalAmp) modalAmp.innerHTML = `${value.toFixed(2)} <span class="sts-unit">Amp</span>`;

        if(value > 120) {
          if (!alertActive) {
            alertActive = true;
            showVisualAlert(value); 
            addPeakToHistory(value, fullDate);
            const payload = JSON.stringify({ 
              Valor: value, 
              FechaRegistro: new Date().toISOString() 
            });
            client.publish('REGISTRO_PEAK', payload);
          }
        } else {
          alertActive = false;
          if(alertContainer) alertContainer.style.display = 'none';
        }

        data.labels.push(timeLabel);
        data.datasets[0].data.push(value);
        data.datasets[1].data.push(NaN);

        while (data.labels.length > 20) {
          data.labels.shift();
          data.datasets[0].data.shift();
          data.datasets[1].data.shift();
        }

        const chartLoader = document.getElementById('myChartLoader');
        if(chartLoader) chartLoader.style.display = 'none';
        requestMyChartUpdate();
      }
    }
    if (topic === 'I_MAX_GRUAS') {
      const value = parseFloat(message.toString());
      if (!isNaN(value)) {
        const topic2El = document.getElementById('topic2');
        const loader2 = document.getElementById('topic2Loader');
        const content2 = document.getElementById('topic2Content');

        if(topic2El) topic2El.innerHTML = `${value.toFixed(2)} <span class="sts-unit">Amp</span>`;
        if(loader2 && loader2.style) loader2.style.display = 'none';
        if(content2) content2.style.display = 'block';

        const lastDataIndex = data.datasets[1].data.length - 1;
        if (lastDataIndex >= 0) {
          data.datasets[1].data[lastDataIndex] = value;
        }
        const chartLoader = document.getElementById('myChartLoader');
        if(chartLoader) chartLoader.style.display = 'none';
        requestMyChartUpdate();
      }
    }
    
    const stsMatch = topic.match(/^(I_STS|SLOWSTS|valor_actual_kwh_sts)(\d*)$/);
    if (stsMatch) {
      const type = stsMatch[1];
      const id = parseInt(stsMatch[2], 10);
      const valueStr = message.toString();

      if (type === 'I_STS') {
        const value = parseFloat(valueStr);
        if (!isNaN(value)) {
          const topicNum = !isNaN(id) ? id + 2 : 3; // Si no hay ID (ej. I_STS), asume STS1 (topic3)
          const el = document.getElementById(`topic${topicNum}`);
          if(el) el.innerHTML = `${value.toFixed(2)} <span class="sts-unit">Amp</span>`;

          const loader = document.getElementById(`topic${topicNum}Loader`);
          if(loader && loader.style) loader.style.display = 'none';

          const content = document.getElementById(`topic${topicNum}Content`);
          if(content) content.style.display = 'block';
        }
      } else if (type === 'SLOWSTS') {
        const isSlow = valueStr.toLowerCase() === 'true';
        const cell = document.getElementById(`topic${id + 2}-cell`);
        const legend = cell ? cell.querySelector('.slow-down-legend') : null;

        if (cell && legend) {
          if (isSlow) {
            cell.style.backgroundColor = '#dc3545';
            legend.style.display = 'block';
            client.publish('CONSULTA_SLOWSTS', 'req');
          } else {
            cell.style.backgroundColor = '';
            legend.style.display = 'none';
          }
        }
      } else if (type === 'valor_actual_kwh_sts') {
        const value = parseFloat(valueStr);
        if (!isNaN(value)) {
          const elementId = `kwh_sts${id}`;
          const el = document.getElementById(elementId);
          if (el) {
            el.innerHTML = `${value.toFixed(0)} <span class="sts-unit">kWh</span> <span class="update-spinner active"></span>`;
            setTimeout(() => {
                const spinner = el.querySelector('.update-spinner');
                if (spinner) spinner.classList.remove('active');
            }, 1000);
          }
        }
      }
      return;
    }

    if (topic === 'RESPUESTA_SLOWSTS') {
      try {
        const responseData = JSON.parse(message.toString());
        const craneMap = {
          'SLOWSTS1': 'last_slow_sts1',
          'SLOWSTS2': 'last_slow_sts2',
          'SLOWSTS3': 'last_slow_sts3',
          'SLOWSTS4': 'last_slow_sts4',
          'SLOWSTS5': 'last_slow_sts5'
        };

        const elementId = craneMap[responseData.ultimo_slowdown];
        if (elementId && responseData.fecha_hora) {
          const el = document.getElementById(elementId);
          if(el) {
            el.innerHTML = `Último Slow:<br>${responseData.fecha_hora}`;
            el.style.display = 'block';
          }
        }
      } catch (e) { console.error("Error procesando respuesta slow sts:", e); }
    }

    const cgeMap = {
      'CU_UN_WOR': { id: 'val_CU_UN_WOR', unit: '%', scale: 1 },
      'VOLT_L_L_AVG': { id: 'val_VOLT_L_L_AVG', unit: 'kV', scale: 0.001 },
      'VOLT_UB_L_N_WOR': { id: 'val_VOLT_UB_L_N_WOR', unit: '%', scale: 1 },
      'APARENTE_TOTAL': { id: 'val_APARENTE_TOTAL', unit: 'kVA', scale: 0.001 },
      'ACTIVE_TOTAL': { id: 'val_ACTIVE_TOTAL', unit: 'kW', scale: 0.001 },
      'REACTIVE_TOTAL': { id: 'val_REACTIVE_TOTAL', unit: 'kVAR', scale: 0.001 },
      'VOLTAJE_A-B': { id: 'val_VOLTAJE_A-B', unit: 'kV', scale: 0.001 },
      'VOLTAJE_B-C': { id: 'val_VOLTAJE_B-C', unit: 'kV', scale: 0.001 },
      'VOLTAJE_C-A': { id: 'val_VOLTAJE_C-A', unit: 'kV', scale: 0.001 },
      'VOLTAJE_A-N': { id: 'val_VOLTAJE_A-N', unit: 'kV', scale: 0.001 },
      'VOLTAJE_B-N': { id: 'val_VOLTAJE_B-N', unit: 'kV', scale: 0.001 },
      'VOLTAJE_C-N': { id: 'val_VOLTAJE_C-N', unit: 'kV', scale: 0.001 },
      'VOLTAJE_TOTAL_L-N': { id: 'val_VOLTAJE_TOTAL_L-N', unit: 'kV', scale: 0.001 },
      'CORRIENTE_A': { id: 'val_CORRIENTE_A', unit: 'A', scale: 1 },
      'CORRIENTE_B': { id: 'val_CORRIENTE_B', unit: 'A', scale: 1 },
      'CORRIENTE_C': { id: 'val_CORRIENTE_C', unit: 'A', scale: 1 },
      'CORRIENTE_N': { id: 'val_CORRIENTE_N', unit: 'A', scale: 1 },
      'CORRIENTE_TIERRA': { id: 'val_CORRIENTE_TIERRA', unit: 'A', scale: 1 }
    };
    if (cgeMap[topic]) {
      let val = parseFloat(message.toString());
      if (!isNaN(val)) {
        const config = cgeMap[topic];
        
        if (topic === 'ACTIVE_TOTAL') cgeActivePower = val;
        if (topic === 'APARENTE_TOTAL') cgeApparentPower = val;
        if (topic === 'CU_UN_WOR') cgeCurrentUnbalance = val;
        if (topic === 'VOLT_L_L_AVG') cgeVoltageAvg = val;
        if (topic === 'VOLTAJE_A-B') voltAB = val;
        if (topic === 'VOLTAJE_B-C') voltBC = val;
        if (topic === 'VOLTAJE_C-A') voltCA = val;
        if (topic === 'VOLTAJE_A-N') voltAN = val;
        if (topic === 'VOLTAJE_B-N') voltBN = val;
        if (topic === 'VOLTAJE_C-N') voltCN = val;
        if (topic === 'CORRIENTE_A') currA = val;
        if (topic === 'CORRIENTE_B') currB = val;
        if (topic === 'CORRIENTE_C') currC = val;
        if (topic === 'CORRIENTE_N') currN = val;
        if (topic === 'CORRIENTE_TIERRA') currG = val;

        if (document.getElementById('cgeModal').style.display === 'block') {
             updateCgeCharts();
        }
        if (document.getElementById('voltageModal').style.display === 'block') {
             updateVoltagePhaseChart();
        }
        if (document.getElementById('currentModal').style.display === 'block') {
             updateCurrentCharts();
        }

        val = val * config.scale;
        const formattedVal = val.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
        const el = document.getElementById(config.id);
        if(el) el.innerHTML = `${formattedVal} <span class="sts-unit">${config.unit}</span>`;

        if (topic === 'ACTIVE_TOTAL') {
            const descEl = document.getElementById('desc_ACTIVE_TOTAL');
            if (descEl) {
                descEl.innerHTML = '🔌 Consumiendo de Red';
                descEl.style.color = 'rgba(255,255,255,0.9)';
                descEl.style.fontWeight = 'normal';
                descEl.style.fontSize = '0.75rem';
            }
        }

        if ((topic === 'ACTIVE_TOTAL' || topic === 'APARENTE_TOTAL') && cgeApparentPower > 0) {
            const fp = cgeActivePower / cgeApparentPower;
            const fpElement = document.getElementById('val_FACTOR_POTENCIA');
            if(fpElement) {
                fpElement.innerHTML = fp.toFixed(3);
            }
            const fpEx = document.getElementById('fpExampleCalc');
            if(fpEx) {
                fpEx.innerHTML = `${(cgeActivePower*0.001).toFixed(2)} kW / ${(cgeApparentPower*0.001).toFixed(2)} kVA = <strong>${fp.toFixed(3)}</strong>`;
            }
        }
      }
    }

    if (topic.startsWith('respuesta_hist_kwh_STS')) {
      const status = document.getElementById('modalStatus');
      const loader = document.getElementById('modalLoader');
      const rawData = message.toString().trim();
      
      const match = topic.match(/STS(\d+)/);
      let parsedItems = [];
      if (match && match[1]) {
        const stsIdFromTopic = parseInt(match[1], 10);
        let csvContent = rawData;
        try {
            const json = JSON.parse(rawData);
            if (json.total_eventos === 0) {
                if (currentStsHistoryId === stsIdFromTopic) {
                    loader.style.display = "none";
                    if(status) {
                      status.innerHTML = '<div style="padding: 15px; background-color: #f8d7da; color: #721c24; border-radius: 8px; border: 1px solid #f5c6cb; margin-top: 20px;"><strong>❌ Sin Datos</strong><br>No se encontraron registros para la fecha seleccionada.</div>';
                      status.style.display = "block";
                    }
                    
                    if (kwhChartInstance) { kwhChartInstance.destroy(); kwhChartInstance = null; }
                }
                return;
            }
            if (json.contenido_csv) {
                csvContent = json.contenido_csv;
            }
            if (json.archivo && currentStsHistoryId === stsIdFromTopic) {
                 const filename = json.archivo.split(/[/\\]/).pop();
                 const titleEl = document.getElementById('modalTitle');
                 titleEl.innerHTML = `<span>📊</span> Historial KWH - STS ${stsIdFromTopic} <div style="font-size:0.5em; font-weight:normal; color:#666; margin-top:5px;">📄 ${filename}</div>`;
            }
        } catch (e) {}
        
        try {
          // Análisis JSON robusto: intentar parsear, y si falla, buscar el último JSON válido.
          let jsonArray = [];
          try {
            jsonArray = JSON.parse(csvContent);
          } catch (jsonError) {
            console.warn("Fallo el parseo JSON inicial, intentando recuperar...", jsonError);
            const lastValidJsonEnd = csvContent.lastIndexOf('}]');
            if (lastValidJsonEnd > 0) {
              jsonArray = JSON.parse(csvContent.substring(0, lastValidJsonEnd + 2));
            }
          }
          if (Array.isArray(jsonArray)) {
            jsonArray.forEach(item => {
              const fechaRegistro = new Date(item.FechaRegistro);
              parsedItems.push({
                ID: item.ID,
                fecha: fechaRegistro.toLocaleDateString('es-CL'),
                hora: fechaRegistro.toLocaleTimeString('es-CL'),
                fechaRegistroStr: item.FechaRegistro, // Guardar la cadena original
                energiaVal: parseFloat(item.Valor),
                energiaStr: String(item.Valor),
                turno: '', // El nuevo formato no parece tener turno
                timestamp: fechaRegistro.getTime()
              });
            });
          }
        } catch (e) {
          // Si falla, volver al parseo de CSV
          const lines = csvContent.split(/\r?\n/).filter(line => line.trim() !== '');
          lines.forEach(line => {
            const parts = line.split(',');
            if (parts.length >= 3) {
              let ts = 0;
              try {
                const dStr = parts[0].trim();
                const tStr = parts[1].trim();
                const dParts = dStr.split(/[-/]/);
                if (dParts.length === 3) {
                  let cleanTime = tStr.toLowerCase().replace(/\./g, '');
                  const isAm = cleanTime.includes('am');
                  const isPm = cleanTime.includes('pm');
                  cleanTime = cleanTime.replace(/\s*(am|pm)\s*/, '').trim();
                  let matchTime = cleanTime.match(/^(\d{1,2}):(\d{2}):?(\d{2})?/);
                  if (matchTime) {
                    let h = parseInt(matchTime[1], 10);
                    const m = parseInt(matchTime[2], 10);
                    const s = matchTime[3] ? parseInt(matchTime[3], 10) : 0;
                    if (isPm && h < 12) h += 12;
                    else if (isAm && h === 12) h = 0;
                    else if (!isAm && !isPm && h === 12) h = 0;
                    ts = new Date(dParts[2], dParts[1]-1, dParts[0], h, m, s).getTime();
                  }
                }
              } catch(err){}
              parsedItems.push({
                fecha: parts[0].trim(),
                hora: parts[1].trim(),
                energiaVal: parseFloat(parts[2].trim()),
                energiaStr: parts[2].trim(),
                turno: parts.length > 3 ? parts[3].trim() : '',
                timestamp: ts
              });
            }
          });
        }

        if (currentStsHistoryId === stsIdFromTopic) {
          try {
            if (parsedItems.length > 0) {
              if(loader) loader.style.display = "none";
              if(status) status.style.display = "none"; 
              
              updateKwhChart(parsedItems);

              if (parsedItems.length === 0) {
                if(loader) loader.style.display = "none";
                if(status) { status.textContent = "No se encontraron datos válidos."; status.style.display = "block"; }
              }
            } else {
              if(loader) loader.style.display = "none";
              if(status) { status.textContent = "No se encontraron datos históricos."; status.style.display = "block"; }
            }
          } catch (e) {
            console.error("Error procesando historial KWH:", e);
            if(loader) loader.style.display = "none";
            if(status) {
              status.textContent = "Error al procesar los datos recibidos.";
              status.style.display = "block";
            }
          }
        }
      }
    }

    if (topic === 'respuesta_hist_viento') {
      const loader = document.getElementById('windModalLoader');
      const status = document.getElementById('windModalStatus');
      const rawData = message.toString().trim();
      let parsedItems = [];

      try {
        let jsonArray = [];
        try {
          jsonArray = JSON.parse(rawData);
        } catch (jsonError) {
          const lastValidJsonEnd = rawData.lastIndexOf('}]');
          if (lastValidJsonEnd > 0) {
            jsonArray = JSON.parse(rawData.substring(0, lastValidJsonEnd + 2));
          }
        }

        if (Array.isArray(jsonArray)) {
          jsonArray.forEach(item => {
            parsedItems.push({
              ID: item.ID,
              timestamp: new Date(item.FechaRegistro).getTime(),
              fechaRegistroStr: item.FechaRegistro, // Guardar la cadena original
              value: parseFloat(item.Valor)
            });
          });
        }
      } catch (e) {
        console.error("Error procesando historial de viento:", e);
      }

      if (parsedItems.length > 0) {
        if(loader) loader.style.display = "none";
        if(status) status.style.display = "none"; 
        updateWindChartAndTable(parsedItems);
      } else {
        if(loader) loader.style.display = "none";
        if(status) {
          status.innerHTML = '<div style="padding: 15px; background-color: #f8d7da; color: #721c24; border-radius: 8px; border: 1px solid #f5c6cb; margin-top: 20px;"><strong>❌ Sin Datos</strong><br>No se encontraron registros para la fecha seleccionada.</div>';
          status.style.display = "block";
        }
        if (windChartInstance) {
          windChartInstance.destroy();
          windChartInstance = null;
        }
      }
      return;
    }

    if (topic === 'Viento_STS1') {
      const value = parseFloat(message.toString());
      if (!isNaN(value)) {
        const vientoEl = document.getElementById('Viento_STS1');
        if(vientoEl) vientoEl.innerHTML = `${value.toFixed(2)} <span class="sts-unit">m/s</span>`;

        const knots = (value * 1.94384).toFixed(2);
        const kmh = (value * 3.6).toFixed(2);
        const topic8El = document.getElementById('topic8');
        const loader8 = document.getElementById('topic8Loader');
        const content8 = document.getElementById('topic8Content');
        
        if(topic8El) topic8El.innerHTML = `${knots} <span class="sts-unit">Nudos</span> | ${kmh} <span class="sts-unit">km/h</span>`;
        if(loader8) loader8.style.display = 'none';
        if(content8) content8.style.display = 'block';

        const cell = document.getElementById('topic8-cell');
        if(!cell) return;
        // Limpiar clases de estado anteriores
        cell.classList.remove('status-critical', 'status-high', 'status-warning');

        if (value >= 25) {
          cell.classList.add('status-critical');
        } else if (value >= 20) {
          cell.classList.add('status-high');
        } else if (value >= 18) {
          cell.classList.add('status-warning');
        }
      }
    }

    if (topic === 'HISTORIAL_PEAKS') {
      try {
        const historyData = JSON.parse(message.toString());
        
        if (Array.isArray(historyData)) {
          if (historyData.length === 0) {
            const ind = document.getElementById('historyIndicator');
            if(ind) { ind.textContent = `Total de eventos de peak: 0`; ind.style.color = "#ffc107"; }
            const mainLoader = document.getElementById('mainTableLoader');
            if(mainLoader) mainLoader.style.display = 'none';
            return;
          }
          // Procesar el nuevo formato JSON
          const processedData = historyData.map(item => {
            const fechaRegistro = new Date(item.FechaRegistro);
            return {
              ID: item.ID,
              value: parseFloat(item.Valor),
              fechaRegistroStr: item.FechaRegistro, // Guardar la cadena original
              timestamp: fechaRegistro.getTime()
            };
          }).sort((a, b) => b.timestamp - a.timestamp); // Ordenar descendente
          
          const maxRecords = rowsPerPage * maxPages;
          if (processedData.length > maxRecords) {
             processedData = processedData.slice(0, maxRecords);
          }

          peakHistoryData = processedData;
          currentPage = 1;
          
          requestAnimationFrame(() => {
            renderTable(); 
            const ind = document.getElementById('historyIndicator');
            if(ind) {
              ind.textContent = `Total de eventos de peak: ${peakHistoryData.length}`;
              ind.style.color = "#28a745"; 
            }
            const mainLoader = document.getElementById('mainTableLoader');
            const peakLoader = document.getElementById('peakChartLoader');
            if(mainLoader) mainLoader.style.display = 'none';
            if(peakLoader) peakLoader.style.display = 'none';
            updateLastPeakWidget();
            updatePeakChart(peakHistoryData); // Graficar todos los datos del día
          });
        } 
      } catch (e) { 
        console.error("Error procesando historial peaks:", e);
        const mainLoader = document.getElementById('mainTableLoader');
        const lastPeakLoader = document.getElementById('lastPeakLoader');
        const lastPeakContent = document.getElementById('lastPeakContent');
        if(mainLoader) mainLoader.style.display = 'none';
        if(lastPeakLoader) lastPeakLoader.style.display = 'none';
        if(lastPeakContent) lastPeakContent.style.display = 'block';
      }
    }

    // Manejo de respuestas de Consumo
    if (topic === 'RESPUESTA_CONSUMO') {
        const rawData = message.toString();
        let csvContent = rawData;
        try {
            const json = JSON.parse(rawData);
            if(json.contenido_csv) csvContent = json.contenido_csv;
        } catch(e) {}

        consumoDataPoints = processEnergyData(csvContent);

        // Actualizar UI si el modal está abierto
        const modal = document.getElementById('regenModal');
        if(modal && modal.style.display === 'block') {
            const loader = document.getElementById('regenLoader');
            if(loader) loader.style.display = 'none';
            updateConsumptionUI();
        }
    }

    if (topic.startsWith('respuesta_SLOW_STS')) {
      const receivedId = parseInt(topic.replace('respuesta_SLOW_STS', ''));
      const currentId = parseInt(window.currentSlowDownStsId);
      
      if (receivedId !== currentId) return;

      if (window.slowDownTimeout) clearTimeout(window.slowDownTimeout);
      const sdLoader = document.getElementById('slowDownLoader');
      if(sdLoader) sdLoader.style.display = 'none';
      const msgEl = document.getElementById('slowDownMsg');
      const rawData = message.toString();
      
      let labels = [];
      let values = [];
      
      const tbody = document.querySelector('#slowDownTable tbody');
      if (tbody) tbody.innerHTML = '';
      let lastStartTime = null;
      let totalDurationMs = 0;

      try {
        const jsonArray = JSON.parse(rawData);
        
        if (Array.isArray(jsonArray)) {
            // Ordenar por fecha para un cálculo de duración correcto
            jsonArray.sort((a, b) => new Date(a.FechaRegistro) - new Date(b.FechaRegistro));

            jsonArray.forEach(item => {
                const fechaRegistro = new Date(item.FechaRegistro);
                const [datePart, timePartWithZ] = item.FechaRegistro.split('T');
                const timePart = timePartWithZ.substring(0, 8);

                const isTrue = item.Valor === true;
                const statusStr = isTrue ? 'ACTIVO' : 'NORMAL';

                labels.push(`${datePart} ${timePart}`);
                values.push(isTrue ? 1 : 0);

                let durationStr = '';
                const currentMs = fechaRegistro.getTime();

                if (isTrue) {
                    lastStartTime = currentMs;
                } else {
                    if (lastStartTime !== null && !isNaN(lastStartTime) && !isNaN(currentMs)) {
                        const diff = (currentMs - lastStartTime) / 1000;
                        if (diff >= 0) {
                            durationStr = diff.toFixed(1) + ' s';
                            totalDurationMs += (currentMs - lastStartTime);
                        }
                        lastStartTime = null;
                    }
                }

                if (tbody) {
                    const row = tbody.insertRow();
                    row.innerHTML = `<td>${datePart}</td><td>${timePart}</td><td>${statusStr}</td><td style="font-weight:bold;">${durationStr}</td>`;
                    // Si el estado es ACTIVO, resaltar la fila
                    if (isTrue) {
                        row.classList.add('slow-down-active');
                    }
                }
            });
        }
      } catch (e) {
        console.error("Error parseando respuesta Slow Down:", e);
      }

      if (totalDurationMs > 0) {
            const seconds = Math.floor((totalDurationMs / 1000) % 60);
            const minutes = Math.floor((totalDurationMs / (1000 * 60)) % 60);
            const hours = Math.floor((totalDurationMs / (1000 * 60 * 60)));
            const timeEl = document.getElementById('totalSlowDownTime');
            const analysisEl = document.getElementById('slowDownAnalysis');
            if(timeEl) timeEl.textContent = `${hours}h ${minutes}m ${seconds}s`;
            if(analysisEl) analysisEl.style.display = 'block';
      } else {
          const analysisEl = document.getElementById('slowDownAnalysis');
          if(analysisEl) analysisEl.style.display = 'none';
      }

      if (values.length > 0) {
        msgEl.style.display = 'none';
        if (window.slowDownChartInstance) window.slowDownChartInstance.destroy();
        
        const ctxSD = document.getElementById('slowDownChart').getContext('2d');
        const gradientSD = ctxSD.createLinearGradient(0, 0, 0, 400);
        gradientSD.addColorStop(0, 'rgba(220, 53, 69, 0.6)');
        gradientSD.addColorStop(1, 'rgba(220, 53, 69, 0.05)');

        window.slowDownChartInstance = new Chart(ctxSD, {
          type: 'line',
          data: {
            labels: labels,
            datasets: [{
              label: 'Estado Slow Down',
              data: values,
              borderColor: '#dc3545',
              backgroundColor: gradientSD,
              borderWidth: 2,
              fill: true,
              stepped: true,
              pointRadius: 0,
              pointHoverRadius: 4
            }]
          },
          options: {
            responsive: true,
            maintainAspectRatio: false,
            interaction: { mode: 'index', intersect: false },
            scales: {
              x: { title: { display: true, text: 'Hora' } },
              y: { 
                  title: { display: true, text: 'Estado' },
                  min: 0,
                  max: 1.2,
                  ticks: { stepSize: 1, callback: function(val) { return val === 1 ? 'ACTIVO' : (val === 0 ? 'NORMAL' : val); } }
              }
            },
            plugins: {
                tooltip: { callbacks: { label: function(c) { return c.raw === 1 ? '⚠️ Slow Down ACTIVO' : '✅ Normal'; } } }
            }
          }
        });
      } else {
        if (window.slowDownChartInstance) {
            window.slowDownChartInstance.destroy();
            window.slowDownChartInstance = null;
        }
        if(msgEl) {
          msgEl.innerHTML = '<div style="padding: 15px; background-color: #f8d7da; color: #721c24; border-radius: 8px; border: 1px solid #f5c6cb; margin-top: 20px;"><strong>❌ Sin Datos</strong><br>No se encontraron registros de Slow Down para la fecha seleccionada.</div>';
          msgEl.style.display = 'block';
        }
      }
    }
  });

  window.currentSlowDownStsId = 1;

  window.openSlowDownModal = (id) => {
    window.currentSlowDownStsId = id;
    const title = document.getElementById('slowDownModalTitle');
    const modal = document.getElementById('slowDownModal');
    const analysis = document.getElementById('slowDownAnalysis');
    if(title) title.textContent = `📉 Gráfico Slow Down - STS${id}`;
    if(modal) modal.style.display = 'block';
    if(analysis) analysis.style.display = 'none';
    
    const topic = `respuesta_SLOW_STS${id}`;
    client.subscribe(topic, (err) => { if(!err) console.log(`✅ Suscrito dinámicamente a ${topic}`); });

    const input = document.getElementById('slowDownDateInput');
    if(!input.value) input.value = new Date().toISOString().split('T')[0];
    
    requestSlowDownData();
  }
  
  window.closeSlowDownModal = () => {
    const id = window.currentSlowDownStsId;
    if (id) {
        const topic = `respuesta_SLOW_STS${id}`;
        client.unsubscribe(topic, () => console.log(`🔕 Desuscrito de ${topic}`));
    }
    const modal = document.getElementById('slowDownModal');
    if(modal) modal.style.display = 'none';
  }
  
  window.requestSlowDownData = () => {
    const dateVal = document.getElementById('slowDownDateInput').value;
    if(!dateVal) { showToast("Por favor seleccione una fecha", "error"); return; }
    
    const loader = document.getElementById('slowDownLoader');
    const msg = document.getElementById('slowDownMsg');
    const analysis = document.getElementById('slowDownAnalysis');

    if(loader) loader.style.display = 'block';
    if(msg) msg.style.display = 'none';
    if(analysis) analysis.style.display = 'none';
    
    const tbody = document.querySelector('#slowDownTable tbody');
    if (tbody) tbody.innerHTML = '';
    
    if (window.slowDownChartInstance) {
      window.slowDownChartInstance.destroy();
      window.slowDownChartInstance = null;
    }
    
    const topicConsulta = `consulta_SLOW_STS${window.currentSlowDownStsId}`;
    showToast(`Consultando datos STS${window.currentSlowDownStsId}...`, "info");
    client.publish(topicConsulta, dateVal);
    
    if (window.slowDownTimeout) clearTimeout(window.slowDownTimeout);
    window.slowDownTimeout = setTimeout(() => {
        if(loader) loader.style.display = 'none';
        if (window.slowDownChartInstance) {
            window.slowDownChartInstance.destroy();
            window.slowDownChartInstance = null;
        }
        const msgEl = document.getElementById('slowDownMsg');
        if(msgEl) {
          msgEl.innerHTML = '<div style="padding: 15px; background-color: #f8d7da; color: #721c24; border-radius: 8px; border: 1px solid #f5c6cb; margin-top: 20px;"><strong>❌ Sin Datos</strong><br>No se encontraron registros de Slow Down para la fecha seleccionada.</div>';
          msgEl.style.display = 'block';
        }
    }, 8000);
  }

  function updateClock() {
    const now = new Date();
    const options = { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric', hour: '2-digit', minute: '2-digit', second: '2-digit' };
    const clockEl = document.getElementById('liveClock');
    if(clockEl) clockEl.textContent = now.toLocaleDateString('es-ES', options);
  }
  setInterval(updateClock, 1000);
  updateClock();

});

  function showToast(message, type = 'info') {
    const container = document.getElementById('toast-container');
    if(!container) return;
    const toast = document.createElement('div');
    toast.className = `toast ${type}`;
    toast.innerHTML = `<span>${type === 'success' ? '✅' : (type === 'error' ? '❌' : 'ℹ️')}</span> ${message}`;
    
    container.appendChild(toast);
    
    setTimeout(() => {
      toast.style.animation = 'fadeOut 0.5s forwards';
      setTimeout(() => toast.remove(), 500);
    }, 3000);
  }