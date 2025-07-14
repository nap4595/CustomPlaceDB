// 지도 장소 스크랩 Background Script

// 익스텐션 설치
chrome.runtime.onInstalled.addListener(() => {
  console.log('지도 장소 스크랩 익스텐션이 설치되었습니다.');
});

// 메시지 처리
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === 'get-storage') {
    chrome.storage.local.get(request.key, (result) => {
      sendResponse(result);
    });
    return true;
  }
  
  if (request.action === 'set-storage') {
    chrome.storage.local.set(request.data, () => {
      sendResponse({ success: true });
    });
    return true;
  }
  
  if (request.action === 'fetchPlaceInfo') {
    console.log('Background script에서 API 호출:', request.url);
    
    fetch(request.url, {
      method: 'GET',
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'ko-KR,ko;q=0.8,en-US;q=0.5,en;q=0.3',
        'Connection': 'keep-alive',
        'Cache-Control': 'max-age=0'
      }
    })
    .then(response => {
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }
      return response.text();
    })
    .then(html => {
      console.log('Background script API 응답 성공');
      sendResponse({ success: true, data: html });
    })
    .catch(error => {
      console.error('Background script API 오류:', error);
      sendResponse({ success: false, error: error.message });
    });
    
    return true; // 비동기 응답을 위해 true 반환
  }
});

// 탭 업데이트 감지
chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  if (changeInfo.status === 'complete' && tab.url && tab.url.includes('map.naver.com')) {
    console.log('지도 페이지가 로드되었습니다.');
  }
});