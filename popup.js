// 설정 상수
const CONFIG = {
  STORAGE_KEYS: {
    MAIN_DATA: 'mapScraperData'
  }
};

// 디버그 모드 설정
const DEBUG_MODE = false; // 프로덕션에서는 false

// 로깅 유틸리티
const Logger = {
  log: (...args) => DEBUG_MODE && console.log('[CustomPlaceDB Popup]', ...args),
  error: (...args) => console.error('[CustomPlaceDB Popup Error]', ...args),
  warn: (...args) => DEBUG_MODE && console.warn('[CustomPlaceDB Popup Warning]', ...args)
};

document.addEventListener('DOMContentLoaded', async () => {
  await loadStats();
  setupEventListeners();
  checkNaverMapTab();
});

async function loadStats() {
  try {
    const result = await chrome.storage.local.get(['mapScraperData']);
    const data = result[CONFIG.STORAGE_KEYS.MAIN_DATA] || {};
    
    const listCount = Object.keys(data).length;
    const placeCount = Object.values(data).reduce((total, list) => {
      return total + (list.places ? list.places.length : 0);
    }, 0);
    
    document.getElementById('list-count').textContent = listCount;
    document.getElementById('place-count').textContent = placeCount;
  } catch (error) {
    Logger.error('통계 로드 실패:', error);
  }
}

function setupEventListeners() {
  document.getElementById('open-naver-map').addEventListener('click', () => {
    chrome.tabs.create({
      url: 'https://map.naver.com'
    });
  });
  
  document.getElementById('open-kakao-map').addEventListener('click', () => {
    chrome.tabs.create({
      url: 'https://map.kakao.com'
    });
  });
  
  
  document.getElementById('export-data').addEventListener('click', () => {
    showExportModal();
  });
  
  document.getElementById('import-data').addEventListener('click', () => {
    importData();
  });
  
  document.getElementById('clear-data').addEventListener('click', async () => {
    await clearAllData();
  });
  
  document.getElementById('privacy-policy-link').addEventListener('click', (e) => {
    e.preventDefault();
    chrome.tabs.create({
      url: chrome.runtime.getURL('privacy.html')
    });
  });
  
  setupExportModalEventListeners();
  setupImportModalEventListeners();
  setupFileInputEventListener();
}

async function checkNaverMapTab() {
  try {
    const tabs = await chrome.tabs.query({
      url: 'https://map.naver.com/*'
    });
    
    const openMapBtn = document.getElementById('open-naver-map');
    if (tabs.length > 0) {
      openMapBtn.textContent = '네이버지도';
      openMapBtn.onclick = () => {
        chrome.tabs.update(tabs[0].id, { active: true });
        chrome.windows.update(tabs[0].windowId, { focused: true });
      };
    }
  } catch (error) {
    Logger.error('네이버 지도 탭 확인 실패:', error);
  }
}

// ==================== 내보내기 모달 관리 ====================
function showExportModal() {
  document.getElementById('export-modal').style.display = 'block';
}

function hideExportModal() {
  document.getElementById('export-modal').style.display = 'none';
}

function setupExportModalEventListeners() {
  document.getElementById('export-json').addEventListener('click', async () => {
    hideExportModal();
    await exportDataAsJSON();
  });
  
  document.getElementById('export-csv').addEventListener('click', async () => {
    hideExportModal();
    await exportDataAsCSV();
  });
  
  document.getElementById('cancel-export').addEventListener('click', () => {
    hideExportModal();
  });
  
  // 모달 배경 클릭 시 닫기
  document.getElementById('export-modal').addEventListener('click', (e) => {
    if (e.target.id === 'export-modal') {
      hideExportModal();
    }
  });
}

function setupImportModalEventListeners() {
  document.getElementById('import-merge').addEventListener('click', () => {
    hideImportModal();
    handleImportChoice('merge');
  });
  
  document.getElementById('import-replace').addEventListener('click', () => {
    hideImportModal();
    handleImportChoice('replace');
  });
  
  document.getElementById('import-cancel').addEventListener('click', () => {
    hideImportModal();
    // 파일 입력 초기화
    document.getElementById('file-input').value = '';
  });
  
  // 모달 배경 클릭 시 닫기
  document.getElementById('import-modal').addEventListener('click', (e) => {
    if (e.target.id === 'import-modal') {
      hideImportModal();
      document.getElementById('file-input').value = '';
    }
  });
}

function showImportModal() {
  document.getElementById('import-modal').style.display = 'block';
}

function hideImportModal() {
  document.getElementById('import-modal').style.display = 'none';
}

// ==================== JSON 내보내기 ====================
async function exportDataAsJSON() {
  try {
    const result = await chrome.storage.local.get(['mapScraperData']);
    const data = result[CONFIG.STORAGE_KEYS.MAIN_DATA] || {};
    
    if (Object.keys(data).length === 0) {
      alert('내보낼 데이터가 없습니다.');
      return;
    }
    
    const exportData = {
      exportDate: new Date().toISOString(),
      version: '1.2.0',
      lists: data
    };
    
    const blob = new Blob([JSON.stringify(exportData, null, 2)], {
      type: 'application/json'
    });
    const url = URL.createObjectURL(blob);
    
    const a = document.createElement('a');
    a.href = url;
    a.download = `custom-place-db-${new Date().toISOString().split('T')[0]}.json`;
    a.click();
    
    URL.revokeObjectURL(url);
    await showMessage('JSON 파일이 성공적으로 내보내졌습니다!');
  } catch (error) {
    console.error('JSON 내보내기 실패:', error);
    await showMessage('JSON 내보내기에 실패했습니다.');
  }
}

// ==================== CSV 내보내기 ====================
async function exportDataAsCSV() {
  try {
    const result = await chrome.storage.local.get(['mapScraperData']);
    const data = result[CONFIG.STORAGE_KEYS.MAIN_DATA] || {};
    
    if (Object.keys(data).length === 0) {
      alert('내보낼 데이터가 없습니다.');
      return;
    }
    
    // CSV 데이터 생성
    const csvData = generateCSVData(data);
    
    // BOM 추가 (Excel에서 한글 깨짐 방지)
    const bomBlob = new Blob(['\uFEFF' + csvData], {
      type: 'text/csv;charset=utf-8;'
    });
    
    const url = URL.createObjectURL(bomBlob);
    
    const a = document.createElement('a');
    a.href = url;
    a.download = `custom-place-db-${new Date().toISOString().split('T')[0]}.csv`;
    a.click();
    
    URL.revokeObjectURL(url);
    await showMessage('CSV 파일이 성공적으로 내보내졌습니다!');
  } catch (error) {
    console.error('CSV 내보내기 실패:', error);
    await showMessage('CSV 내보내기에 실패했습니다.');
  }
}

function generateCSVData(lists) {
  let csvContent = '';
  
  Object.entries(lists).forEach(([listId, list], listIndex) => {
    if (listIndex > 0) {
      csvContent += '\n\n'; // 리스트 간 구분을 위한 빈 줄
    }
    
    // 리스트 제목
    csvContent += `"=== ${list.name} ==="\n`;
    
    if (!list.places || list.places.length === 0) {
      csvContent += '"저장된 장소가 없습니다."\n';
      return;
    }
    
    // 헤더 생성 (새로운 순서: 장소명 → 카테고리 → 별점 → 플랫폼 → 커스텀필드 → URL)
    const headers = ['장소명', '카테고리', '별점', '플랫폼'];
    
    // 커스텀 필드 헤더 추가
    if (list.customFields && list.customFields.length > 0) {
      list.customFields.forEach(field => {
        headers.push(field.name);
      });
    }
    
    headers.push('URL');
    
    // 헤더 행 추가
    csvContent += headers.map(header => `"${header}"`).join(',') + '\n';
    
    // 데이터 행 추가
    list.places.forEach(place => {
      const row = [
        place.name || '',
        place.category || '',
        place.rating || '',
        place.platform || '네이버' // 기본값은 네이버
      ];
      
      // 커스텀 필드 값 추가
      if (list.customFields && list.customFields.length > 0) {
        list.customFields.forEach(field => {
          const value = place.customValues ? (place.customValues[field.name] || '') : '';
          row.push(value);
        });
      }
      
      row.push(place.url || ''); // URL을 마지막에 추가
      
      // CSV 형식으로 변환 (따옴표 처리)
      csvContent += row.map(cell => `"${String(cell).replace(/"/g, '""')}"`).join(',') + '\n';
    });
  });
  
  return csvContent;
}

// ==================== 데이터 가져오기 ====================
let pendingImportData = null; // 가져올 데이터를 임시 저장

function importData() {
  document.getElementById('file-input').click();
}

function setupFileInputEventListener() {
  document.getElementById('file-input').addEventListener('change', handleFileImport);
}

async function handleFileImport(event) {
  const file = event.target.files[0];
  if (!file) return;
  
  if (!file.name.endsWith('.json')) {
    alert('JSON 파일만 가져올 수 있습니다.');
    event.target.value = '';
    return;
  }
  
  try {
    const text = await file.text();
    const importedData = JSON.parse(text);
    
    // 데이터 유효성 검사
    if (!importedData.lists || typeof importedData.lists !== 'object') {
      alert('유효하지 않은 데이터 형식입니다.');
      event.target.value = '';
      return;
    }
    
    // 임시로 데이터 저장하고 모달 표시
    pendingImportData = importedData.lists;
    showImportModal();
    
  } catch (error) {
    console.error('데이터 가져오기 실패:', error);
    alert('파일을 읽는 중 오류가 발생했습니다. 올바른 JSON 파일인지 확인해주세요.');
    event.target.value = '';
  }
}

async function handleImportChoice(choice) {
  if (!pendingImportData) return;
  
  try {
    if (choice === 'merge') {
      await mergeImportedData(pendingImportData);
    } else if (choice === 'replace') {
      await replaceAllData(pendingImportData);
    }
    
    // 파일 입력 초기화 및 임시 데이터 정리
    document.getElementById('file-input').value = '';
    pendingImportData = null;
    
    await showMessage('데이터가 성공적으로 가져와졌습니다!');
    loadStats();
    
  } catch (error) {
    console.error('데이터 처리 실패:', error);
    await showMessage('데이터 처리 중 오류가 발생했습니다.');
  }
}

async function mergeImportedData(importedLists) {
  try {
    const result = await chrome.storage.local.get(['mapScraperData']);
    const existingData = result.mapScraperData || {};
    
    // 중복 리스트명 처리
    Object.entries(importedLists).forEach(([importedId, importedList]) => {
      let newListName = importedList.name;
      let counter = 1;
      
      // 기존 리스트명과 중복되는지 확인
      while (Object.values(existingData).some(list => list.name === newListName)) {
        newListName = `${importedList.name} (${counter})`;
        counter++;
      }
      
      // 새로운 ID로 리스트 추가
      const newId = Date.now().toString() + Math.random().toString(36).substr(2, 9);
      existingData[newId] = {
        ...importedList,
        name: newListName
      };
    });
    
    await chrome.storage.local.set({ mapScraperData: existingData });
  } catch (error) {
    console.error('데이터 병합 실패:', error);
    throw error;
  }
}

async function replaceAllData(importedLists) {
  try {
    await chrome.storage.local.set({ mapScraperData: importedLists });
  } catch (error) {
    console.error('데이터 교체 실패:', error);
    throw error;
  }
}

// ==================== 데이터 삭제 ====================
async function clearAllData() {
  const confirmed = confirm('정말로 모든 데이터를 삭제하시겠습니까?\n이 작업은 되돌릴 수 없습니다.');
  
  if (!confirmed) return;
  
  try {
    // chrome.storage.local.clear() 대신 빈 객체로 명시적 업데이트
    // 이렇게 해야 storage change 이벤트가 확실히 발생함
    await chrome.storage.local.set({ mapScraperData: {} });
    
    document.getElementById('list-count').textContent = '0';
    document.getElementById('place-count').textContent = '0';
    
    await showMessage('모든 데이터가 삭제되었습니다.');
  } catch (error) {
    console.error('데이터 삭제 실패:', error);
    await showMessage('데이터 삭제에 실패했습니다.');
  }
}

// ==================== 유틸리티 ====================
async function showMessage(message) {
  const platformColor = await getCurrentPlatformColor();
  
  const messageDiv = document.createElement('div');
  messageDiv.style.cssText = `
    position: fixed;
    top: 10px;
    left: 50%;
    transform: translateX(-50%);
    padding: 10px 15px;
    border-radius: 4px;
    font-size: 12px;
    font-weight: bold;
    z-index: 1000;
    background-color: ${platformColor};
    color: white;
  `;
  messageDiv.textContent = message;
  document.body.appendChild(messageDiv);
  
  setTimeout(() => {
    if (document.body.contains(messageDiv)) {
      document.body.removeChild(messageDiv);
    }
  }, 3000);
}

async function getCurrentPlatformColor() {
  try {
    // 현재 활성 탭 확인
    const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
    if (tabs.length === 0) return '#000'; // 기본값
    
    const currentTab = tabs[0];
    const url = currentTab.url;
    
    // 플랫폼 감지
    if (url.includes('naver.com') && url.includes('/map')) {
      return '#03c75a'; // 네이버 초록
    } else if (url.includes('kakao.com')) {
      return '#FFE300'; // 카카오 노랑
    }
    
    return '#000'; // 기본값 (검은색)
  } catch (error) {
    console.error('플랫폼 색상 감지 실패:', error);
    return '#000'; // 기본값
  }
}

chrome.storage.onChanged.addListener((changes, namespace) => {
  if (namespace === 'local' && changes.mapScraperData) {
    loadStats();
  }
});