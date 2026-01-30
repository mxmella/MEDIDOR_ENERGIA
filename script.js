document.addEventListener('DOMContentLoaded', () => {
  // Variables para modo oscuro persistente
  const bodyEl = document.body;
  const darkToggle = document.getElementById('darkModeToggle');
  const savedTheme = localStorage.getItem('theme');
  if(savedTheme === 'dark') {
   bodyEl.classList.add('dark-mode');
    if(darkToggle) darkToggle.textContent = 'Modo claro';
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
  const client = mqtt.connect('wss://mqtt-dashboard.com:8884/mqtt');
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

  // Verificar flujo de datos periódicamente
  setInterval(() => {
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
  gradientCGE.addColorStop(0, 'rgba(10, 114, 193, 0.6)');
  gradientCGE.addColorStop(1, 'rgba(10, 114, 193, 0.05)');

  const gradientGruas = ctx.createLinearGradient(0, 0, 0, 400);
  gradientGruas.addColorStop(0, 'rgba(255, 199, 44, 0.6)');
  gradientGruas.addColorStop(1, 'rgba(255, 199, 44, 0.05)');

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
      borderColor: '#0a72c1',
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
      animation: false,
      responsive: true,
      plugins: {
        legend: {
          labels: { color: getComputedStyle(document.body).getPropertyValue('--color-primary').trim() || '#0a3d66', font: { size: 16, weight: 'bold' } }
        },
        tooltip: {
          mode: 'index',
          intersect: false,
          backgroundColor: '#0a72c1',
          titleFont: { size: 16, weight: 'bold' },
          bodyFont: { size: 14 }
        },
      },
      scales: {
        x: {
          title: { display: true, text: 'Tiempo', color: getComputedStyle(document.body).getPropertyValue('--color-primary').trim() || '#0a3d66', font: { size: 18, weight: 'bold' } },
          ticks: { color: getComputedStyle(document.body).getPropertyValue('--color-primary').trim() || '#0a3d66', maxRotation: 45, minRotation: 30 },
          grid: { color: 'rgba(10, 61, 102, 0.08)', borderDash: [5, 5] }
        },
        y: {
          beginAtZero: true,
          title: { display: true, text: 'I Max', color: getComputedStyle(document.body).getPropertyValue('--color-primary').trim() || '#0a3d66', font: { size: 18, weight: 'bold' } },
          ticks: { color: getComputedStyle(document.body).getPropertyValue('--color-primary').trim() || '#0a3d66' },
          grid: { color: 'rgba(10, 61, 102, 0.08)', borderDash: [5, 5] }
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
          labels: { color: getComputedStyle(document.body).getPropertyValue('--color-primary').trim() || '#0a3d66', font: { size: 14, weight: 'bold' } }
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
            color: getComputedStyle(document.body).getPropertyValue('--color-primary').trim() || '#0a3d66',
            maxRotation: 45,
            minRotation: 0,
            autoSkip: true,
            maxTicksLimit: 8
          },
          grid: { display: false }
        },
        y: { ticks: { color: getComputedStyle(document.body).getPropertyValue('--color-primary').trim() || '#0a3d66' } }
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
      const cellDate = row.insertCell(0);
      const cellValue = row.insertCell(1);
      cellDate.textContent = item.date;
      cellValue.textContent = item.value.toFixed(2);
    });

    const totalPages = Math.ceil(peakHistoryData.length / rowsPerPage) || 1;
    if(pageInfo) pageInfo.textContent = `Página ${currentPage} de ${totalPages}`;
    if(btnPrev) btnPrev.disabled = currentPage === 1;
    if(btnNext) btnNext.disabled = currentPage === totalPages;

    updatePeakChart(pageData);
  }

  function updateLastPeakWidget() {
    const loader = document.getElementById('lastPeakLoader');
    const content = document.getElementById('lastPeakContent');
    
    if (peakHistoryData.length > 0) {
      const latest = peakHistoryData[0];
      const valEl = document.getElementById('lastPeakValue');
      const dateEl = document.getElementById('lastPeakDate');
      if(valEl) valEl.innerHTML = `${latest.value.toFixed(2)} <span class="sts-unit">Amp</span>`;
      if(dateEl) dateEl.textContent = latest.date;
    }
    if(loader) loader.style.display = 'none';
    if(content) content.style.display = 'block';
  }

  function updatePeakChart(dataToRender) {
    const reversedData = [...(dataToRender || [])].reverse();
    peakChart.data.labels = reversedData.map(d => d.date);
    peakChart.data.datasets[0].data = reversedData.map(d => d.value);
    peakChart.update();
  }

  function updateHistoryDateRange() {
    const dateRangeEl = document.getElementById('historyDateRange');
    if (peakHistoryData.length > 1) {
      const newestDate = peakHistoryData[0].date;
      const oldestDate = peakHistoryData[peakHistoryData.length - 1].date;
      
      const fDate = document.getElementById('firstDate');
      const lDate = document.getElementById('lastDate');
      if(fDate) fDate.textContent = oldestDate;
      if(lDate) lDate.textContent = newestDate;
      if(dateRangeEl) dateRangeEl.style.display = 'block';
    } else {
      if(dateRangeEl) dateRangeEl.style.display = 'none';
    }
  }

  function addPeakToHistory(value, datetime) {
    const newItem = { date: datetime, value: value };
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
    updateHistoryDateRange();
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
  let kwhData = [];
  let currentKwhPage = 1;
  let kwhRowsPerPage = 3;

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
      const totalPages = Math.ceil(kwhData.length / kwhRowsPerPage) || 1;
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
    const pageData = kwhData.slice(start, end);

    pageData.forEach(item => {
      const row = tbody.insertRow();
      const lecturaHtml = item.hora ? `<span style="font-size:0.85em; color:#666; display:block;">Lectura: ${item.hora}</span>` : '<span style="font-size:0.85em; color:#aaa; display:block; font-style:italic;">Sin datos</span>';
      row.innerHTML = `<td>${item.fechaTurno} ${lecturaHtml}</td><td>${item.turno || '-'}</td><td><strong>${item.energiaStr} ${item.isPlaceholder ? '' : 'kWh'}</strong></td>`;
    });
    
    updateKwhChart(pageData);
    
    const dailyTotal = pageData.reduce((sum, item) => sum + (item.consumo || 0), 0);
    const totalLabel = document.getElementById('dailyTotalLabel');
    const totalValue = document.getElementById('dailyTotalValue');
    const totalDisplay = document.getElementById('dailyTotalDisplay');
    
    if(totalLabel) totalLabel.textContent = `Consumo Total Día (${pageData[0]?.fechaTurno || '--'})`;
    if(totalValue) totalValue.textContent = `${dailyTotal.toFixed(2)} kWh`;
    if(totalDisplay) totalDisplay.style.display = 'block';

    const totalPages = Math.ceil(kwhData.length / kwhRowsPerPage) || 1;
    const pageKwhInfo = document.getElementById('pageKwhInfo');
    if(pageKwhInfo) pageKwhInfo.textContent = `Página ${currentKwhPage} de ${totalPages}`;
    if(btnKwhPrev) btnKwhPrev.disabled = currentKwhPage === 1;
    if(btnKwhNext) btnKwhNext.disabled = currentKwhPage >= totalPages;
  }

  function updateKwhChart(items) {
    if (kwhChartInstance) kwhChartInstance.destroy();
    
    const chartData = [...items].sort((a, b) => a.shiftSortKey - b.shiftSortKey);
    
    const labels = chartData.map(i => i.turno || i.fecha);
    const data = chartData.map(i => i.consumo || 0);
    
    const borderColors = chartData.map(i => {
      const t = (i.turno || '').toLowerCase();
      if(t.includes('turno 1') || t.includes('turno_1')) return '#ffc72c';
      if(t.includes('turno 2') || t.includes('turno_2')) return '#0a72c1';
      if(t.includes('turno 3') || t.includes('turno_3')) return '#28a745';
      return '#666';
    });

    const ctxModal = document.getElementById('kwhShiftChart').getContext('2d');
    
    const gradT1 = ctxModal.createLinearGradient(0, 0, 0, 400);
    gradT1.addColorStop(0, 'rgba(255, 199, 44, 0.8)');
    gradT1.addColorStop(1, 'rgba(255, 199, 44, 0.1)');

    const gradT2 = ctxModal.createLinearGradient(0, 0, 0, 400);
    gradT2.addColorStop(0, 'rgba(10, 114, 193, 0.8)');
    gradT2.addColorStop(1, 'rgba(10, 114, 193, 0.1)');

    const gradT3 = ctxModal.createLinearGradient(0, 0, 0, 400);
    gradT3.addColorStop(0, 'rgba(40, 167, 69, 0.8)');
    gradT3.addColorStop(1, 'rgba(40, 167, 69, 0.1)');

    const gradDef = ctxModal.createLinearGradient(0, 0, 0, 400);
    gradDef.addColorStop(0, 'rgba(100, 100, 100, 0.8)');
    gradDef.addColorStop(1, 'rgba(100, 100, 100, 0.1)');

    kwhChartInstance = new Chart(ctxModal, {
      type: 'bar',
      data: {
        labels: labels,
        datasets: [{
          label: 'Consumo del Turno (kWh)',
          data: data,
          backgroundColor: chartData.map(i => {
            const t = (i.turno || '').toLowerCase();
            if(t.includes('turno 1') || t.includes('turno_1')) return gradT1;
            if(t.includes('turno 2') || t.includes('turno_2')) return gradT2;
            if(t.includes('turno 3') || t.includes('turno_3')) return gradT3;
            return gradDef;
          }),
          borderColor: borderColors,
          borderWidth: 1
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: { display: false },
          title: { display: true, text: 'Consumo por Turno (Visualizado)' }
        },
        scales: { y: { beginAtZero: true, title: { display: true, text: 'kWh' } } }
      }
    });
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
    
    if(modal) modal.style.display = "block";
    title.innerHTML = `<span>📊</span> Historial KWH - STS ${stsId}`;
    
    const input = document.getElementById('kwhDateInput');
    const now = new Date();
    input.value = new Date(now.getTime() - (now.getTimezoneOffset() * 60000)).toISOString().split('T')[0];
    
    kwhData = [];
    currentKwhPage = 1;
    renderKwhTable();

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
    
    if (event.target == document.getElementById('slowDownModal')) closeSlowDownModal();
  }

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
          client.publish('CONSULTA_PEAKS', 'req');
          const histInd = document.getElementById('historyIndicator');
          if(histInd) {
            histInd.textContent = "🗂️ Historial: Solicitando...";
            histInd.style.color = "#fd7e14";
          }
          const mainLoader = document.getElementById('mainTableLoader');
          if(mainLoader) mainLoader.style.display = 'block';
          client.publish('CONSULTA_SLOWSTS', 'req');
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
        if(loader1) loader1.style.display = 'none';
        if(content1) content1.style.display = 'block';

        cgeCurrentAmp = value;
        const modalAmp = document.getElementById('val_CGE_AMP');
        if (modalAmp) modalAmp.innerHTML = `${value.toFixed(2)} <span class="sts-unit">Amp</span>`;

        if(value > 120) {
          if (!alertActive) {
            alertActive = true;
            showVisualAlert(value); 
            addPeakToHistory(value, fullDate);
            const payload = JSON.stringify({ date: fullDate, value: value });
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
        myChart.update();
      }
    }
    if (topic === 'I_MAX_GRUAS') {
      const value = parseFloat(message.toString());
      if (!isNaN(value)) {
        const topic2El = document.getElementById('topic2');
        const loader2 = document.getElementById('topic2Loader');
        const content2 = document.getElementById('topic2Content');

        if(topic2El) topic2El.innerHTML = `${value.toFixed(2)} <span class="sts-unit">Amp</span>`;
        if(loader2) loader2.style.display = 'none';
        if(content2) content2.style.display = 'block';

        const lastDataIndex = data.datasets[1].data.length - 1;
        if (lastDataIndex >= 0) {
          data.datasets[1].data[lastDataIndex] = value;
        }
        const chartLoader = document.getElementById('myChartLoader');
        if(chartLoader) chartLoader.style.display = 'none';
        myChart.update();
      }
    }
    
    const stsMatch = topic.match(/^(I_STS|SLOWSTS|valor_actual_kwh_sts)(\d+)$/);
    if (stsMatch) {
      const type = stsMatch[1];
      const id = parseInt(stsMatch[2], 10);
      const valueStr = message.toString();

      if (type === 'I_STS') {
        const value = parseFloat(valueStr);
        if (!isNaN(value)) {
          const topicNum = id + 2;
          const el = document.getElementById(`topic${topicNum}`);
          if(el) el.innerHTML = `${value.toFixed(2)} <span class="sts-unit">Amp</span>`;
          
          const loader = document.getElementById(`topic${topicNum}Loader`);
          if(loader) loader.style.display = 'none';
          
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
            const cardEl = document.getElementById('card_ACTIVE_TOTAL');
            if (descEl && cardEl) {
                if (val < 0) {
                    descEl.innerHTML = '♻️ REGENERANDO ENERGÍA';
                    descEl.style.color = '#fff'; 
                    descEl.style.fontWeight = 'bold';
                    descEl.style.fontSize = '0.9rem';
                    cardEl.classList.add('regenerating-mode');
                } else {
                    descEl.innerHTML = '🔌 Consumiendo de Red';
                    descEl.style.color = 'rgba(255,255,255,0.9)';
                    descEl.style.fontWeight = 'normal';
                    descEl.style.fontSize = '0.75rem';
                    cardEl.classList.remove('regenerating-mode');
                }
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

    if ((topic.startsWith('KWH_STS') && topic.endsWith('_archivo_KWH')) || topic.startsWith('respuesta_hist_kwh_STS')) {
      const status = document.getElementById('modalStatus');
      const loader = document.getElementById('modalLoader');
      const rawData = message.toString();
      
      const match = topic.match(/STS(\d+)/);

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
                    
                    document.querySelector('#kwhHistoryTable tbody').innerHTML = '';
                    document.getElementById('dailyTotalDisplay').style.display = 'none';
                    
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

        const lines = csvContent.split(/\r?\n/).filter(line => line.trim() !== '');
        const parsedItems = [];
        
        lines.forEach(line => {
          const parts = line.split(',');
          if (parts.length >= 3) {
            let ts = 0;
            try {
              const dStr = parts[0].trim();
              const tStr = parts[1].trim();
              const dParts = dStr.split(/[-/]/);
              if (dParts.length === 3) {
                let cleanTime = tStr.toLowerCase().replace(/\./g, '').replace(/\s/g, '');
                let matchTime = cleanTime.match(/^(\d{1,2}):(\d{1,2}):?(\d{1,2})?/);
                if (matchTime) {
                  let h = parseInt(matchTime[1], 10);
                  if (cleanTime.includes('pm') && h !== 12) h += 12;
                  if (cleanTime.includes('am') && h === 12) h = 0;
                  ts = new Date(dParts[2], dParts[1]-1, dParts[0], h, parseInt(matchTime[2]), matchTime[3]?parseInt(matchTime[3]):0).getTime();
                }
              }
            } catch(e){}

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

        if (currentStsHistoryId === stsIdFromTopic) {
          try {
            if (parsedItems.length > 0) {
              if(loader) loader.style.display = "none";
              if(status) status.style.display = "none"; 
              
              const minByShift = {};
              parsedItems.forEach(item => {
                if (isNaN(item.energiaVal)) return;
                
                let d;
                const dateParts = item.fecha.split(/[-/]/);
                if (dateParts.length === 3) {
                  d = new Date(dateParts[2], dateParts[1] - 1, dateParts[0]);
                } else {
                  return;
                }

                if (item.turno && (item.turno.toLowerCase().includes("turno 3") || item.turno.toLowerCase().includes("turno_3"))) {
                  const cleanTime = item.hora.toLowerCase().replace(/\./g, '').replace(/\s/g, '');
                  const match = cleanTime.match(/^(\d{1,2}):/);
                  let hour = match ? parseInt(match[1], 10) : -1;

                  if (cleanTime.includes('pm') && hour !== 12) hour += 12;
                  else if (cleanTime.includes('am') && hour === 12) hour = 0;

                  if (hour >= 0 && hour < 8) {
                    d.setDate(d.getDate() - 1);
                  }
                }

                const shiftDay = String(d.getDate()).padStart(2, '0');
                const shiftMonth = String(d.getMonth() + 1).padStart(2, '0');
                const shiftYear = d.getFullYear();
                item.fechaTurno = `${shiftDay}-${shiftMonth}-${shiftYear}`;

                let shiftOrder = 0;
                const tLower = item.turno ? item.turno.toLowerCase() : '';
                if (tLower.includes('turno 1') || tLower.includes('turno_1')) shiftOrder = 1;
                else if (tLower.includes('turno 2') || tLower.includes('turno_2')) shiftOrder = 2;
                else if (tLower.includes('turno 3') || tLower.includes('turno_3')) shiftOrder = 3;
                
                item.shiftSortKey = d.getTime() + (shiftOrder * 3600000);

                const turnoKey = item.turno ? item.turno.toLowerCase().replace(/\s/g, '') : 'sin_turno';
                const key = `${item.fechaTurno}_${turnoKey}`;
                
                if (!minByShift[key] || item.energiaVal < minByShift[key].energiaVal) {
                  minByShift[key] = item;
                }
              });

              const winners = new Set(Object.values(minByShift));
              const itemsToShow = parsedItems.filter(item => winners.has(item));
              
              itemsToShow.sort((a, b) => b.shiftSortKey - a.shiftSortKey);

              const sortedAsc = [...itemsToShow].sort((a, b) => a.shiftSortKey - b.shiftSortKey);
              for (let i = 0; i < sortedAsc.length - 1; i++) {
                const diff = sortedAsc[i+1].energiaVal - sortedAsc[i].energiaVal;
                sortedAsc[i].consumo = diff >= 0 ? diff : 0;
              }
              if(sortedAsc.length > 0) sortedAsc[sortedAsc.length-1].consumo = 0;

              const byDate = {};
              itemsToShow.forEach(item => {
                if (!byDate[item.fechaTurno]) byDate[item.fechaTurno] = [];
                byDate[item.fechaTurno].push(item);
              });

              const finalDisplayList = [];
              const uniqueDates = Object.keys(byDate).sort((a, b) => {
                 const pa = a.split('-'); const pb = b.split('-');
                 return new Date(pb[2], pb[1]-1, pb[0]) - new Date(pa[2], pa[1]-1, pa[0]);
              });

              if (uniqueDates.length > 0) {
                 const dateStr = uniqueDates[0];
                 const dayItems = byDate[dateStr];
                 
                 const t1 = dayItems.find(i => i.turno.toLowerCase().includes('turno 1') || i.turno.toLowerCase().includes('turno_1'));
                 const t2 = dayItems.find(i => i.turno.toLowerCase().includes('turno 2') || i.turno.toLowerCase().includes('turno_2'));
                 const t3 = dayItems.find(i => i.turno.toLowerCase().includes('turno 3') || i.turno.toLowerCase().includes('turno_3'));

                 if (t1) t1.turno = 'Turno 1 (08:00-15:30)';
                 if (t2) t2.turno = 'Turno 2 (15:30-23:00)';
                 if (t3) t3.turno = 'Turno 3 (23:00-06:30)';

                 const getPlaceholder = (name, order) => {
                    const parts = dateStr.split('-');
                    const d = new Date(parts[2], parts[1]-1, parts[0]);
                    return {
                      fecha: dateStr,
                      hora: '',
                      fechaTurno: dateStr,
                      turno: name,
                      energiaStr: '---',
                      energiaVal: 0,
                      consumo: 0,
                      shiftSortKey: d.getTime() + (order * 3600000),
                      isPlaceholder: true
                    };
                 };

                 finalDisplayList.push(t3 || getPlaceholder('Turno 3 (23:00-06:30)', 3));
                 finalDisplayList.push(t2 || getPlaceholder('Turno 2 (15:30-23:00)', 2));
                 finalDisplayList.push(t1 || getPlaceholder('Turno 1 (08:00-15:30)', 1));
              }

              kwhData = finalDisplayList;
              currentKwhPage = 1;
              renderKwhTable();

              if (itemsToShow.length === 0) {
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
        if (value >= 25) {
          cell.style.backgroundColor = '#dc3545';
          cell.style.color = '#fff';
        } else if (value >= 20) {
          cell.style.backgroundColor = '#fd7e14';
          cell.style.color = '#fff';
        } else if (value >= 18) {
          cell.style.backgroundColor = '#ffc107';
          cell.style.color = '#333';
        } else {
          cell.style.backgroundColor = '#28a745';
          cell.style.color = '#fff';
        }
      }
    }

    if (topic === 'HISTORIAL_PEAKS') {
      try {
        const historyData = JSON.parse(message.toString());
        
        if (Array.isArray(historyData)) {
          let processedData = historyData;
          
          if (processedData.length > 0 && processedData[0].col1) {
             processedData = processedData.map(d => ({
                 date: `${d.col1} ${d.col2}`,
                 value: parseFloat(d.col3)
             }));
          }

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
              ind.textContent = `🗂️ Historial: Cargado (${peakHistoryData.length} reg.)`;
              ind.style.color = "#28a745"; 
            }
            const mainLoader = document.getElementById('mainTableLoader');
            const peakLoader = document.getElementById('peakChartLoader');
            if(mainLoader) mainLoader.style.display = 'none';
            if(peakLoader) peakLoader.style.display = 'none';
            updateLastPeakWidget();
            
            setTimeout(() => {
               if (currentPage === 1) {
                   const pageData = peakHistoryData.slice(0, rowsPerPage);
                   updatePeakChart(pageData);
               }
               updateHistoryDateRange();
            }, 50);
          });
        } 
        else if (historyData.col1 && historyData.col2 && historyData.col3) {
          const fullDate = `${historyData.col1} ${historyData.col2}`;
          const value = parseFloat(historyData.col3);
          
          const isDuplicate = peakHistoryData.some(item => item.date === fullDate && Math.abs(item.value - value) < 0.01);
          if (isDuplicate) {
            const mainLoader = document.getElementById('mainTableLoader');
            if(mainLoader) mainLoader.style.display = 'none';
            return;
          }

          peakHistoryData.unshift({ date: fullDate, value: value });
          
          const ind = document.getElementById('historyIndicator');
          if(ind) {
             ind.textContent = `🗂️ Historial: Recibiendo (${peakHistoryData.length})`;
             ind.style.color = "#fd7e14";
          }

          clearTimeout(renderTimeout);
          renderTimeout = setTimeout(() => {
              if (currentPage === 1) renderTable();
              updateLastPeakWidget();
              updateHistoryDateRange();
              if(ind) { ind.textContent = `🗂️ Historial: Cargado (${peakHistoryData.length} reg.)`; ind.style.color = "#28a745"; }
              const mainLoader = document.getElementById('mainTableLoader');
              const peakLoader = document.getElementById('peakChartLoader');
              if(mainLoader) mainLoader.style.display = 'none';
              if(peakLoader) peakLoader.style.display = 'none';
          }, 200);
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
        const json = JSON.parse(rawData);
        
        if (json.contenido_csv) {
            const lines = json.contenido_csv.split(/\r?\n/);
            lines.forEach(line => {
                if (!line.trim()) return;
                const parts = line.split(',');
                if (parts.length >= 4) {
                    labels.push(parts[0].trim());
                    const timestamp = parts[0].trim();
                    const type = parts[2].trim();
                    const valStr = parts[3].trim().toUpperCase();
                    const event = parts.length > 4 ? parts[4].trim() : '';
                    const isTrue = (valStr === 'VERDADERO' || valStr === 'TRUE');

                    labels.push(timestamp);
                    values.push(valStr === 'VERDADERO' ? 1 : 0);
                    values.push(isTrue ? 1 : 0);

                    let durationStr = '';
                    const currentMs = new Date(timestamp).getTime();
                    
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
                        row.innerHTML = `<td>${timestamp}</td><td>${type}</td><td>${valStr}</td><td>${event}</td><td style="font-weight:bold;">${durationStr}</td>`;
                    }
                }
            });
        } 
        else if (Array.isArray(json)) {
          json.forEach(item => {
            labels.push(item.hora || item.time || item.fecha);
            values.push(item.valor || item.value || item.status);
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
});