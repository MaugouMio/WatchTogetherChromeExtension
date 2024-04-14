chrome.action.onClicked.addListener(function(tab) {
	chrome.windows.create({ url: chrome.runtime.getURL("window/index.html") });
});