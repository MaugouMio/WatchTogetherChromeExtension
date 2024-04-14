const $titleText = document.querySelector('#title');
const $ipInfo = document.querySelector('#connecting-ip');
const $playlistContainer = document.querySelector('#playlist');
const $backButton = document.querySelector('#stopConnectButton');
const $urlInput = document.querySelector('#url-input');
const $searchButton = document.querySelector('#search-button');
const $searchResultFrame = document.querySelector('#search-result');
const $addVideoButton = document.querySelector('#add-video-button');
const $searchResultImg = document.querySelector('#search-result-img');
const $searchResultTitle = document.querySelector('#search-result-title');
const $searchResultAuthor = document.querySelector('#search-result-author');

var ytPlayer = undefined;
var ytPlayerReady = false;
var searchResultVideoID = undefined;

var ws = undefined;
var playlist = [];
var playingID = -1;

// get the IP data in storage and try to connect
async function init() {
	chrome.storage.sync.get(null, (storage) => {
		let cacheIP = storage.cacheIP;
		$ipInfo.innerHTML = cacheIP;
	
		ws = new WebSocket("ws://" + cacheIP);
		ws.onopen = onConnected;
		ws.onerror = onConnectFailed;
		ws.onmessage = onReceive;
	});
}
window.onload = () => {
	init();
}
window.onbeforeunload = function() {
	if (ws !== undefined)
		ws.close();
}

document.addEventListener('DOMContentLoaded', function() {
	// back button event
    $backButton.addEventListener('click', function() {
        window.location.href = "./index.html";
    });
	// search button event
    $searchButton.addEventListener('click', function() {
		var vID = $urlInput.value.match(/youtu(?:.*\/v\/|.*v\=|\.be\/)([A-Za-z0-9_\-]{11})/)[1];
		if (vID === undefined)
			return;
		
        fetch(`https://noembed.com/embed?dataType=json&url=${$urlInput.value}`)
			.then(res => res.json())
			.then(data => {
				$searchResultFrame.style.visibility = "visible";
				
				let imageUrl = "https://i.ytimg.com/vi/" + vID + "/mqdefault.jpg";
				$searchResultImg.src = imageUrl;
				$searchResultTitle.innerHTML = data.title;
				$searchResultAuthor.innerHTML = data.author_name;
				searchResultVideoID = vID;
			})
    });
	// add video button event
    $addVideoButton.addEventListener('click', function() {
        sendMsg({"type": "add", "vid": searchResultVideoID});
    });
});

// ============= WebSocket server protocol ============= //

// on WebSocket connected
function onConnected() {
	$titleText.innerHTML = "Watch Together";
};
// on WebSocket connect failed
function onConnectFailed() {
	$ipInfo.innerHTML = "can not connect to " + $ipInfo.innerHTML;
};
// send msg to WebSocket server
function sendMsg(msg) {
	if (ws === undefined)
		return;
	
	var data = JSON.stringify(msg);
	ws.send(data);
}
// on receive WebSocket server msg
function onReceive(e) {
	var msg = JSON.parse(e.data);
	switch (msg.type) {
		case "list":
			$playlistContainer.innerHTML = "";
			playlist = msg.playlist;
			for (let i = 0; i < playlist.length; i++) {
				const vID = playlist[i];
				var img = document.createElement("img");
				let imageUrl = "https://i.ytimg.com/vi/" + vID + "/default.jpg";
				img.src = imageUrl
				
				var btn = document.createElement("button");
				btn.addEventListener('click', function() {
					sendMsg({"type": "load", "id": i});
				});
				btn.appendChild(img);
				$playlistContainer.appendChild(btn);
				$playlistContainer.appendChild(document.createElement("br"));
			}
			if (msg.id >= 0) {
				playingID = msg.id;
				if (!msg.update_only && ytPlayerReady)
					ytPlayer.cueVideoById(playlist[playingID]);
			}
			break;
		case "load":
			if (!ytPlayerReady)
				break;
			
			playingID = msg.id;
			ytPlayer.cueVideoById(playlist[playingID]);
			break;
		case "play":
			if (!ytPlayerReady)
				break;
			if (msg.id != playingID)
				break;
			ytPlayer.seekTo(msg.time);
			if (msg.paused)
				ytPlayer.pauseVideo();
			break;
	}
};

// ============= Youtube Player API ============= //

function onYouTubeIframeAPIReady() {
	ytPlayer = new YT.Player('ytplayer', {
		events: {
			'onReady': onPlayerReady,
			'onStateChange': onPlayerStateChanged,
		}
	});
}
function onPlayerReady(e) {
	ytPlayerReady = true;
	if (playingID >= 0)
		ytPlayer.cueVideoById(playlist[playingID]);
}
// Youtube Player state changed
function onPlayerStateChanged(e) {
	switch (e.data) {
		case YT.PlayerState.CUED:
			sendMsg({"type": "ready", "id": playingID});
			break;
		case YT.PlayerState.PAUSED:
			// to avoid pause caused by seeking, delay a little bit and check again if still paused
			setTimeout(function() {
				if ( e.target.getPlayerState() == 2 ) {
					sendMsg({"type": "pause", "id": playingID});
				}
			}, 200);
			break;
		case YT.PlayerState.ENDED:
			sendMsg({"type": "end", "id": playingID});
			break;
		case YT.PlayerState.PLAYING:
			sendMsg({"type": "play", "id": playingID, "time": ytPlayer.getCurrentTime()});
			break;
	}
}
