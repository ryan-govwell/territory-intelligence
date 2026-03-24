// ─────────────────────────────────────────────
//  Helpers
// ─────────────────────────────────────────────
function convColor(v) {
  if (v >= 60) return { bg: '#E1F5EE', color: '#0F6E56' };
  if (v >= 45) return { bg: '#E6F1FB', color: '#185FA5' };
  if (v >= 30) return { bg: '#FAEEDA', color: '#854F0B' };
  return { bg: '#FCEBEB', color: '#A32D2D' };
}

function ptFill(p) {
  if (p === 0)  return '#E1F5EE';
  if (p < 5)   return '#9FE1CB';
  if (p < 10)  return '#1D9E75';
  return '#085041';
}

function initials(name) {
  return name.split(' ').map(w => w[0]).join('');
}

function monthLabel(m) {
  const [y, mo] = m.split('-');
  const names = ['', 'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  return names[parseInt(mo)] + ' ' + y.slice(2);
}

function shortSourceName(s) {
  return s
    .replace('Abandoned Pipeline Followup', 'Pipeline followup')
    .replace('Customer Referral', 'Cust referral')
    .replace('Prospect Referral', 'Prosp referral');
}

// ─────────────────────────────────────────────
//  State
// ─────────────────────────────────────────────
let currentChart = null;
let usTopoCache  = null;

// ─────────────────────────────────────────────
//  Nav
// ─────────────────────────────────────────────
function buildNav() {
  const nav = document.getElementById('rep-nav');
  Object.keys(REPS).forEach(name => {
    const r   = REPS[name];
    const btn = document.createElement('button');
    btn.className  = 'rep-btn';
    btn.dataset.rep = name;
    btn.innerHTML  = `<span class="dot"></span>${name.split(' ')[0]}<span class="badge">${r.sqo_pts.toFixed(1)} pts</span>`;
    btn.addEventListener('click', () => selectRep(name));
    nav.appendChild(btn);
  });
}

function selectRep(name) {
  document.querySelectorAll('.rep-btn').forEach(b => b.classList.toggle('active', b.dataset.rep === name));
  if (currentChart) { currentChart.destroy(); currentChart = null; }
  renderRep(REPS[name]);
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

// ─────────────────────────────────────────────
//  Rep page renderer
// ─────────────────────────────────────────────
function renderRep(r) {
  const isNew = NEW_HIRES.includes(r.name);
  const av    = AVATAR_COLORS[r.name] || { bg: '#eee', color: '#333' };
  const cc    = CHART_COLORS[r.name]  || '#1D9E75';
  const cv    = convColor(r.pts_conv);

  // Tier pts aggregation
  let t1 = 0, t2 = 0, t3 = 0;
  Object.entries(r.tier_pts).forEach(([k, v]) => {
    if (k.startsWith('Tier 1'))      t1 += v;
    else if (k.startsWith('Tier 2')) t2 += v;
    else                             t3 += v;
  });
  const tierTotal = t1 + t2 + t3;
  const t1p = (t1 / tierTotal * 100).toFixed(0);
  const t2p = (t2 / tierTotal * 100).toFixed(0);
  const t3p = (t3 / tierTotal * 100).toFixed(0);

  // Outcomes
  const outcomeOrder  = ['SQO', 'Further Disco Required', 'Pending', 'Rescheduling', 'Cancellation', 'No Show', 'Disqualified'];
  const outcomeColors = {
    'SQO':                    '#1D9E75',
    'Further Disco Required': '#7F77DD',
    'Pending':                '#378ADD',
    'Rescheduling':           '#5DCAA5',
    'Cancellation':           '#BA7517',
    'No Show':                '#E24B4A',
    'Disqualified':           '#888780',
  };
  const totalMtgs = Object.values(r.outcomes).reduce((s, v) => s + v, 0);

  const html = `
    ${isNew ? `<div class="context-note">New hire — ${r.active_months} months of data. Interpret metrics with caution; ramp period metrics are volatile.</div>` : ''}
    <div class="rep-header">
      <div class="avatar" style="background:${av.bg};color:${av.color}">${initials(r.name)}</div>
      <div class="rep-meta">
        <h2>${r.name}${isNew ? '<span class="new-badge">new hire</span>' : ''}</h2>
        <p>BDM &nbsp;·&nbsp; Active since ${r.start} &nbsp;·&nbsp; ${r.active_months} months</p>
      </div>
    </div>

    <div class="kpi-row">
      <div class="kpi">
        <div class="kpi-label">Meetings</div>
        <div class="kpi-value">${r.meetings}</div>
        <div class="kpi-sub">${r.meetings_per_mo}/mo</div>
      </div>
      <div class="kpi">
        <div class="kpi-label">Total pts booked</div>
        <div class="kpi-value">${r.total_pts.toFixed(1)}</div>
        <div class="kpi-sub">${r.total_pts_per_mo}/mo</div>
      </div>
      <div class="kpi">
        <div class="kpi-label">SQO pts</div>
        <div class="kpi-value">${r.sqo_pts.toFixed(1)}</div>
        <div class="kpi-sub">${r.sqo_pts_per_mo}/mo</div>
      </div>
      <div class="kpi">
        <div class="kpi-label">Pts conversion</div>
        <div class="kpi-value ${r.pts_conv >= 50 ? 'good' : r.pts_conv >= 35 ? 'warn' : 'bad'}">${r.pts_conv}%</div>
        <div class="kpi-sub">team avg 47.1%</div>
      </div>
      <div class="kpi">
        <div class="kpi-label">States worked</div>
        <div class="kpi-value">${r.states.length}</div>
        <div class="kpi-sub">${r.meetings_per_mo} mtgs/mo</div>
      </div>
    </div>

    <div class="row-2">
      <div class="card">
        <div class="card-title">Territory map — SQO pts by state</div>
        <div id="map-container"></div>
        <div class="map-legend">
          <span><span class="map-swatch" style="background:#E1F5EE;border:1px solid #9FE1CB"></span>0 pts</span>
          <span><span class="map-swatch" style="background:#9FE1CB"></span>0.1–4.9</span>
          <span><span class="map-swatch" style="background:#1D9E75"></span>5–9.9</span>
          <span><span class="map-swatch" style="background:#085041"></span>10+</span>
        </div>
      </div>
      <div>
        <div class="card" style="margin-bottom:14px">
          <div class="card-title">Outcome mix</div>
          <div class="outcome-bar">
            ${outcomeOrder
              .filter(k => r.outcomes[k])
              .map(k => `<div style="width:${(r.outcomes[k] / totalMtgs * 100).toFixed(1)}%;background:${outcomeColors[k]}" title="${k}: ${r.outcomes[k]}"></div>`)
              .join('')}
          </div>
          <div class="outcome-legend">
            ${outcomeOrder
              .filter(k => r.outcomes[k])
              .map(k => `<span><span class="tier-swatch" style="background:${outcomeColors[k]}"></span>${k} ${r.outcomes[k]}</span>`)
              .join('')}
          </div>
        </div>
        <div class="card">
          <div class="card-title">Account tier mix — pts booked</div>
          <div class="tier-bar">
            <div class="tier-seg" style="width:${t1p}%;background:#1D9E75"></div>
            <div class="tier-seg" style="width:${t2p}%;background:#9FE1CB"></div>
            <div class="tier-seg" style="width:${t3p}%;background:#E1F5EE;border:1px solid #9FE1CB"></div>
          </div>
          <div class="tier-legend">
            <span><span class="tier-swatch" style="background:#1D9E75"></span>T1 ${t1.toFixed(1)} (${t1p}%)</span>
            <span><span class="tier-swatch" style="background:#9FE1CB"></span>T2 ${t2.toFixed(1)} (${t2p}%)</span>
            <span><span class="tier-swatch" style="background:#E1F5EE;border:1px solid #9FE1CB"></span>T3 ${t3.toFixed(1)} (${t3p}%)</span>
          </div>
        </div>
      </div>
    </div>

    <div class="row-2">
      <div class="card">
        <div class="card-title">State breakdown — sorted by SQO pts</div>
        <table class="data-table">
          <tr><th>State</th><th>Mtgs</th><th>Tot pts</th><th>SQO pts</th><th>Conv</th><th>Disq</th><th>Cxl</th></tr>
          ${r.states.slice(0, 12).map(s => {
            const c = convColor(s.conv);
            return `<tr>
              <td>${s.state}</td>
              <td>${s.meetings}</td>
              <td>${s.total_pts.toFixed(1)}</td>
              <td><strong>${s.sqo_pts.toFixed(2)}</strong></td>
              <td><span class="pill" style="background:${c.bg};color:${c.color}">${s.conv}%</span></td>
              <td>${s.disq}</td>
              <td>${s.cancel}</td>
            </tr>`;
          }).join('')}
        </table>
      </div>
      <div class="card">
        <div class="card-title">Source — SQO pts &amp; pts conversion</div>
        ${r.sources.map(s => {
          const maxPts   = Math.max(...r.sources.map(x => x.sqo_pts));
          const pct      = maxPts > 0 ? (s.sqo_pts / maxPts * 100).toFixed(0) : 0;
          const fillColor = s.conv >= 55 ? '#1D9E75' : s.conv >= 35 ? '#9FE1CB' : '#E24B4A';
          return `<div class="src-row">
            <div class="src-name">${shortSourceName(s.source)}</div>
            <div class="src-track">
              <div class="src-fill" style="width:${Math.max(pct, 2)}%;background:${fillColor}"></div>
              <span class="src-val">${s.sqo_pts.toFixed(1)} pts · ${s.conv}%</span>
            </div>
          </div>`;
        }).join('')}
      </div>
    </div>

    <div class="card full">
      <div class="card-title">Monthly pts booked vs. SQO pts &amp; conversion rate</div>
      <div class="chart-wrap" style="height:200px"><canvas id="trend-chart"></canvas></div>
      <div style="display:flex;gap:16px;margin-top:10px;font-size:11px;color:var(--text-2);font-family:'DM Mono',monospace">
        <span style="display:flex;align-items:center;gap:5px">
          <span style="width:10px;height:10px;background:#B5D4F4;border-radius:2px;display:inline-block"></span>Total pts
        </span>
        <span style="display:flex;align-items:center;gap:5px">
          <span style="width:10px;height:10px;background:${cc};border-radius:2px;display:inline-block"></span>SQO pts
        </span>
        <span style="display:flex;align-items:center;gap:5px">
          <span style="width:18px;height:0;border-top:2px dashed #E24B4A;display:inline-block"></span>Conv %
        </span>
      </div>
    </div>
  `;

  document.getElementById('main-content').innerHTML = html;
  renderChart(r, cc);
  renderMap(r);
}

// ─────────────────────────────────────────────
//  Chart
// ─────────────────────────────────────────────
function renderChart(r, cc) {
  currentChart = new Chart(document.getElementById('trend-chart'), {
    type: 'bar',
    data: {
      labels: r.monthly.map(m => monthLabel(m.month)),
      datasets: [
        {
          type: 'bar',
          data: r.monthly.map(m => m.total_pts),
          backgroundColor: '#B5D4F4',
          yAxisID: 'y',
        },
        {
          type: 'bar',
          data: r.monthly.map(m => m.sqo_pts),
          backgroundColor: cc,
          yAxisID: 'y',
        },
        {
          type: 'line',
          data: r.monthly.map(m => m.conv),
          borderColor: '#E24B4A',
          backgroundColor: 'transparent',
          borderWidth: 1.5,
          borderDash: [4, 3],
          pointRadius: 3,
          pointBackgroundColor: '#E24B4A',
          yAxisID: 'y2',
          tension: 0.3,
        },
      ],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: { legend: { display: false } },
      scales: {
        x:  { ticks: { font: { size: 10 }, autoSkip: false, maxRotation: 35 }, grid: { display: false } },
        y:  { ticks: { font: { size: 10 } }, grid: { color: 'rgba(0,0,0,0.05)' }, title: { display: true, text: 'pts', font: { size: 10 } } },
        y2: { position: 'right', min: 0, max: 100, ticks: { font: { size: 10 }, callback: v => v + '%' }, grid: { display: false } },
      },
    },
  });
}

// ─────────────────────────────────────────────
//  Map
// ─────────────────────────────────────────────
function renderMap(r) {
  const sqoByFull   = {};
  const totalByFull = {};
  const mtgsByFull  = {};

  r.states.forEach(s => {
    const full = STATE_ABBR_TO_FULL[s.state];
    if (full) {
      sqoByFull[full]   = s.sqo_pts;
      totalByFull[full] = s.total_pts;
      mtgsByFull[full]  = s.meetings;
    }
  });

  const drawMap = (us) => {
    const container = document.getElementById('map-container');
    if (!container) return;
    container.innerHTML = '';

    const svg  = d3.select('#map-container').append('svg')
      .attr('viewBox', '0 0 900 520').attr('width', '100%').style('display', 'block');
    const path = d3.geoPath(d3.geoAlbersUsa().scale(1100).translate([450, 260]));

    // Reuse tooltip if it already exists in the DOM
    const tip     = d3.select('body').select('.map-tip');
    const tooltip = tip.empty()
      ? d3.select('body').append('div').attr('class', 'map-tip')
          .style('position', 'fixed')
          .style('background', '#fff')
          .style('border', '1px solid rgba(0,0,0,0.12)')
          .style('border-radius', '8px')
          .style('padding', '7px 11px')
          .style('font-size', '12px')
          .style('pointer-events', 'none')
          .style('color', '#1a1a18')
          .style('font-family', 'DM Mono, monospace')
          .style('opacity', 0)
          .style('z-index', 9999)
          .style('box-shadow', '0 2px 8px rgba(0,0,0,0.1)')
      : tip;

    svg.selectAll('path')
      .data(topojson.feature(us, us.objects.states).features)
      .join('path')
      .attr('d', path)
      .attr('stroke', '#fff')
      .attr('stroke-width', 0.6)
      .attr('fill', d => {
        const n = d.properties.name;
        return sqoByFull[n] !== undefined ? ptFill(sqoByFull[n]) : '#ece9e0';
      })
      .on('mousemove', function(event, d) {
        const n = d.properties.name;
        if (sqoByFull[n] !== undefined) {
          const conv = totalByFull[n] > 0 ? (sqoByFull[n] / totalByFull[n] * 100).toFixed(1) : '0';
          tooltip
            .style('opacity', 1)
            .style('left', (event.clientX + 14) + 'px')
            .style('top',  (event.clientY - 30) + 'px')
            .html(`<strong>${n}</strong><br>${mtgsByFull[n]} mtgs · ${sqoByFull[n].toFixed(2)} SQO pts · ${conv}% conv`);
        }
      })
      .on('mouseleave', () => tooltip.style('opacity', 0));
  };

  if (usTopoCache) {
    drawMap(usTopoCache);
  } else {
    d3.json('https://cdn.jsdelivr.net/npm/us-atlas@3/states-10m.json').then(us => {
      usTopoCache = us;
      drawMap(us);
    });
  }
}

// ─────────────────────────────────────────────
//  Header metadata
// ─────────────────────────────────────────────
function setHeaderMeta() {
  const sub  = document.getElementById('report-subtitle');
  const meta = document.getElementById('report-meta');
  if (sub)  sub.textContent  = `BDM Performance Report — Data through ${REPORT_DATE}`;
  if (meta) meta.innerHTML   = `Generated ${REPORT_GENERATED}<br>Points-weighted SQO methodology`;
}

// ─────────────────────────────────────────────
//  Init
// ─────────────────────────────────────────────
setHeaderMeta();
buildNav();
selectRep(Object.keys(REPS)[0]);
