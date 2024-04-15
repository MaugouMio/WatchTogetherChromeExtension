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
var serverCallPlayTime = -1;
var serverPaused = false;
var cacheVideoInfo = {};

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
		
		var imageUrl = "https://i.ytimg.com/vi/" + vID + "/mqdefault.jpg";
		var cacheData = cacheVideoInfo[vID];
		if (cacheData === undefined) {
			fetch(`https://noembed.com/embed?dataType=json&url=${$urlInput.value}`)
				.then(res => res.json())
				.then(data => {
					$searchResultFrame.style.visibility = "visible";
					
					$searchResultImg.src = imageUrl;
					$searchResultTitle.innerHTML = data.title;
					$searchResultAuthor.innerHTML = data.author_name;
					searchResultVideoID = vID;
					// cache data for less html request
					cacheVideoInfo[vID] = { title: data.title, author: data.author_name };
				});
		}
		else {
			$searchResultImg.src = imageUrl;
			$searchResultTitle.innerHTML = cacheData.title;
			$searchResultAuthor.innerHTML = cacheData.author;
			searchResultVideoID = vID;
		}
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
			playingID = msg.id;
			playlist = [];
			for (let i = 0; i < msg.playlist.length; i++) {
				const videoID = msg.playlist[i];
				
				var btnFrame = document.createElement("div");
				btnFrame.className = "playlist-item";
				
					let btn = document.createElement("button");
					btn.className = "playlist-item-button";
					btn.addEventListener('click', function() {
						sendMsg({"type": "load", "id": i});
					});
					btnFrame.appendChild(btn);
					
						let img = document.createElement("img");
						let imageUrl = "https://i.ytimg.com/vi/" + videoID + "/default.jpg";
						img.src = imageUrl
						btn.appendChild(img);
						
						let infoFrame = document.createElement("div");
						infoFrame.className = "playlist-item-info";
						btn.appendChild(infoFrame);
						
							let title = document.createElement("p");
							title.className = "playlist-item-info-text";
							title.style.height = "80%";
							infoFrame.appendChild(title);
							
							let author = document.createElement("p");
							author.className = "playlist-item-info-text";
							author.style.height = "20%";
							author.style["text-wrap"] = "nowrap";
							infoFrame.appendChild(author);
					
					let playingOverlay = document.createElement("div");
					playingOverlay.className = "playing-overlay";
					playingOverlay.innerHTML = "playing";
					if (playingID == i)
						playingOverlay.style.visibility = "visible";
					btnFrame.appendChild(playingOverlay);
					
					let btnRemove = document.createElement("button");
					btnRemove.className = "playlist-remove";
					btnRemove.innerHTML = "X";
					btnRemove.addEventListener('click', function(event) {
						sendMsg({"type": "remove", "id": i});
					});
					btnFrame.appendChild(btnRemove);
				
				$playlistContainer.appendChild(btnFrame);
				playlist.push({ vID: videoID, overlayObj: playingOverlay });
				
				// write video title and author
				let cacheData = cacheVideoInfo[videoID];
				if (cacheData === undefined) {
					fetch(`https://noembed.com/embed?dataType=json&url=https://www.youtube.com/watch?v=${videoID}`)
						.then(res => res.json())
						.then(data => {
							title.innerHTML = data.title;
							author.innerHTML = data.author_name;
							// cache data for less html request
							cacheVideoInfo[videoID] = { title: data.title, author: data.author_name };
						});
				}
				else {
					title.innerHTML = cacheData.title;
					author.innerHTML = cacheData.author;
				}
			}
			
			if (ytPlayerReady) {
				if (playingID < 0) {
					// stop current playing video
					if (ytPlayer.getPlayerState() == YT.PlayerState.PLAYING || ytPlayer.getPlayerState() == YT.PlayerState.PAUSED)
						ytPlayer.seekTo(ytPlayer.getDuration());
				}
				else if (!msg.update_only)
					ytPlayer.cueVideoById(playlist[playingID].vID);
			}
			break;
			
		case "load":
			if (!ytPlayerReady)
				break;
			
			playingID = msg.id;
			// update playing notation
			for (let i = 0; i < playlist.length; i++) {
				if (i == playingID)
					playlist[i].overlayObj.style.visibility = "visible";
				else
					playlist[i].overlayObj.style.visibility = "hidden";
			}
			ytPlayer.cueVideoById(playlist[playingID].vID);
			break;
			
		case "play":
			if (!ytPlayerReady)
				break;
			if (msg.id != playingID)
				break;
			
			serverCallPlayTime = Date.now();
			if (ytPlayer.getPlayerState() != YT.PlayerState.PLAYING ||
				Math.abs(ytPlayer.getCurrentTime() - msg.time) > 0.5)
				ytPlayer.seekTo(msg.time);
			
			serverPaused = msg.paused;
			if (serverPaused)
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
		ytPlayer.cueVideoById(playlist[playingID].vID);
}
// Youtube Player state changed
function onPlayerStateChanged(e) {
	if (playingID < 0)
		return;
	
	switch (e.data) {
		case YT.PlayerState.CUED:
			sendMsg({"type": "ready", "id": playingID});
			break;
		case YT.PlayerState.PAUSED:
			if (serverPaused)
				break;
			
			// to avoid pause caused by seeking, delay a little bit and check again if still paused
			setTimeout(function() {
				if (ytPlayer.getPlayerState() == YT.PlayerState.PAUSED) {
					sendMsg({"type": "pause", "id": playingID});
				}
			}, 200);
			break;
		case YT.PlayerState.ENDED:
			sendMsg({"type": "end", "id": playingID});
			break;
		case YT.PlayerState.PLAYING:
			// ignore play events just after the server called play
			if (Math.abs(serverCallPlayTime - Date.now()) > 200)
				sendMsg({"type": "play", "id": playingID, "time": ytPlayer.getCurrentTime()});
			break;
	}
}
