const $ipInput = document.querySelector('#ip-input');

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
	fetchData();
}

// connect button event
document.addEventListener('DOMContentLoaded', function() {
    var button = document.querySelector('#connectButton');
    button.addEventListener('click', function() {
		chrome.storage.sync.set({ cacheIP: $ipInput.value });  // always save content before connect
        window.location.href = "./main.html";
    });
});
