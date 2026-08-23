// 🔗 URL ปลายทางของ Google Apps Script API
const API_URL = 'https://script.google.com/macros/s/AKfycbzdlaGYTOiHgUVhk3_FA_cB3VpuFZA8JCL9ChHzbIrZuY1K0ECJ_8RobOTNnGflziQ/exec';

var map;
var markersGroup;
var bmaMaskLayer = null;
var bmaDistrictsLayer = null;
var bmaCachedGeoJSON = null;

var allDamageData = [];
var rawResolvedData = [];
var currentFilteredTableData = [];
var groupedLocationData = [];
var currentActiveGroup = null;
var currentActiveIndex = 0;

var currentTableTab = 'active';

var formPendingBase64 = null;
var isFormImageRemoved = false;

var currentUser = {
  loggedIn: false,
  role: '',
  dept: '',
  code: ''
};

var isPickingLocationOnMap = false;
var tempPickerMarker = null;
var customConfirmCallback = null;

var categoryChartInstance = null;
var urgencyChartInstance = null;
var deptChartInstance = null;

if (typeof ChartDataLabels !== 'undefined') {
  Chart.register(ChartDataLabels);
}

function handleImageError(img) {
  if (!img) return;
  var currentSrc = img.src || '';
  var imgId = img.getAttribute('data-image-id');

  if (imgId && currentSrc.indexOf('drive.google.com') !== -1) {
    img.src = 'https://lh3.googleusercontent.com/d/' + imgId;
    return;
  }
  
  img.style.display = 'none';
  var fallback = document.getElementById('noImageFallback');
  if (fallback) fallback.style.display = 'flex';
}

function escapeHTML(str) {
  if (str === null || str === undefined) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

var categoryIcons = {
  'สุขา': 'fa-solid fa-restroom',
  'ลานจอดรถ': 'fa-solid fa-square-parking',
  'สนามกีฬา': 'fa-solid fa-futbol',
  'เส้นทางออกกำลังกาย': 'fa-solid fa-person-running',
  'สนามเด็กเล่น': 'fa-solid fa-shapes',
  'เครื่องออกกำลังกายกลางแจ้ง': 'fa-solid fa-dumbbell'
};
var defaultCategoryIcon = 'fa-solid fa-triangle-exclamation';

var categoryBaseColors = {
  'สุขา': { bg: '#93c5fd', text: '#1e3a8a' },
  'ลานจอดรถ': { bg: '#7dd3fc', text: '#0369a1' },
  'สนามกีฬา': { bg: '#86efac', text: '#14532d' },
  'เส้นทางออกกำลังกาย': { bg: '#cbd5e1', text: '#1e293b' },
  'สนามเด็กเล่น': { bg: '#f9a8d4', text: '#831843' },
  'เครื่องออกกำลังกายกลางแจ้ง': { bg: '#fde047', text: '#713f12' }
};
var defaultBaseColor = { bg: '#6ee7b7', text: '#064e3b' };

var urgencyRedPalette = {
  5: { bg: '#7f1d1d', text: '#ffffff' },
  4: { bg: '#b91c1c', text: '#ffffff' },
  3: { bg: '#ef4444', text: '#ffffff' },
  2: { bg: '#fca5a5', text: '#7f1d1d' },
  1: { bg: '#fee2e2', text: '#991b1b' }
};

var urgencyThemePalette = {
  5: { bg: '#7f1d1d', text: '#ffffff', border: '#991b1b' },
  4: { bg: '#ea580c', text: '#ffffff', border: '#c2410c' },
  3: { bg: '#eab308', text: '#713f12', border: '#ca8a04' },
  2: { bg: '#16a34a', text: '#ffffff', border: '#15803d' },
  1: { bg: '#94a3b8', text: '#ffffff', border: '#64748b' }
};

var urgencyLabels = {
  5: 'ระดับ 5: อันตรายร้ายแรง (เสี่ยงภัยสูงสุด)',
  4: 'ระดับ 4: อันตรายสูง (กระทบการใช้งานหลัก)',
  3: 'ระดับ 3: เฝ้าระวัง (เริ่มชำรุดเสียหาย)',
  2: 'ระดับ 2: ความเสี่ยงต่ำ (ชำรุดเล็กน้อย)',
  1: 'ระดับ 1: สภาพปกติ / ชำรุดตามอายุงาน'
};

var urgencyDescriptions = {
  5: 'สั่งปิดพื้นที่ใช้งาน / ต้องแก้ไขด่วนที่สุด',
  4: 'เสี่ยงต่ออุบัติเหตุ / งดใช้ชั่วคราว',
  3: 'ควรระมัดระวังในการใช้งาน',
  2: 'ใช้งานได้ตามปกติ',
  1: 'ไม่ส่งผลต่อการใช้งาน'
};

function getUrgencyColor(urgency) {
  var u = parseInt(urgency, 10) || 1;
  return urgencyThemePalette[u] || urgencyThemePalette[1];
}

function getCategoryColor(category) {
  return categoryBaseColors[category] || defaultBaseColor;
}

function showToast(message, type) {
  type = type || 'info';
  var container = document.getElementById('toastContainer');
  if (!container) return;

  var toast = document.createElement('div');
  toast.className = 'toast toast-' + type;

  var icon = '<i class="fa-solid fa-circle-info"></i>';
  if (type === 'success') icon = '<i class="fa-solid fa-circle-check"></i>';
  if (type === 'error') icon = '<i class="fa-solid fa-circle-xmark"></i>';

  toast.innerHTML = icon + '<span>' + escapeHTML(message) + '</span>';
  container.appendChild(toast);

  setTimeout(function() {
    toast.style.opacity = '0';
    toast.style.transform = 'translateX(30px)';
    setTimeout(function() { toast.remove(); }, 300);
  }, 3500);
}

function showCustomConfirm(options) {
  var title = options.title || 'ยืนยันการทำรายการ';
  var messageHtml = options.message || '';
  var okText = options.okText || 'ยืนยัน';

  customConfirmCallback = options.onConfirm || null;

  document.getElementById('confirmTitle').innerText = title;
  document.getElementById('confirmMessage').innerHTML = messageHtml;
  document.getElementById('btnConfirmOk').innerHTML = '<i class="fa-solid fa-check"></i> ' + escapeHTML(okText);

  document.getElementById('confirmModal').style.display = 'flex';
}

function closeConfirmModal() {
  document.getElementById('confirmModal').style.display = 'none';
  customConfirmCallback = null;
}

function toggleMobileMenu() {
  var menu = document.getElementById('headerActions');
  if (menu) menu.classList.toggle('is-open');
}

document.addEventListener('DOMContentLoaded', function() {
  initMap();
  handleBMAMaskOverlay(true);
  updateStatsBadgeColors();
  loadReports();

  // 🌟 บังคับให้ Leaflet คำนวณขนาดหน้าจอใหม่อีกครั้งหลังจาก DOM และ CSS เรนเดอร์เสร็จ
  setTimeout(function() {
    if (map) {
      map.invalidateSize();
      resetMapToDefaultView();
    }
  }, 300);

  var btnConfirmOk = document.getElementById('btnConfirmOk');
  if (btnConfirmOk) {
    btnConfirmOk.addEventListener('click', function() {
      if (typeof customConfirmCallback === 'function') {
        var cb = customConfirmCallback;
        closeConfirmModal();
        cb();
      } else {
        closeConfirmModal();
      }
    });
  }

  document.addEventListener('keydown', function(e) {
    var modal = document.getElementById('detailModal');
    if (modal && modal.style.display === 'flex') {
      if (e.key === 'ArrowLeft') prevReportItem();
      if (e.key === 'ArrowRight') nextReportItem();
      if (e.key === 'Escape') closeModal('detailModal');
    }
  });

  window.addEventListener('resize', function() {
    if (map) map.invalidateSize();
  });
});

function initMap() {
  var streetLayer = L.tileLayer('https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png', {
    attribution: '&copy; OpenStreetMap &copy; CARTO',
    subdomains: 'abcd',
    maxZoom: 19
  });

  var satelliteBase = L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{x}/{y}', {
    attribution: '&copy; Esri &mdash; Maxar, Earthstar Geographics',
    maxZoom: 19
  });

  var cleanLabels = L.tileLayer('https://{s}.basemaps.cartocdn.com/rastertiles/voyager_only_labels/{z}/{x}/{y}{r}.png', {
    subdomains: 'abcd',
    maxZoom: 19,
    pane: 'shadowPane'
  });

  var cleanSatelliteGroup = L.layerGroup([satelliteBase, cleanLabels]);

  map = L.map('map', {
    center: [13.7563, 100.5018],
    zoom: 11.5,
    minZoom: 9.5,
    maxZoom: 19,
    zoomSnap: 0.1,
    zoomDelta: 0.5,
    zoomControl: false,
    layers: [streetLayer]
  });

  L.control.zoom({ position: 'topleft' }).addTo(map);

  var baseMaps = {
    "🗺️ แผนที่ถนน": streetLayer,
    "🛰️ ภาพถ่ายดาวเทียม": cleanSatelliteGroup
  };
  L.control.layers(baseMaps, null, { position: 'topright' }).addTo(map);

  markersGroup = L.layerGroup().addTo(map);

  map.on('click', function(e) {
    if (isPickingLocationOnMap) {
      completeMapPinPick(e.latlng.lat, e.latlng.lng);
    }
  });
}

function getActiveFilters() {
  return {
    category: document.getElementById('categoryFilter') ? document.getElementById('categoryFilter').value : 'all',
    department: document.getElementById('departmentFilter') ? document.getElementById('departmentFilter').value : 'all',
    park: document.getElementById('parkFilter') ? document.getElementById('parkFilter').value : 'all',
    urgency: document.getElementById('urgencyFilter') ? document.getElementById('urgencyFilter').value : 'all'
  };
}

function updateParkDropdownOptions(selectedDept) {
  var parkSelect = document.getElementById('parkFilter');
  if (!parkSelect) return;

  var currentPark = parkSelect.value;
  var parkSet = {};

  var combinedData = allDamageData.concat(rawResolvedData || []);
  combinedData.forEach(function(item) {
    if (item.parkName && item.parkName !== '-' && item.parkName.trim() !== '') {
      if (selectedDept === 'all' || item.department === selectedDept) {
        parkSet[item.parkName.trim()] = true;
      }
    }
  });

  var parkList = Object.keys(parkSet).sort();
  var html = '<option value="all">🌳 ทุกสวน</option>';
  parkList.forEach(function(park) {
    html += '<option value="' + escapeHTML(park) + '">' + escapeHTML(park) + '</option>';
  });

  parkSelect.innerHTML = html;
  parkSelect.value = parkSet[currentPark] ? currentPark : 'all';
}

function onDepartmentFilterChange() {
  var deptFilter = document.getElementById('departmentFilter');
  var selectedDept = deptFilter ? deptFilter.value : 'all';
  updateParkDropdownOptions(selectedDept);
  filterMarkers();
}

function openTableModal() {
  var searchInput = document.getElementById('tableSearchInput');
  if (searchInput) searchInput.value = '';
  renderTableWithCurrentFilters();
  document.getElementById('tableModal').style.display = 'flex';
}

function switchTableTab(tab) {
  currentTableTab = tab;
  var btnActive = document.getElementById('tabBtnActive');
  var btnResolved = document.getElementById('tabBtnResolved');
  var searchInput = document.getElementById('tableSearchInput');

  if (searchInput) searchInput.value = '';

  if (tab === 'active') {
    btnActive.classList.add('active');
    btnResolved.classList.remove('active');
  } else {
    btnActive.classList.remove('active');
    btnResolved.classList.add('active');
  }
  renderTableWithCurrentFilters();
}

function renderTableWithCurrentFilters() {
  var filters = getActiveFilters();
  updateTableFilterInfo(filters);

  var filteredActive = allDamageData;
  if (filters.department !== 'all') filteredActive = filteredActive.filter(d => d.department === filters.department);
  if (filters.park !== 'all') filteredActive = filteredActive.filter(d => d.parkName === filters.park);
  if (filters.category !== 'all') filteredActive = filteredActive.filter(d => d.category === filters.category);
  if (filters.urgency !== 'all') filteredActive = filteredActive.filter(d => d.urgency === parseInt(filters.urgency, 10));
  filteredActive.sort((a, b) => (parseInt(b.urgency, 10) || 1) - (parseInt(a.urgency, 10) || 1));

  var filteredResolved = rawResolvedData;
  if (filters.department !== 'all') filteredResolved = filteredResolved.filter(d => d.department === filters.department);
  if (filters.park !== 'all') filteredResolved = filteredResolved.filter(d => d.parkName === filters.park);
  if (filters.category !== 'all') filteredResolved = filteredResolved.filter(d => d.category === filters.category);
  if (filters.urgency !== 'all') filteredResolved = filteredResolved.filter(d => d.urgency === parseInt(filters.urgency, 10));

  document.getElementById('tabCountActive').innerText = filteredActive.length;
  document.getElementById('tabCountResolved').innerText = filteredResolved.length;

  currentFilteredTableData = (currentTableTab === 'active') ? filteredActive : filteredResolved;
  displayTableRows(currentFilteredTableData);
}

function updateTableFilterInfo(filters) {
  var container = document.getElementById('tableFilterInfo');
  if (!container) return;

  var deptText = filters.department === 'all' ? 'ทุกหน่วยงาน' : filters.department;
  var parkText = filters.park === 'all' ? 'ทุกสวนสาธารณะ' : filters.park;
  var catText = filters.category === 'all' ? 'ทุกหมวดหมู่' : filters.category;
  var urgText = filters.urgency === 'all' ? 'ทุกความเร่งด่วน' : (urgencyLabels[filters.urgency] || ('ระดับ ' + filters.urgency));

  container.innerHTML = '<span class="filter-tag ' + (filters.department !== 'all' ? 'active-tag' : '') + '"><i class="fa-solid fa-building"></i> ' + escapeHTML(deptText) + '</span>' +
                        '<span class="filter-tag ' + (filters.park !== 'all' ? 'active-tag' : '') + '"><i class="fa-solid fa-tree"></i> ' + escapeHTML(parkText) + '</span>' +
                        '<span class="filter-tag ' + (filters.category !== 'all' ? 'active-tag' : '') + '"><i class="fa-solid fa-tag"></i> ' + escapeHTML(catText) + '</span>' +
                        '<span class="filter-tag ' + (filters.urgency !== 'all' ? 'active-tag' : '') + '"><i class="fa-solid fa-gauge-high"></i> ' + escapeHTML(urgText) + '</span>';
}

function displayTableRows(dataList) {
  var thead = document.getElementById('reportDataTableHead');
  var tbody = document.getElementById('reportDataTableBody');
  var badge = document.getElementById('tableCountBadge');
  var summary = document.getElementById('tableFooterSummary');

  if (!tbody || !thead) return;

  var isResolvedTab = (currentTableTab === 'resolved');
  badge.innerText = dataList.length + ' รายการ';
  summary.innerText = isResolvedTab 
    ? 'แสดงประวัติปรับปรุงเสร็จสิ้น ' + dataList.length + ' รายการตามเงื่อนไข'
    : 'แสดงรายการรอปรับปรุง ' + dataList.length + ' รายการตามเงื่อนไข (เรียงตามระดับความเร่งด่วน 5 ➔ 1)';

  if (isResolvedTab) {
    thead.innerHTML = '<tr>' +
                        '<th style="width: 45px; text-align: center;">#</th>' +
                        '<th style="width: 120px;">หน่วยงาน</th>' +
                        '<th style="width: 140px;">สวนสาธารณะ</th>' +
                        '<th style="width: 110px;">บริเวณ</th>' +
                        '<th style="width: 100px;">หมวดหมู่</th>' +
                        '<th style="min-width: 160px;">สิ่งที่ปรับปรุงเสร็จสิ้น</th>' +
                        '<th style="width: 110px; text-align: center;">ความเร่งด่วน</th>' +
                        '<th style="width: 65px; text-align: center;">รูปภาพ</th>' +
                        '<th style="width: 130px;">วันที่เสร็จสิ้น</th>' +
                        '<th style="width: 100px;">ผู้ดำเนินการ</th>' +
                        '<th style="width: 110px;">หมายเหตุ</th>' +
                      '</tr>';
  } else {
    thead.innerHTML = '<tr>' +
                        '<th style="width: 45px; text-align: center;">#</th>' +
                        '<th style="width: 130px;">หน่วยงาน</th>' +
                        '<th style="width: 140px;">สวนสาธารณะ</th>' +
                        '<th style="width: 120px;">บริเวณ</th>' +
                        '<th style="width: 110px;">หมวดหมู่</th>' +
                        '<th style="min-width: 180px;">สิ่งที่ชำรุด / ปัญหา</th>' +
                        '<th style="width: 120px; text-align: center;">ความเร่งด่วน</th>' +
                        '<th style="width: 70px; text-align: center;">รูปภาพ</th>' +
                        '<th style="width: 120px;">หมายเหตุ</th>' +
                        '<th style="width: 85px; text-align: center;">จัดการ</th>' +
                      '</tr>';
  }

  if (dataList.length === 0) {
    var colSpan = isResolvedTab ? 11 : 10;
    tbody.innerHTML = '<tr><td colspan="' + colSpan + '" class="text-center py-4 text-muted"><i class="fa-regular fa-circle-check"></i> ไม่พบข้อมูลในแท็บนี้ตามเงื่อนไขตัวกรอง</td></tr>';
    return;
  }

  var html = '';
  for (var i = 0; i < dataList.length; i++) {
    var item = dataList[i];
    var urgColor = getUrgencyColor(item.urgency);

    var imgHtml = item.imageUrl && item.imageId
      ? '<img src="' + escapeHTML(item.imageUrl) + '" class="table-img-thumb" title="คลิกดูภาพขยาย" onclick="viewDetailFromTable(' + i + ')" onerror="this.style.display=\'none\'">' 
      : '<i class="fa-regular fa-image table-no-img"></i>';

    var urgencyBadgeHtml = '<span class="table-urgency-badge" style="background-color:' + urgColor.bg + '; color:' + urgColor.text + ';">' +
                             escapeHTML(urgencyLabels[item.urgency] || ('ระดับ ' + item.urgency)) +
                           '</span>';

    if (isResolvedTab) {
      html += '<tr>' +
                '<td style="text-align:center; font-weight:600; color:#64748b;">' + (i + 1) + '</td>' +
                '<td>' + escapeHTML(item.department || '-') + '</td>' +
                '<td><b>' + escapeHTML(item.parkName || '-') + '</b></td>' +
                '<td>' + escapeHTML(item.area || '-') + '</td>' +
                '<td><span class="filter-tag">' + escapeHTML(item.category || '-') + '</span></td>' +
                '<td><span style="color:#047857; font-weight:500;">✓ ' + escapeHTML(item.issue || '-') + '</span></td>' +
                '<td style="text-align:center;">' + urgencyBadgeHtml + '</td>' +
                '<td style="text-align:center;">' + imgHtml + '</td>' +
                '<td><small style="color:#475569; font-weight:500;">' + escapeHTML(item.completedDate || '-') + '</small></td>' +
                '<td><span class="filter-tag active-tag">' + escapeHTML(item.operator || '-') + '</span></td>' +
                '<td><small style="color:#64748b;">' + escapeHTML(item.notes !== '-' ? item.notes : '') + '</small></td>' +
              '</tr>';
    } else {
      html += '<tr>' +
                '<td style="text-align:center; font-weight:600; color:#64748b;">' + (i + 1) + '</td>' +
                '<td>' + escapeHTML(item.department || '-') + '</td>' +
                '<td><b>' + escapeHTML(item.parkName || '-') + '</b></td>' +
                '<td>' + escapeHTML(item.area || '-') + '</td>' +
                '<td><span class="filter-tag">' + escapeHTML(item.category || '-') + '</span></td>' +
                '<td><span style="color:#b91c1c; font-weight:500;">' + escapeHTML(item.issue || '-') + '</span></td>' +
                '<td style="text-align:center;">' + urgencyBadgeHtml + '</td>' +
                '<td style="text-align:center;">' + imgHtml + '</td>' +
                '<td><small style="color:#64748b;">' + escapeHTML(item.notes !== '-' ? item.notes : '') + '</small></td>' +
                '<td style="text-align:center;">' +
                  '<button type="button" class="btn-table-view" onclick="viewDetailFromTable(' + i + ')">' +
                    '<i class="fa-solid fa-eye"></i> ดู' +
                  '</button>' +
                '</td>' +
              '</tr>';
    }
  }

  tbody.innerHTML = html;
}

function filterTableSearch() {
  var query = (document.getElementById('tableSearchInput').value || '').trim().toLowerCase();
  if (!query) {
    displayTableRows(currentFilteredTableData);
    return;
  }

  var searchResults = currentFilteredTableData.filter(function(it) {
    var str = (it.parkName + ' ' + it.area + ' ' + it.issue + ' ' + it.department + ' ' + it.category + ' ' + (it.notes || '') + ' ' + (it.operator || '') + ' ' + (it.completedDate || '')).toLowerCase();
    return str.indexOf(query) !== -1;
  });

  displayTableRows(searchResults);
}

function viewDetailFromTable(index) {
  if (!currentFilteredTableData || !currentFilteredTableData[index]) return;
  var targetItem = currentFilteredTableData[index];

  closeModal('tableModal');

  currentActiveGroup = {
    lat: targetItem.lat,
    lng: targetItem.lng,
    maxUrgency: targetItem.urgency,
    items: [targetItem]
  };
  currentActiveIndex = 0;
  displayCurrentReportItem();
  document.getElementById('detailModal').style.display = 'flex';

  if (map) {
    map.setView([targetItem.lat, targetItem.lng], 16, { animate: true });
  }
}

function openDashboardModal() {
  document.getElementById('dashboardModal').style.display = 'flex';
  renderDashboardWithCurrentFilters();
}

function renderDashboardWithCurrentFilters() {
  var filters = getActiveFilters();
  updateDashboardFilterIndicator(filters);

  var filteredActive = allDamageData;
  if (filters.department !== 'all') filteredActive = filteredActive.filter(d => d.department === filters.department);
  if (filters.park !== 'all') filteredActive = filteredActive.filter(d => d.parkName === filters.park);
  if (filters.category !== 'all') filteredActive = filteredActive.filter(d => d.category === filters.category);
  if (filters.urgency !== 'all') filteredActive = filteredActive.filter(d => d.urgency === parseInt(filters.urgency, 10));

  var filteredResolved = rawResolvedData;
  if (filters.department !== 'all') filteredResolved = filteredResolved.filter(d => d.department === filters.department);
  if (filters.park !== 'all') filteredResolved = filteredResolved.filter(d => d.parkName === filters.park);
  if (filters.category !== 'all') filteredResolved = filteredResolved.filter(d => d.category === filters.category);
  if (filters.urgency !== 'all') filteredResolved = filteredResolved.filter(d => d.urgency === parseInt(filters.urgency, 10));

  renderDashboardView(filteredActive, filteredResolved, filters);
}

function updateDashboardFilterIndicator(filters) {
  var container = document.getElementById('dashFilterIndicator');
  if (!container) return;

  var deptText = filters.department === 'all' ? 'ทุกหน่วยงาน' : filters.department;
  var parkText = filters.park === 'all' ? 'ทุกสวนสาธารณะ' : filters.park;
  var catText = filters.category === 'all' ? 'ทุกหมวดหมู่' : filters.category;
  var urgText = filters.urgency === 'all' ? 'ทุกความเร่งด่วน' : (urgencyLabels[filters.urgency] || ('ระดับ ' + filters.urgency));

  container.innerHTML = '<div class="filter-indicator-content">' +
                          '<div class="filter-indicator-title">' +
                            '<i class="fa-solid fa-filter"></i> <span>ข้อมูลสรุปตามตัวกรองปัจจุบัน:</span>' +
                          '</div>' +
                          '<div class="filter-indicator-tags">' +
                            '<span class="filter-tag ' + (filters.department !== 'all' ? 'active-tag' : '') + '"><i class="fa-solid fa-building"></i> ' + escapeHTML(deptText) + '</span>' +
                            '<span class="filter-tag ' + (filters.park !== 'all' ? 'active-tag' : '') + '"><i class="fa-solid fa-tree"></i> ' + escapeHTML(parkText) + '</span>' +
                            '<span class="filter-tag ' + (filters.category !== 'all' ? 'active-tag' : '') + '"><i class="fa-solid fa-tag"></i> ' + escapeHTML(catText) + '</span>' +
                            '<span class="filter-tag ' + (filters.urgency !== 'all' ? 'active-tag' : '') + '"><i class="fa-solid fa-gauge-high"></i> ' + escapeHTML(urgText) + '</span>' +
                          '</div>' +
                        '</div>';
}

function renderDashboardView(activeList, resolvedList, filters) {
  var resolvedCount = resolvedList.length;
  var totalAllTime = activeList.length + resolvedCount;
  var resolutionRate = totalAllTime > 0 ? Math.round((resolvedCount / totalAllTime) * 100) : 0;

  var criticalCount = 0;
  var categoryCounts = { 'สุขา': 0, 'ลานจอดรถ': 0, 'สนามกีฬา': 0, 'เส้นทางออกกำลังกาย': 0, 'สนามเด็กเล่น': 0, 'เครื่องออกกำลังกายกลางแจ้ง': 0 };
  var urgencyCounts = { 5: 0, 4: 0, 3: 0, 2: 0, 1: 0 };
  var deptActiveCounts = {
    'ฝ่ายบริหารจัดการพื้นที่สีเขียว 1': 0, 'ฝ่ายบริหารจัดการพื้นที่สีเขียว 2': 0,
    'ฝ่ายบริหารจัดการพื้นที่สีเขียว 3': 0, 'ฝ่ายบริหารจัดการพื้นที่สีเขียว 4': 0,
    'ฝ่ายบริหารจัดการพื้นที่สีเขียว 5': 0, 'ฝ่ายบริหารจัดการพื้นที่สีเขียว 6': 0
  };
  var deptResolvedCounts = { ...deptActiveCounts };
  var parkCounts = {};

  activeList.forEach(function(item) {
    var u = parseInt(item.urgency, 10) || 1;
    if (u >= 4) criticalCount++;

    urgencyCounts[u] = (urgencyCounts[u] || 0) + 1;
    if (categoryCounts[item.category] !== undefined) categoryCounts[item.category]++;
    if (deptActiveCounts[item.department] !== undefined) deptActiveCounts[item.department]++;
    if (item.parkName && item.parkName !== '-') parkCounts[item.parkName] = (parkCounts[item.parkName] || 0) + 1;
  });

  resolvedList.forEach(function(item) {
    if (deptResolvedCounts[item.department] !== undefined) deptResolvedCounts[item.department]++;
  });

  document.getElementById('kpiActiveCount').innerText = activeList.length;
  document.getElementById('kpiCriticalCount').innerText = criticalCount;
  document.getElementById('kpiResolvedCount').innerText = resolvedCount;
  document.getElementById('kpiResolutionRate').innerText = resolutionRate + '%';

  renderCategoryChart(categoryCounts);
  renderUrgencyChart(urgencyCounts);
  renderDepartmentChart(deptActiveCounts, deptResolvedCounts);
  renderTopParksList(parkCounts);
}

function renderCategoryChart(categoryCounts) {
  var ctx = document.getElementById('chartCategory').getContext('2d');
  if (categoryChartInstance) categoryChartInstance.destroy();

  var labels = ['สุขา', 'ลานจอดรถ', 'สนามกีฬา', 'เส้นทางออกกำลังกาย', 'สนามเด็กเล่น', 'เครื่องออกกำลังกาย'];
  var dataVals = [
    categoryCounts['สุขา'] || 0,
    categoryCounts['ลานจอดรถ'] || 0,
    categoryCounts['สนามกีฬา'] || 0,
    categoryCounts['เส้นทางออกกำลังกาย'] || 0,
    categoryCounts['สนามเด็กเล่น'] || 0,
    categoryCounts['เครื่องออกกำลังกายกลางแจ้ง'] || 0
  ];

  var pastelBgColors = ['#93c5fd', '#7dd3fc', '#86efac', '#cbd5e1', '#f9a8d4', '#fde047'];

  categoryChartInstance = new Chart(ctx, {
    type: 'doughnut',
    data: {
      labels: labels,
      datasets: [{
        data: dataVals,
        backgroundColor: pastelBgColors,
        borderWidth: 2,
        borderColor: '#ffffff'
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { position: 'bottom', labels: { boxWidth: 12, font: { family: 'Kanit', size: 11 } } },
        datalabels: {
          color: '#1e293b',
          font: { family: 'Kanit', weight: 'bold', size: 13 },
          formatter: value => (value > 0 ? value : ''),
          textStrokeColor: '#ffffff',
          textStrokeWidth: 2
        }
      }
    }
  });
}

function renderUrgencyChart(urgencyCounts) {
  var ctx = document.getElementById('chartUrgency').getContext('2d');
  if (urgencyChartInstance) urgencyChartInstance.destroy();

  urgencyChartInstance = new Chart(ctx, {
    type: 'bar',
    data: {
      labels: ['อันตรายร้ายแรง (5)', 'อันตรายสูง (4)', 'เฝ้าระวัง (3)', 'ความเสี่ยงต่ำ (2)', 'ชำรุดตามอายุงาน (1)'],
      datasets: [{
        label: 'จำนวนจุดชำรุด',
        data: [urgencyCounts[5] || 0, urgencyCounts[4] || 0, urgencyCounts[3] || 0, urgencyCounts[2] || 0, urgencyCounts[1] || 0],
        backgroundColor: ['#7f1d1d', '#ea580c', '#eab308', '#16a34a', '#94a3b8'],
        borderRadius: 6
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      layout: { padding: { top: 20 } },
      plugins: {
        legend: { display: false },
        datalabels: {
          anchor: 'end',
          align: 'top',
          offset: -2,
          color: '#1e293b',
          font: { family: 'Kanit', weight: 'bold', size: 12 },
          formatter: value => (value > 0 ? value : '0')
        }
      },
      scales: {
        y: { beginAtZero: true, grace: '15%', ticks: { stepSize: 1, font: { family: 'Kanit' } } },
        x: { ticks: { font: { family: 'Kanit', size: 10 } } }
      }
    }
  });
}

function renderDepartmentChart(activeDept, resolvedDept) {
  var ctx = document.getElementById('chartDepartment').getContext('2d');
  if (deptChartInstance) deptChartInstance.destroy();

  var depts = [
    'ฝ่ายบริหารจัดการพื้นที่สีเขียว 1', 'ฝ่ายบริหารจัดการพื้นที่สีเขียว 2',
    'ฝ่ายบริหารจัดการพื้นที่สีเขียว 3', 'ฝ่ายบริหารจัดการพื้นที่สีเขียว 4',
    'ฝ่ายบริหารจัดการพื้นที่สีเขียว 5', 'ฝ่ายบริหารจัดการพื้นที่สีเขียว 6'
  ];

  var shortLabels = ['ฝ่าย 1', 'ฝ่าย 2', 'ฝ่าย 3', 'ฝ่าย 4', 'ฝ่าย 5', 'ฝ่าย 6'];
  var activeData = depts.map(d => activeDept[d] || 0);
  var resolvedData = depts.map(d => resolvedDept[d] || 0);

  deptChartInstance = new Chart(ctx, {
    type: 'bar',
    data: {
      labels: shortLabels,
      datasets: [
        { label: 'รอปรับปรุง', data: activeData, backgroundColor: '#ef4444', borderRadius: 4 },
        { label: 'เสร็จสิ้นแล้ว', data: resolvedData, backgroundColor: '#10b981', borderRadius: 4 }
      ]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      layout: { padding: { top: 20 } },
      plugins: {
        legend: { position: 'bottom', labels: { boxWidth: 12, font: { family: 'Kanit', size: 11 } } },
        datalabels: {
          anchor: 'end',
          align: 'top',
          offset: -2,
          color: '#334155',
          font: { family: 'Kanit', weight: 'bold', size: 11 },
          formatter: value => (value > 0 ? value : '')
        }
      },
      scales: {
        y: { beginAtZero: true, grace: '15%', ticks: { stepSize: 1, font: { family: 'Kanit' } } },
        x: { ticks: { font: { family: 'Kanit', size: 10 } } }
      }
    }
  });
}

function renderTopParksList(parkCounts) {
  var container = document.getElementById('topParksList');
  var entries = Object.entries(parkCounts);

  if (entries.length === 0) {
    container.innerHTML = '<div class="text-center text-muted py-4"><i class="fa-regular fa-circle-check"></i> ไม่พบรายการชำรุดตามเงื่อนไขตัวกรองนี้</div>';
    return;
  }

  entries.sort((a, b) => b[1] - a[1]);
  var top5 = entries.slice(0, 5);

  var html = '';
  top5.forEach(function(item, idx) {
    html += '<div class="top-park-item">' +
              '<div class="top-park-info">' +
                '<span class="top-park-rank">' + (idx + 1) + '</span>' +
                '<span class="top-park-name">' + escapeHTML(item[0]) + '</span>' +
              '</div>' +
              '<span class="top-park-count">' + item[1] + ' รายการ</span>' +
            '</div>';
  });

  container.innerHTML = html;
}

function createMarkerIcon(maxUrgency, itemCount, category) {
  var catColor = getCategoryColor(category);
  var iconClass = categoryIcons[category] || defaultCategoryIcon;
  var urgColor = getUrgencyColor(maxUrgency);
  
  var countBadgeHtml = itemCount > 1 
    ? '<span class="pin-count-badge" style="background-color: #c4b5fd; color: #4c1d95; border: 1.5px solid #ffffff;">+' + itemCount + '</span>' 
    : '';

  var urgencyBadgeHtml = '<span class="pin-urgency-badge" style="background-color: ' + urgColor.bg + '; color: ' + urgColor.text + ';">' + maxUrgency + '</span>';

  return L.divIcon({
    className: 'custom-pin-wrapper',
    html: '<div class="custom-pin-container">' +
            '<div class="custom-pin" style="background-color: ' + catColor.bg + '; border: 2px solid #ffffff;">' +
              '<span class="custom-pin-inner" style="color: ' + catColor.text + ';">' +
                '<i class="' + iconClass + '"></i>' +
              '</span>' +
            '</div>' +
            urgencyBadgeHtml +
            countBadgeHtml +
          '</div>',
    iconSize: [36, 36],
    iconAnchor: [18, 36],
    popupAnchor: [0, -36]
  });
}

function renderGroupedMarkers(data) {
  markersGroup.clearLayers();
  groupedLocationData = groupReportsByCoordinate(data);

  if (!groupedLocationData || groupedLocationData.length === 0) return;

  groupedLocationData.sort((a, b) => a.maxUrgency - b.maxUrgency);

  groupedLocationData.forEach(function(group) {
    var pinBgColor = getCategoryColor(group.topCategory);
    var urgColor = getUrgencyColor(group.maxUrgency);
    
    var marker = L.marker([group.lat, group.lng], {
      icon: createMarkerIcon(group.maxUrgency, group.items.length, group.topCategory),
      zIndexOffset: group.maxUrgency * 1000,
      riseOnHover: true
    });

    var parkNamesSet = {};
    group.items.forEach(it => { if (it.parkName) parkNamesSet[it.parkName] = true; });
    var parkNames = Object.keys(parkNamesSet).join(', ');

    var tooltipContent = '<b>' + escapeHTML(parkNames) + '</b><br/>' +
                         'หมวดหมู่: <span style="font-weight:600; color:' + pinBgColor.text + ';">' + escapeHTML(group.topCategory || '-') + '</span><br/>' +
                         'จำนวนชำรุดทั้งหมด: <b>' + group.items.length + ' รายการ</b><br/>' +
                         'ระดับความเสี่ยง: <span style="color:' + urgColor.bg + '; font-weight:bold;">' + escapeHTML(urgencyLabels[group.maxUrgency] || ('ระดับ ' + group.maxUrgency)) + '</span><br/>' +
                         '<small style="color:#64748b;">(' + escapeHTML(urgencyDescriptions[group.maxUrgency] || '') + ')</small>';

    marker.bindTooltip(tooltipContent, { sticky: true, className: 'district-tooltip' });

    marker.on('click', function() {
      if (map) map.setView([group.lat, group.lng], 16, { animate: true, duration: 0.5 });
      openDetailModal(group, 0);
    });
    
    markersGroup.addLayer(marker);
  });
}

function filterMarkers() {
  var filters = getActiveFilters();
  var filtered = allDamageData;

  if (filters.department !== 'all') filtered = filtered.filter(d => d.department === filters.department);
  if (filters.park !== 'all') filtered = filtered.filter(d => d.parkName === filters.park);
  if (filters.category !== 'all') filtered = filtered.filter(d => d.category === filters.category);
  if (filters.urgency !== 'all') filtered = filtered.filter(d => d.urgency === parseInt(filters.urgency, 10));

  updateSummaryStats(filtered);
  renderGroupedMarkers(filtered);

  var dashModal = document.getElementById('dashboardModal');
  if (dashModal && dashModal.style.display === 'flex') renderDashboardWithCurrentFilters();

  var tblModal = document.getElementById('tableModal');
  if (tblModal && tblModal.style.display === 'flex') renderTableWithCurrentFilters();
}

function openDetailModal(group, index) {
  currentActiveGroup = group;
  currentActiveIndex = index;
  displayCurrentReportItem();
  document.getElementById('detailModal').style.display = 'flex';
}

function displayCurrentReportItem() {
  if (!currentActiveGroup || !currentActiveGroup.items.length) return;

  var total = currentActiveGroup.items.length;
  var item = currentActiveGroup.items[currentActiveIndex];

  document.getElementById('mDepartment').innerText = item.department;
  document.getElementById('mParkName').innerText = item.parkName;
  document.getElementById('mArea').innerText = item.area;
  document.getElementById('mIssue').innerText = item.issue;
  
  var catColor = getCategoryColor(item.category);
  var catIconClass = categoryIcons[item.category] || defaultCategoryIcon;
  
  document.getElementById('mCategory').innerHTML = 
    '<span class="modal-category-badge" style="background-color: ' + catColor.bg + '; color: ' + catColor.text + '; border: 1px solid ' + catColor.text + '33;">' +
      '<i class="' + catIconClass + '"></i> ' + escapeHTML(item.category) +
    '</span>';
  
  var urgColor = getUrgencyColor(item.urgency);
  var urgTitle = urgencyLabels[item.urgency] || ('ระดับ ' + item.urgency);
  var urgDesc = urgencyDescriptions[item.urgency] || '';

  document.getElementById('mUrgency').innerHTML = 
    '<div style="display: flex; flex-direction: column; gap: 3px; align-items: flex-end;">' +
      '<span class="modal-urgency-badge" style="background-color:' + urgColor.bg + '; color:' + urgColor.text + '; border: 1px solid ' + urgColor.border + ';">' + 
        escapeHTML(urgTitle) + 
      '</span>' +
      '<small style="color: #64748b; font-size: 0.76rem; font-weight: 500;">• ' + escapeHTML(urgDesc) + '</small>' +
    '</div>';
  
  var notesElem = document.getElementById('mNotes');
  var notesRow = document.getElementById('mNotesRow');
  if (item.notes && item.notes !== '-') {
    notesElem.innerText = item.notes;
    notesRow.style.display = 'flex';
  } else {
    notesRow.style.display = 'none';
  }

  var imgElem = document.getElementById('modalImage');
  var fallback = document.getElementById('noImageFallback');

  if (item.imageUrl && item.imageId) {
    imgElem.setAttribute('data-image-id', item.imageId);
    imgElem.src = item.imageUrl;
    imgElem.style.display = 'block';
    fallback.style.display = 'none';
  } else {
    imgElem.src = 'data:image/svg+xml,%3Csvg xmlns=\'http://www.w3.org/2000/svg\'/%3E';
    imgElem.style.display = 'none';
    fallback.style.display = 'flex';
  }

  var actionsContainer = document.getElementById('adminActionsContainer');
  if (currentUser.loggedIn && (currentUser.role === 'admin' || currentUser.dept === item.department)) {
    actionsContainer.style.display = 'grid';
  } else {
    actionsContainer.style.display = 'none';
  }

  document.getElementById('modalPaginationBadge').innerText = (currentActiveIndex + 1) + '/' + total;
  document.getElementById('navStatusText').innerText = 'รายการที่ ' + (currentActiveIndex + 1) + ' จากทั้งหมด ' + total + ' รายการในพิกัดนี้';

  var footerNav = document.getElementById('modalFooterNav');
  var btnPrev = document.getElementById('btnPrev');
  var btnNext = document.getElementById('btnNext');

  if (total > 1) {
    footerNav.style.display = 'flex';
    btnPrev.disabled = (currentActiveIndex === 0);
    btnNext.disabled = (currentActiveIndex === total - 1);
  } else {
    footerNav.style.display = 'none';
  }
}

function prevReportItem() {
  if (currentActiveGroup && currentActiveIndex > 0) {
    currentActiveIndex--;
    displayCurrentReportItem();
  }
}

function nextReportItem() {
  if (currentActiveGroup && currentActiveIndex < currentActiveGroup.items.length - 1) {
    currentActiveIndex++;
    displayCurrentReportItem();
  }
}

function closeModal(modalId) {
  document.getElementById(modalId).style.display = 'none';
}

function updateStatsBadgeColors() {
  for (var u = 1; u <= 5; u++) {
    var colorObj = urgencyRedPalette[u];
    var badgeElem = document.querySelector('.badge-lvl-' + u);
    if (badgeElem) {
      badgeElem.style.backgroundColor = colorObj.bg;
      badgeElem.style.boxShadow = '0 0 0 2px ' + colorObj.bg + '33';
    }
  }
}

function updateSummaryStats(data) {
  var list = data || [];
  var count5 = 0, count4 = 0, count3 = 0, count2 = 0, count1 = 0;

  for (var i = 0; i < list.length; i++) {
    var u = parseInt(list[i].urgency, 10);
    if (u === 5) count5++;
    else if (u === 4) count4++;
    else if (u === 3) count3++;
    else if (u === 2) count2++;
    else if (u === 1) count1++;
  }

  document.getElementById('statTotal').innerText = list.length;
  document.getElementById('statUrg5').innerText = count5;
  document.getElementById('statUrg4').innerText = count4;
  document.getElementById('statUrg3').innerText = count3;
  document.getElementById('statUrg2').innerText = count2;
  document.getElementById('statUrg1').innerText = count1;

  updateStatsBadgeColors();
}

/**
 * ⚡ โหลดข้อมูลเริ่มต้นผ่าน Fetch API (JSON)
 */
function loadReports() {
  fetch(`${API_URL}?action=getInitialData&userCode=${encodeURIComponent(currentUser.code)}`)
    .then(res => res.json())
    .then(response => {
      allDamageData = response.active || [];
      rawResolvedData = response.resolved || [];

      var currentDept = document.getElementById('departmentFilter') ? document.getElementById('departmentFilter').value : 'all';
      updateParkDropdownOptions(currentDept);
      filterMarkers();
    })
    .catch(err => {
      showToast('เกิดข้อผิดพลาดในการโหลดข้อมูล: ' + err.message, 'error');
    });
}

function groupReportsByCoordinate(data) {
  var coordMap = new Map();

  for (var i = 0; i < data.length; i++) {
    var item = data[i];
    var key = item.lat.toFixed(4) + '_' + item.lng.toFixed(4);

    if (coordMap.has(key)) {
      coordMap.get(key).items.push(item);
    } else {
      coordMap.set(key, {
        lat: item.lat,
        lng: item.lng,
        items: [item]
      });
    }
  }

  var groups = Array.from(coordMap.values());
  for (var j = 0; j < groups.length; j++) {
    var g = groups[j];
    g.items.sort((a, b) => b.urgency - a.urgency);
    g.maxUrgency = g.items[0].urgency;
    g.topCategory = g.items[0].category;
  }

  return groups;
}

function getCurrentGPSLocation() {
  if (!navigator.geolocation) {
    showToast('เบราว์เซอร์ไม่รองรับ GPS แนะนำใช้ปุ่ม "📍 จิ้มบนแผนที่"', 'error');
    return;
  }

  showToast('กำลังค้นหาพิกัด GPS...', 'info');

  navigator.geolocation.getCurrentPosition(
    function(pos) {
      document.getElementById('fLat').value = pos.coords.latitude.toFixed(6);
      document.getElementById('fLng').value = pos.coords.longitude.toFixed(6);
      showToast('ดึงพิกัด GPS สำเร็จ!', 'success');
    },
    function(err) {
      showToast('ไม่สามารถระบุพิกัดได้: ' + err.message, 'error');
    },
    { enableHighAccuracy: true, timeout: 8000, maximumAge: 0 }
  );
}

function startMapPinPick() {
  isPickingLocationOnMap = true;
  document.getElementById('reportFormModal').style.display = 'none';
  document.getElementById('mapPickerBanner').style.display = 'flex';
  showToast('แตะหรือคลิกตำแหน่งบนแผนที่ได้เลยครับ', 'info');
}

function cancelMapPinPick() {
  isPickingLocationOnMap = false;
  document.getElementById('mapPickerBanner').style.display = 'none';
  document.getElementById('reportFormModal').style.display = 'flex';
  if (tempPickerMarker) {
    map.removeLayer(tempPickerMarker);
    tempPickerMarker = null;
  }
}

function completeMapPinPick(lat, lng) {
  isPickingLocationOnMap = false;
  document.getElementById('mapPickerBanner').style.display = 'none';
  
  document.getElementById('fLat').value = lat.toFixed(6);
  document.getElementById('fLng').value = lng.toFixed(6);

  if (tempPickerMarker) map.removeLayer(tempPickerMarker);

  tempPickerMarker = L.marker([lat, lng], {
    icon: L.divIcon({
      className: 'custom-pin-wrapper',
      html: '<div style="background:#00744b; width:16px; height:16px; border-radius:50%; border:3px solid white; box-shadow:0 0 8px rgba(0,0,0,0.5);"></div>',
      iconSize: [16, 16],
      iconAnchor: [8, 8]
    })
  }).addTo(map);

  document.getElementById('reportFormModal').style.display = 'flex';
  showToast('เลือกพิกัดบนแผนที่เรียบร้อยแล้ว!', 'success');
}

function useMapCenterCoordinate() {
  if (!map) return;
  var center = map.getCenter();
  document.getElementById('fLat').value = center.lat.toFixed(6);
  document.getElementById('fLng').value = center.lng.toFixed(6);
  showToast('ใช้พิกัดจุดกึ่งกลางหน้าจอเรียบร้อยแล้ว!', 'success');
}

/**
 * 🌟 รีเซ็ตมุมมองแผนที่กลับสู่ศูนย์กลาง กทม.
 */
function resetMapToDefaultView() {
  if (!map) return;
  
  // บังคับคำนวณพื้นที่แผนที่ใหม่ก่อนย้ายมุมมอง
  map.invalidateSize();

  if (bmaDistrictsLayer && bmaDistrictsLayer.getLayers().length > 0) {
    map.fitBounds(bmaDistrictsLayer.getBounds(), {
      padding: [15, 15],
      maxZoom: 12,
      animate: true,
      duration: 0.5
    });
  } else {
    // พิกัดศูนย์กลาง กทม. (อนุสาวรีย์ประชาธิปไตย/เสาชิงช้า)
    map.setView([13.7563, 100.5018], 11.5, { 
      animate: true, 
      duration: 0.5 
    });
  }
}

function handleBMAMaskOverlay(show) {
  if (!map) return;
  if (bmaMaskLayer) { map.removeLayer(bmaMaskLayer); bmaMaskLayer = null; }
  if (bmaDistrictsLayer) { map.removeLayer(bmaDistrictsLayer); bmaDistrictsLayer = null; }
  if (!show) return;

  if (bmaCachedGeoJSON) {
    drawBMAData(bmaCachedGeoJSON);
  } else {
    var cdnUrl = 'https://cdn.jsdelivr.net/gh/pcrete/gsvloader-demo@master/geojson/Bangkok-districts.geojson';
    fetch(cdnUrl)
      .then(res => res.json())
      .then(data => {
        bmaCachedGeoJSON = data;
        drawBMAData(data);
      })
      .catch(err => console.warn('BMA GeoJSON fallback:', err));
  }
}

function drawBMAData(data) {
  function isTrashBox(feature) {
    if (!feature || !feature.geometry) return true;
    var props = feature.properties || {};
    var dName = props.dname || props.dist_th || props.name || props.dname_t || props.dname_e || props.district || '';
    if (!dName || typeof dName !== 'string') return true;
    if (/bbox|bound|frame|box|extent|grid|rect|layer/i.test(dName)) return true;

    var geom = feature.geometry;
    var ring = null;
    if (geom.type === 'Polygon' && geom.coordinates && geom.coordinates[0]) ring = geom.coordinates[0];
    else if (geom.type === 'MultiPolygon' && geom.coordinates && geom.coordinates[0] && geom.coordinates[0][0]) ring = geom.coordinates[0][0];

    if (!ring || ring.length <= 20) return true;
    var lats = {}, lngs = {};
    for (var i = 0; i < ring.length; i++) {
      lats[ring[i][1].toFixed(3)] = true;
      lngs[ring[i][0].toFixed(3)] = true;
    }
    return Object.keys(lats).length <= 2 && Object.keys(lngs).length <= 2;
  }

  bmaDistrictsLayer = L.geoJSON(data, {
    filter: feature => !isTrashBox(feature),
    style: () => ({
      color: '#00744b',
      weight: 0.9,
      opacity: 0.38,
      fillColor: '#ffffff',
      fillOpacity: 0.02,
      className: 'bma-district-path'
    }),
    onEachFeature: function(feature, layer) {
      var props = feature.properties || {};
      var dName = props.dname || props.dist_th || props.name || '';
      if (dName) {
        if (dName.indexOf('เขต') === -1) dName = 'เขต' + dName;
        layer.bindTooltip(escapeHTML(dName), { sticky: true, className: 'district-tooltip' });
        layer.on({
          click: e => {
            if (isPickingLocationOnMap) completeMapPinPick(e.latlng.lat, e.latlng.lng);
          },
          mouseover: e => e.target.setStyle({ weight: 1.8, opacity: 0.85, color: '#004d32', fillOpacity: 0.12 }),
          mouseout: () => bmaDistrictsLayer.resetStyle(layer)
        });
      }
    }
  }).addTo(map);

  var worldOuter = [[90, -180], [90, 180], [-90, 180], [-90, -180]];
  var maskRings = [worldOuter];

  data.features.forEach(function(feature) {
    if (isTrashBox(feature)) return;
    var geom = feature.geometry;
    if (geom.type === 'Polygon') {
      geom.coordinates.forEach(ring => maskRings.push(ring.map(c => [c[1], c[0]])));
    } else if (geom.type === 'MultiPolygon') {
      geom.coordinates.forEach(poly => poly.forEach(ring => maskRings.push(ring.map(c => [c[1], c[0]]))));
    }
  });

  bmaMaskLayer = L.polygon(maskRings, {
    stroke: false,
    fillColor: '#0f172a',
    fillOpacity: 0.40,
    interactive: false
  }).addTo(map);

  // 🌟 บังคับคำนวณขนาดและจัดแผนที่เขต กทม. ให้อยู่กึ่งกลางหน้าจอทันที
  setTimeout(function() {
    if (map && bmaDistrictsLayer && bmaDistrictsLayer.getLayers().length > 0) {
      map.invalidateSize();
      map.fitBounds(bmaDistrictsLayer.getBounds(), {
        padding: [20, 20],
        maxZoom: 12,
        animate: false
      });
    }
  }, 200);
}

function openAuthModal() {
  var input = document.getElementById('authCodeInput');
  input.value = '';
  document.getElementById('authModal').style.display = 'flex';
  setTimeout(() => { try { input.focus(); } catch(e) {} }, 100);
}

function handleAuthSubmit(e) {
  e.preventDefault();
  var code = document.getElementById('authCodeInput').value.trim();
  var btn = document.getElementById('authSubmitBtn');
  btn.disabled = true;
  btn.innerText = 'กำลังตรวจสอบ...';

  fetch(API_URL, {
    method: 'POST',
    body: JSON.stringify({ action: 'verifyUser', code: code })
  })
    .then(res => res.json())
    .then(res => {
      btn.disabled = false;
      btn.innerHTML = '<i class="fa-solid fa-arrow-right-to-bracket"></i> ยืนยันรหัส';

      if (res.success) {
        currentUser.loggedIn = true;
        currentUser.role = res.role;
        currentUser.dept = res.dept;
        currentUser.code = res.code;

        updateUIAfterLogin();
        closeModal('authModal');
        loadReports();
        showToast('เข้าสู่ระบบสำเร็จ (' + res.dept + ')', 'success');
      } else {
        showToast(res.message, 'error');
      }
    })
    .catch(err => {
      btn.disabled = false;
      btn.innerHTML = '<i class="fa-solid fa-arrow-right-to-bracket"></i> ยืนยันรหัส';
      showToast('เกิดข้อผิดพลาด: ' + err.message, 'error');
    });
}

function updateUIAfterLogin() {
  document.getElementById('btnLogin').style.display = 'none';
  document.getElementById('btnLogout').style.display = 'inline-flex';
  document.getElementById('btnAddReport').style.display = 'inline-flex';

  var userBadge = document.getElementById('userBadge');
  document.getElementById('userBadgeText').innerText = currentUser.dept;
  userBadge.style.display = 'inline-flex';

  var deptFilter = document.getElementById('departmentFilter');
  if (currentUser.role === 'officer') {
    deptFilter.value = currentUser.dept;
    deptFilter.disabled = true;
  } else {
    deptFilter.disabled = false;
  }
}

function handleLogout() {
  currentUser = { loggedIn: false, role: '', dept: '', code: '' };

  document.getElementById('btnLogin').style.display = 'inline-flex';
  document.getElementById('btnLogout').style.display = 'none';
  document.getElementById('btnAddReport').style.display = 'none';
  document.getElementById('userBadge').style.display = 'none';

  var deptFilter = document.getElementById('departmentFilter');
  if (deptFilter) {
    deptFilter.value = 'all';
    deptFilter.disabled = false;
  }

  loadReports();
  showToast('ออกจากระบบเรียบร้อยแล้ว', 'info');
}

/**
 * 📷 จัดการเมื่อผู้ใช้ถ่ายภาพหรือเลือกไฟล์ในฟอร์มแจ้งชำรุด
 */
function handleFormImageSelected(event) {
  var file = event.target.files[0];
  if (!file) return;

  if (file.size > 8 * 1024 * 1024) {
    showToast('⚠️ ขนาดไฟล์ภาพต้องไม่เกิน 8 MB', 'error');
    event.target.value = '';
    return;
  }

  readFileAsBase64(file, function(b64) {
    if (b64) {
      formPendingBase64 = { base64: b64, type: 'image/jpeg' };
      isFormImageRemoved = false;
      document.getElementById('formImagePreview').src = b64;
      document.getElementById('formImagePreviewContainer').style.display = 'flex';
      document.getElementById('formImagePreviewLabel').innerHTML = '<i class="fa-solid fa-circle-check text-emerald"></i> เลือกภาพใหม่แล้ว:';
    }
  });
}

function clearFormImagePreview() {
  formPendingBase64 = null;
  isFormImageRemoved = true;
  document.getElementById('fImageFileCamera').value = '';
  document.getElementById('fImageFileGallery').value = '';
  document.getElementById('fExistingImageId').value = '';
  document.getElementById('formImagePreview').src = '';
  document.getElementById('formImagePreviewContainer').style.display = 'none';
  showToast('ลบภาพเรียบร้อยแล้ว', 'info');
}

/**
 * 📷 จัดการเมื่อผู้ใช้ถ่ายภาพหรือเลือกไฟล์ในฟอร์มปรับปรุงเสร็จสิ้น
 */
function handleResolveImageSelected(event) {
  var file = event.target.files[0];
  if (!file) return;

  if (file.size > 8 * 1024 * 1024) {
    showToast('⚠️ ขนาดไฟล์ภาพต้องไม่เกิน 8 MB', 'error');
    event.target.value = '';
    return;
  }

  readFileAsBase64(file, function(b64) {
    if (b64) {
      pendingResolveBase64 = { base64: b64, type: 'image/jpeg' };
      document.getElementById('resolveImagePreview').src = b64;
      document.getElementById('resolveImagePreviewBox').style.display = 'flex';
    }
  });
}

function clearResolveImagePreview() {
  pendingResolveBase64 = null;
  document.getElementById('resolveCameraInput').value = '';
  document.getElementById('resolveGalleryInput').value = '';
  document.getElementById('resolveImagePreview').src = '';
  document.getElementById('resolveImagePreviewBox').style.display = 'none';
}

/**
 * 🌟 อัปเดต openAddModal ให้รีเซ็ตพรีวิวภาพ
 */
function openAddModal() {
  if (!currentUser.loggedIn) {
    showToast('กรุณาเข้าสู่ระบบเจ้าหน้าที่ก่อนเพิ่มรายการ', 'error');
    openAuthModal();
    return;
  }

  document.getElementById('formModalTitle').innerHTML = '<i class="fa-solid fa-plus-circle"></i> บันทึกรายการแจ้งชำรุดใหม่';
  document.getElementById('reportForm').reset();
  document.getElementById('fRowIndex').value = '';
  document.getElementById('fExistingImageId').value = '';
  
  formPendingBase64 = null;
  isFormImageRemoved = false;
  document.getElementById('formImagePreviewContainer').style.display = 'none';
  document.getElementById('formImageHint').style.display = 'none';

  var deptSelect = document.getElementById('fDepartment');
  deptSelect.value = (currentUser.role === 'officer') ? currentUser.dept : deptSelect.value;
  deptSelect.disabled = (currentUser.role === 'officer');

  document.getElementById('reportFormModal').style.display = 'flex';
}

/**
 * 🌟 อัปเดต openEditModalFromCurrentItem ให้แสดงพรีวิวภาพเดิม (ถ้ามี)
 */
function openEditModalFromCurrentItem() {
  if (!currentUser.loggedIn) {
    showToast('กรุณาเข้าสู่ระบบเจ้าหน้าที่ก่อนแก้ไขข้อมูล', 'error');
    openAuthModal();
    return;
  }

  if (!currentActiveGroup || !currentActiveGroup.items.length) return;
  var item = currentActiveGroup.items[currentActiveIndex];

  document.getElementById('formModalTitle').innerHTML = '<i class="fa-solid fa-pen-to-square"></i> แก้ไขข้อมูลการชำรุด';
  document.getElementById('fRowIndex').value = item.rowIndex;
  document.getElementById('fExistingImageId').value = item.imageId || '';

  document.getElementById('fCategory').value = item.category;
  document.getElementById('fParkName').value = item.parkName;
  document.getElementById('fArea').value = item.area;
  document.getElementById('fIssue').value = item.issue;
  document.getElementById('fUrgency').value = item.urgency;
  document.getElementById('fLat').value = item.lat;
  document.getElementById('fLng').value = item.lng;
  document.getElementById('fNotes').value = item.notes !== '-' ? item.notes : '';

  formPendingBase64 = null;
  isFormImageRemoved = false;

  // หากมีรูปภาพเดิม ให้แสดงพรีวิวภาพเดิมทันที
  if (item.imageUrl && item.imageId) {
    document.getElementById('formImagePreview').src = item.imageUrl;
    document.getElementById('formImagePreviewContainer').style.display = 'flex';
    document.getElementById('formImagePreviewLabel').innerHTML = '<i class="fa-solid fa-image"></i> ภาพเดิมในระบบ:';
    document.getElementById('formImageHint').style.display = 'block';
  } else {
    document.getElementById('formImagePreviewContainer').style.display = 'none';
    document.getElementById('formImageHint').style.display = 'none';
  }

  var deptSelect = document.getElementById('fDepartment');
  deptSelect.value = item.department;
  deptSelect.disabled = (currentUser.role === 'officer');

  closeModal('detailModal');
  document.getElementById('reportFormModal').style.display = 'flex';
}

/**
 * 🌟 อัปเดต handleFormSubmit ให้ส่ง base64 ของภาพที่เลือก
 */
function handleFormSubmit(e) {
  e.preventDefault();
  if (!currentUser.loggedIn) {
    showToast('กรุณาเข้าสู่ระบบเจ้าหน้าที่ก่อนบันทึกข้อมูล', 'error');
    openAuthModal();
    return;
  }

  var btn = document.getElementById('fSubmitBtn');
  btn.disabled = true;
  btn.innerText = 'กำลังบันทึกข้อมูลและอัปโหลดภาพ...';

  var deptSelect = document.getElementById('fDepartment');
  var formData = {
    rowIndex: document.getElementById('fRowIndex').value,
    existingImageId: isFormImageRemoved ? '' : document.getElementById('fExistingImageId').value,
    category: document.getElementById('fCategory').value,
    department: deptSelect.value,
    parkName: document.getElementById('fParkName').value.trim(),
    area: document.getElementById('fArea').value.trim(),
    issue: document.getElementById('fIssue').value.trim(),
    urgency: document.getElementById('fUrgency').value,
    lat: document.getElementById('fLat').value,
    lng: document.getElementById('fLng').value,
    notes: document.getElementById('fNotes').value.trim(),
    imageFile: formPendingBase64
  };

  fetch(API_URL, {
    method: 'POST',
    body: JSON.stringify({
      action: 'saveOrUpdate',
      formData: formData,
      userCode: currentUser.code
    })
  })
    .then(res => res.json())
    .then(res => {
      btn.disabled = false;
      btn.innerHTML = '<i class="fa-solid fa-floppy-disk"></i> บันทึกข้อมูล';
      if (res.success) {
        showToast(res.message, 'success');
        closeModal('reportFormModal');
        loadReports();
      } else {
        showToast(res.message, 'error');
      }
    })
    .catch(err => {
      btn.disabled = false;
      btn.innerHTML = '<i class="fa-solid fa-floppy-disk"></i> บันทึกข้อมูล';
      showToast('เกิดข้อผิดพลาด: ' + err.message, 'error');
    });
}

function readFileAsBase64(file, callback) {
  if (!file) { callback(null); return; }
  var reader = new FileReader();
  reader.onload = function(e) {
    var rawResult = e.target.result;
    var img = new Image();
    img.onload = function() {
      try {
        var canvas = document.createElement('canvas');
        var maxDim = 1200;
        var width = img.width, height = img.height;
        if (width > maxDim || height > maxDim) {
          if (width > height) {
            height = Math.round((height * maxDim) / width);
            width = maxDim;
          } else {
            width = Math.round((width * maxDim) / height);
            height = maxDim;
          }
        }
        canvas.width = width;
        canvas.height = height;
        var ctx = canvas.getContext('2d');
        ctx.drawImage(img, 0, 0, width, height);
        callback(canvas.toDataURL('image/jpeg', 0.8));
      } catch (err) {
        callback(rawResult);
      }
    };
    img.onerror = () => callback(rawResult);
    img.src = rawResult;
  };
  reader.onerror = err => {
    showToast('อ่านไฟล์ภาพล้มเหลว: ' + err.message, 'error');
    callback(null);
  };
  reader.readAsDataURL(file);
}

function handleFormSubmit(e) {
  e.preventDefault();
  if (!currentUser.loggedIn) {
    showToast('กรุณาเข้าสู่ระบบเจ้าหน้าที่ก่อนบันทึกข้อมูล', 'error');
    openAuthModal();
    return;
  }

  var btn = document.getElementById('fSubmitBtn');
  btn.disabled = true;
  btn.innerText = 'กำลังบันทึกข้อมูลและอัปโหลดภาพ...';

  var deptSelect = document.getElementById('fDepartment');
  var formData = {
    rowIndex: document.getElementById('fRowIndex').value,
    existingImageId: document.getElementById('fExistingImageId').value,
    category: document.getElementById('fCategory').value,
    department: deptSelect.value,
    parkName: document.getElementById('fParkName').value.trim(),
    area: document.getElementById('fArea').value.trim(),
    issue: document.getElementById('fIssue').value.trim(),
    urgency: document.getElementById('fUrgency').value,
    lat: document.getElementById('fLat').value,
    lng: document.getElementById('fLng').value,
    notes: document.getElementById('fNotes').value.trim(),
    imageFile: null
  };

  var fileInput = document.getElementById('fImageFile');

  function executeSave() {
    fetch(API_URL, {
      method: 'POST',
      body: JSON.stringify({
        action: 'saveOrUpdate',
        formData: formData,
        userCode: currentUser.code
      })
    })
      .then(res => res.json())
      .then(res => {
        btn.disabled = false;
        btn.innerHTML = '<i class="fa-solid fa-floppy-disk"></i> บันทึกข้อมูล';
        if (res.success) {
          showToast(res.message, 'success');
          closeModal('reportFormModal');
          loadReports();
        } else {
          showToast(res.message, 'error');
        }
      })
      .catch(err => {
        btn.disabled = false;
        btn.innerHTML = '<i class="fa-solid fa-floppy-disk"></i> บันทึกข้อมูล';
        showToast('เกิดข้อผิดพลาด: ' + err.message, 'error');
      });
  }

  if (fileInput.files && fileInput.files[0]) {
    readFileAsBase64(fileInput.files[0], function(b64) {
      if (b64) formData.imageFile = { base64: b64, type: 'image/jpeg' };
      executeSave();
    });
  } else {
    executeSave();
  }
}

var pendingResolveItem = null;
var pendingResolveBase64 = null;

/**
 * 🌟 เมื่อกดปุ่ม "ปรับปรุงเสร็จสิ้น" ในหน้าต่างรายละเอียด
 */
function onResolveButtonClick() {
  if (!currentActiveGroup || !currentActiveGroup.items.length) return;
  var item = currentActiveGroup.items[currentActiveIndex];
  
  pendingResolveItem = item;
  pendingResolveBase64 = null;

  var summaryElem = document.getElementById('resolveSummaryInfo');
  if (summaryElem) {
    summaryElem.innerHTML = 
      '<strong>' + escapeHTML(item.parkName) + '</strong> (' + escapeHTML(item.category) + ')<br/>' +
      'จุดเกิดเหตุ: ' + escapeHTML(item.area) + '<br/>' +
      'ปัญหา: ' + escapeHTML(item.issue);
  }

  // รีเซ็ตข้อความรายละเอียด
  var actionInput = document.getElementById('resolveActionDetail');
  if (actionInput) actionInput.value = '';

  // รีเซ็ตค่า Input ไฟล์ทั้งสองตัว
  var camInput = document.getElementById('resolveCameraInput');
  if (camInput) camInput.value = '';
  var galInput = document.getElementById('resolveGalleryInput');
  if (galInput) galInput.value = '';

  // ซ่อนกล่องพรีวิว
  var previewBox = document.getElementById('resolveImagePreviewBox');
  if (previewBox) previewBox.style.display = 'none';
  var previewImg = document.getElementById('resolveImagePreview');
  if (previewImg) previewImg.src = '';

  document.getElementById('resolveConfirmModal').style.display = 'flex';
}

function closeResolveConfirmModal() {
  document.getElementById('resolveConfirmModal').style.display = 'none';
  pendingResolveItem = null;
  pendingResolveBase64 = null;
}

function previewResolveImage(event) {
  var file = event.target.files[0];
  if (!file) return;

  if (file.size > 5 * 1024 * 1024) {
    showToast('⚠️ ขนาดไฟล์ภาพต้องไม่เกิน 5 MB', 'error');
    event.target.value = '';
    return;
  }

  var reader = new FileReader();
  reader.onload = function(e) {
    document.getElementById('resolveImagePreview').src = e.target.result;
    document.getElementById('resolveImagePreviewBox').style.display = 'block';

    var base64Data = e.target.result.split(',')[1];
    pendingResolveBase64 = {
      name: file.name,
      type: file.type,
      base64: base64Data
    };
  };
  reader.readAsDataURL(file);
}

/**
 * 🚀 ส่งข้อมูลบันทึกการปรับปรุงเสร็จสิ้นไปยัง Apps Script API
 */
function submitResolveAction() {
  if (!pendingResolveItem) return;

  var actionDetailInput = document.getElementById('resolveActionDetail');
  var actionDetail = actionDetailInput ? actionDetailInput.value.trim() : '';
  
  if (!actionDetail) {
    showToast('⚠️ กรุณาระบุรายละเอียดการดำเนินการแก้ไข', 'error');
    if (actionDetailInput) actionDetailInput.focus();
    return;
  }

  var btnSubmit = document.getElementById('btnSubmitResolve');
  if (btnSubmit) {
    btnSubmit.disabled = true;
    btnSubmit.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> กำลังบันทึก...';
  }

  var payload = {
    rowIndex: pendingResolveItem.rowIndex,
    category: pendingResolveItem.category,
    department: pendingResolveItem.department,
    parkName: pendingResolveItem.parkName,
    area: pendingResolveItem.area,
    issue: pendingResolveItem.issue,
    urgency: pendingResolveItem.urgency,
    lat: pendingResolveItem.lat,
    lng: pendingResolveItem.lng,
    imageId: pendingResolveItem.imageId,
    notes: pendingResolveItem.notes,
    actionDetail: actionDetail,
    afterImageFile: pendingResolveBase64
  };

  fetch(API_URL, {
    method: 'POST',
    body: JSON.stringify({
      action: 'resolveReport',
      data: payload,
      userCode: currentUser.code
    })
  })
    .then(res => res.json())
    .then(res => {
      if (btnSubmit) {
        btnSubmit.disabled = false;
        btnSubmit.innerHTML = '<i class="fa-solid fa-check"></i> บันทึกเสร็จสิ้น';
      }

      if (res.success) {
        showToast(res.message, 'success');
        closeResolveConfirmModal();
        closeModal('detailModal'); // แก้ไขเป็นชื่อฟังก์ชันที่ถูกต้อง
        loadReports(); // ดึงข้อมูลใหม่
      } else {
        showToast(res.message, 'error');
      }
    })
    .catch(err => {
      if (btnSubmit) {
        btnSubmit.disabled = false;
        btnSubmit.innerHTML = '<i class="fa-solid fa-check"></i> บันทึกเสร็จสิ้น';
      }
      showToast('เกิดข้อผิดพลาด: ' + err.message, 'error');
    });
}

window.onclick = function(event) {
  ['detailModal', 'authModal', 'reportFormModal', 'confirmModal', 'dashboardModal', 'tableModal'].forEach(function(id) {
    var modal = document.getElementById(id);
    if (event.target === modal) closeModal(id);
  });
};

// =========================================================
// 📍 ระบบตรวจจับพิกัด GPS และโฟกัสสวนสาธารณะใกล้เคียง
// =========================================================
var AUTO_DETECT_RADIUS_KM = 2.0; // รัศมีตรวจจับรอบตัว 2 กิโลเมตร
var hasAutoDetectedPark = false;
var userLocationMarker = null;

/**
 * 📐 คำนวณระยะห่างระหว่าง 2 พิกัด (Haversine Formula) เป็นกิโลเมตร
 */
function calculateDistanceKm(lat1, lon1, lat2, lon2) {
  var R = 6371; // รัศมีโลก (km)
  var dLat = (lat2 - lat1) * Math.PI / 180;
  var dLon = (lon2 - lon1) * Math.PI / 180;
  var a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
          Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
          Math.sin(dLon / 2) * Math.sin(dLon / 2);
  var c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

/**
 * 📍 ค้นหาสวนสาธารณะที่ใกล้ที่สุดจากพิกัด GPS ของผู้ใช้งาน
 */
function autoDetectNearestPark(userLat, userLng) {
  var combinedData = allDamageData.concat(rawResolvedData || []);
  if (!combinedData || combinedData.length === 0) return null;

  var parkCoords = {};
  combinedData.forEach(function(item) {
    if (item.parkName && item.parkName !== '-' && item.lat && item.lng) {
      if (!parkCoords[item.parkName]) {
        parkCoords[item.parkName] = { lats: [], lngs: [], dept: item.department };
      }
      parkCoords[item.parkName].lats.push(item.lat);
      parkCoords[item.parkName].lngs.push(item.lng);
    }
  });

  var nearestPark = null;
  var minDistance = Infinity;

  Object.keys(parkCoords).forEach(function(pName) {
    var obj = parkCoords[pName];
    var avgLat = obj.lats.reduce((a, b) => a + b, 0) / obj.lats.length;
    var avgLng = obj.lngs.reduce((a, b) => a + b, 0) / obj.lngs.length;

    var dist = calculateDistanceKm(userLat, userLng, avgLat, avgLng);
    if (dist < minDistance) {
      minDistance = dist;
      nearestPark = {
        name: pName,
        dept: obj.dept,
        distance: dist,
        lat: avgLat,
        lng: avgLng
      };
    }
  });

  // หากอยู่ในรัศมีที่กำหนด
  if (nearestPark && nearestPark.distance <= AUTO_DETECT_RADIUS_KM) {
    return nearestPark;
  }
  return null;
}

/**
 * 📍 ฟังก์ชันกดค้นหาพิกัดด้วยตนเอง (Manual Trigger)
 */
function manualTriggerUserLocation() {
  var locateBtn = document.querySelector('.btn-map-locate');
  if (locateBtn) locateBtn.classList.add('is-locating');
  
  showToast('กำลังค้นหาพิกัด GPS ของคุณ...', 'info');
  runLocationProcess(true);
}

/**
 * 🚀 ตรวจสอบ GPS อัตโนมัติเมื่อโหลดข้อมูลครั้งแรก
 */
function runAutoLocationCheck() {
  if (hasAutoDetectedPark) return;
  runLocationProcess(false);
}

function runLocationProcess(isManual) {
  var locateBtn = document.querySelector('.btn-map-locate');

  if (!navigator.geolocation) {
    if (locateBtn) locateBtn.classList.remove('is-locating');
    if (isManual) showToast('เบราว์เซอร์ไม่รองรับระบบระบุพิกัด GPS', 'error');
    return;
  }

  navigator.geolocation.getCurrentPosition(
    function(pos) {
      if (locateBtn) locateBtn.classList.remove('is-locating');
      hasAutoDetectedPark = true;
      var uLat = pos.coords.latitude;
      var uLng = pos.coords.longitude;

      // วาดจุดสีฟ้าแสดงตำแหน่งปัจจุบันของผู้ใช้
      if (userLocationMarker) map.removeLayer(userLocationMarker);
      userLocationMarker = L.circleMarker([uLat, uLng], {
        radius: 8,
        fillColor: '#0284c7',
        color: '#ffffff',
        weight: 2.5,
        opacity: 1,
        fillOpacity: 0.9
      }).addTo(map).bindTooltip('📍 คุณอยู่ที่นี่', { permanent: false, direction: 'top' });

      var nearest = autoDetectNearestPark(uLat, uLng);
      if (nearest) {
        var deptFilter = document.getElementById('departmentFilter');
        var parkFilter = document.getElementById('parkFilter');

        // ปรับตัวกรองฝ่ายและสวนให้ตรงกับตำแหน่ง
        if (!currentUser.loggedIn || currentUser.role === 'admin' || currentUser.dept === nearest.dept) {
          if (deptFilter && (!currentUser.loggedIn || currentUser.role === 'admin')) {
            deptFilter.value = nearest.dept;
            updateParkDropdownOptions(nearest.dept);
          }
          if (parkFilter) parkFilter.value = nearest.name;
          
          filterMarkers();
          if (map) map.setView([nearest.lat, nearest.lng], 16, { animate: true, duration: 0.8 });
          showToast('📍 ตรวจพบตำแหน่งใกล้: ' + nearest.name + ' (' + (nearest.distance * 1000).toFixed(0) + ' ม.)', 'success');
        }
      } else if (isManual) {
        if (map) map.setView([uLat, uLng], 15, { animate: true, duration: 0.6 });
        showToast('📍 อยู่นอกรัศมีสวนสาธารณะในระบบ', 'info');
      }
    },
    function(err) {
      if (locateBtn) locateBtn.classList.remove('is-locating');
      hasAutoDetectedPark = true;
      if (isManual) {
        showToast('⚠️ ไม่สามารถระบุพิกัดได้: ' + err.message, 'error');
      }
    },
    { enableHighAccuracy: true, timeout: 7000, maximumAge: 60000 }
  );
}

/**
 * ⚡ อัปเดตฟังก์ชัน loadReports ให้เรียก runAutoLocationCheck()
 */
function loadReports() {
  fetch(`${API_URL}?action=getInitialData&userCode=${encodeURIComponent(currentUser.code)}`)
    .then(res => res.json())
    .then(response => {
      allDamageData = response.active || [];
      rawResolvedData = response.resolved || [];

      var currentDept = document.getElementById('departmentFilter') ? document.getElementById('departmentFilter').value : 'all';
      updateParkDropdownOptions(currentDept);
      filterMarkers();

      // 🌟 สั่งตรวจจับตำแหน่ง GPS ทันทีที่ข้อมูลพร้อม
      runAutoLocationCheck();
    })
    .catch(err => {
      showToast('เกิดข้อผิดพลาดในการโหลดข้อมูล: ' + err.message, 'error');
    });
}
