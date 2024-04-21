const $ipInput = document.querySelector('#ip-input');
const $button = document.querySelector('#connectButton');

// process user input and save to storage
$ipInput.addEventListener('input', (e) => {
	const { value } = e.currentTarget;
	chrome.storage.sync.set({ cacheIP: value });
});

// get the IP data in storage
async function fetchData() {
	chrome.storage.sync.get(null, (storage) => {
		if (storage.cacheIP === undefined)
			$ipInput.value = "127.0.0.1:5555";
		else
			$ipInput.value = storage.cacheIP;
	});
}
window.onload = () => {
	document.title = "Watch Together Extension";
	fetchData();
}

// connect button event
document.addEventListener('DOMContentLoaded', function() {
    $button.addEventListener('click', function() {
		chrome.storage.sync.set({ cacheIP: $ipInput.value });  // always save content before connect
        // window.location.href = "./main.html";
		chrome.tabs.update({url:`https://www.youtube.com/watch?v=6zg0JvlpYZ4&watchTogetherIP=${$ipInput.value}`});
    });
});
