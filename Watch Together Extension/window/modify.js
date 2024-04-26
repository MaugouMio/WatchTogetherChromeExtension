const YTPlayerState = {
	UNLOADED: -1,
	ENDED: 0,
	PLAYING: 1,
	PAUSED: 2,
	BUFFERING: 3,
	CUED: 5
}

var initCheck;
var ytPlayer;
var htmlVideo;
var ytPlayerReady = false;

var videoFailReasonCheck = 0;
var isFirstLoad = false;

var searchResultType = -1;  // 0 = video, 1 = playlist
var searchResultVideoID = undefined;
var searchResultPlaylistID = undefined;

var ws = undefined;
var playlist = [];
var playingID = -1;
var serverCallPlayTime = -1;
var serverPlayTime = -1;
var serverPaused = false;
var cacheVideoInfo = {};

var draggingIdx = -1;
var draggingObj = null;
var dragLastEnter = null;

function videoDragMouseDown(e) {
	draggingObj = this;
	draggingIdx = parseInt(this.parentElement.getAttribute("video-idx"));
	document.body.style.cursor = "grabbing";
	document.body.classList.add("inheritCursors");
	this.parentElement.style.border = "thick dashed";
}

function onMouseUp(e) {
	if (draggingObj != null) {
		document.body.style.cursor = null;
		document.body.classList.remove("inheritCursors");
		draggingObj.parentElement.style.border = null;
		if (dragLastEnter != null) {
			let idx = parseInt(dragLastEnter.getAttribute("video-idx"));
			sendMsg({"type": "move", "from": draggingIdx, "to": idx});
			dragLastEnter = null;
		}
		draggingIdx = -1;
		draggingObj = null;
	}
}
document.addEventListener("mouseup", onMouseUp);

function videoDragEnter(e) {
	if (draggingIdx < 0)
		return false;
	
	let idx = parseInt(this.getAttribute("video-idx"));
	if (idx == draggingIdx)
		return false;
	
	dragLastEnter = this;
	
	const borderColor = "8px ridge #00ff00";
	if (draggingIdx < idx)
		this.style["border-bottom"] = borderColor;
	else
		this.style["border-top"] = borderColor;
}

function videoDragLeave(e) {
	if (draggingIdx < 0)
		return false;
	
	let idx = parseInt(this.getAttribute("video-idx"));
	if (idx == draggingIdx)
		return false;
	
	dragLastEnter = null;
	this.style = null;
}

function onClickOutside(e) {
	copyURLButton.style.visibility = "hidden";
	document.removeEventListener("click", onClickOutside);
}

function videoRightClick(e) {
	e.preventDefault();
	e.stopPropagation();
	document.addEventListener("click", onClickOutside);
	
	const rect = e.target.getBoundingClientRect();
	copyURLButton.style.visibility = "visible";
	copyURLButton.style.top = `${rect.top + e.offsetY}px`;
	copyURLButton.style.left  = `${rect.left + e.offsetX}px`;
	
	rightClickVideoID = playlist[parseInt(e.currentTarget.getAttribute("video-idx"))].vID;
}

// ============= WebSocket server protocol ============= //

// on WebSocket connected
function onConnected() {
	$ipInfo.innerHTML = "Connected to " + watchTogetherIP;
};
// on WebSocket connect failed
function onConnectFailed() {
	$ipInfo.innerHTML = "Can not connect to " + watchTogetherIP;
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
			draggingIdx = -1;  // reset drag event
			playingID = msg.id;
			playlist = [];
			for (let i = 0; i < msg.playlist.length; i++) {
				const videoID = msg.playlist[i];
				
				var btnFrame = document.createElement("div");
				btnFrame.className = "playlist-item";
				btnFrame.setAttribute("video-idx", i);
				btnFrame.addEventListener("mouseover", videoDragEnter);
				btnFrame.addEventListener("mouseout", videoDragLeave);
				btnFrame.addEventListener("contextmenu", videoRightClick);
					
					let btnDrag = document.createElement("button");
					btnDrag.className = "playlist-drag";
					btnDrag.innerHTML = "⠿";
					btnDrag.addEventListener("mousedown", videoDragMouseDown);
					btnFrame.appendChild(btnDrag);
				
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
					if (ytPlayer.getPlayerState() == YTPlayerState.PLAYING || ytPlayer.getPlayerState() == YTPlayerState.PAUSED)
						ytPlayer.seekTo(ytPlayer.getDuration(), true);
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
			serverPlayTime = msg.time;
			if (Math.abs(ytPlayer.getCurrentTime() - serverPlayTime) > 0.5)
				ytPlayer.seekTo(serverPlayTime, true);
			
			serverPaused = msg.paused;
			if (serverPaused) {
				if (!isFirstLoad)  // directly pause the video will cause the play event never fires (which means you don't know when to fix the timeline) when there is no ads
					ytPlayer.pauseVideo();
			}
			else
				ytPlayer.playVideo();
			
			break;
			
		case "search":
			if (msg.id == "") {
				alert("Invalid playlist url!");
				break;
			}
			
			$searchResultFrame.style.visibility = "visible";
			
			$searchResultImg.src = msg.icon;
			$searchResultTitle.innerHTML = msg.title;
			$searchResultAuthor.innerHTML = msg.len + " clip(s)";
			searchResultPlaylistID = msg.id;
			searchResultType = 1;
			break;
	}
};

// Youtube Player state changed
function onPlayerStateChanged(e) {
	if (playingID < 0)
		return;
	console.log(e);
	if (videoFailReasonCheck > 0) {
		clearInterval(videoFailReasonCheck);
		videoFailReasonCheck = 0;
	}
	switch (e) {
		case YTPlayerState.CUED:
			sendMsg({"type": "ready", "id": playingID});
			isFirstLoad = true;
			break;
		case YTPlayerState.PAUSED:
			if (serverPaused)
				break;
			
			// to avoid pause caused by seeking, delay a little bit and check again if still paused
			setTimeout(function() {
				if (ytPlayer.getPlayerState() == YTPlayerState.PAUSED) {
					sendMsg({"type": "pause", "id": playingID});
				}
			}, 200);
			break;
		case YTPlayerState.ENDED:
			// to avoid autoplay, we need to stop the video before it ends
			// sendMsg({"type": "end", "id": playingID});
			break;
		case YTPlayerState.PLAYING:
			// ignore play events just after the server called play
			if (Math.abs(serverCallPlayTime - Date.now()) > 200) {
				if (isFirstLoad) {
					isFirstLoad = false;
					if (serverPaused) {
						ytPlayer.seekTo(serverPlayTime, true);
						ytPlayer.pauseVideo();
					}
					else
						ytPlayer.seekTo(serverPlayTime + (Date.now() - serverCallPlayTime) / 1000, true);
				}
				else
					sendMsg({"type": "play", "id": playingID, "time": ytPlayer.getCurrentTime()});
			}
			break;
		case YTPlayerState.UNLOADED:
			videoFailReasonCheck = setInterval(() => {
				if (document.getElementsByClassName("ytp-error")[0]) {
					sendMsg({"type": "end", "id": playingID});
					clearInterval(videoFailReasonCheck);
					videoFailReasonCheck = 0;
				}
				// if (document.querySelector("div.ad-showing")) {
					// wasAdPlaying = true;
					// clearInterval(videoFailReasonCheck);
					// videoFailReasonCheck = 0;
				// }
			}, 50);
			break;
	}
}



function getParameterValue(parameterName) {
    var query = window.location.search.substring(1);
    var vars = query.split('&');
    for (var i = 0; i < vars.length; i++) {
        var pair = vars[i].split('=');
        if (decodeURIComponent(pair[0]) == parameterName) {
            return decodeURIComponent(pair[1]);
        }
    }
    return null;
}
var watchTogetherIP = getParameterValue("watchTogetherIP");
if (watchTogetherIP != null) {
	// Inject some HTML elements =======================================================
	
	var $ipInfo = document.createElement("label");
	$ipInfo.id = "connecting-ip";
	
	var $playlistContainer = document.createElement("div");
	$playlistContainer.id = "playlist";
	
	let searchField = document.createElement("div");
	searchField.id = "search-field";
	
		var $urlInputLabel = document.createElement("h3");
		$urlInputLabel.for = "url-input";
		$urlInputLabel.innerHTML = "Youtube URL:";
		searchField.appendChild($urlInputLabel);
		
		var $urlInput = document.createElement("textarea");
		$urlInput.id = "url-input";
		$urlInput.rows = "1";
		searchField.appendChild($urlInput);
		
		var $searchVideoButton = document.createElement("button");
		$searchVideoButton.id = "video-button";
		$searchVideoButton.className = "search-button";
		$searchVideoButton.innerHTML = "Video";
		$searchVideoButton.addEventListener("click", function() {
			try {
				var vID = $urlInput.value.match(/youtu(?:.*\/v\/|.*v\=|\.be\/)([A-Za-z0-9_\-]{11})/)[1];
			}
			catch (e) {
				alert("Invalid video url!");
				return;
			}
			if (vID === undefined) {
				alert("Invalid video url!");
				return;
			}
			
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
						searchResultType = 0;
						searchResultVideoID = vID;
						// cache data for less html request
						cacheVideoInfo[vID] = { title: data.title, author: data.author_name };
					});
			}
			else {
				$searchResultFrame.style.visibility = "visible";
				
				$searchResultImg.src = imageUrl;
				$searchResultTitle.innerHTML = cacheData.title;
				$searchResultAuthor.innerHTML = cacheData.author;
				searchResultType = 0;
				searchResultVideoID = vID;
			}
			$urlInput.value = "";
		});
		searchField.appendChild($searchVideoButton);
		
		var $searchPlaylistButton = document.createElement("button");
		$searchPlaylistButton.id = "playlist-button";
		$searchPlaylistButton.className = "search-button";
		$searchPlaylistButton.innerHTML = "Playlist";
		$searchPlaylistButton.addEventListener("click", function() {
			sendMsg({"type": "search", "url": $urlInput.value});
			$urlInput.value = "";
		});
		searchField.appendChild($searchPlaylistButton);
	
	var $searchResultFrame = document.createElement("div");
	$searchResultFrame.id = "search-result";
	
		var $addVideoButton = document.createElement("button");
		$addVideoButton.id = "add-video-button";
		$addVideoButton.title = "Click to add to playlist";
		$addVideoButton.addEventListener("click", function() {
			if (searchResultType == 0)
				sendMsg({"type": "add", "vid": searchResultVideoID});
			else if (searchResultType == 1) {
				sendMsg({"type": "add_list", "lid": searchResultPlaylistID});
			}
		});
		$searchResultFrame.appendChild($addVideoButton);
		
			var $searchResultImg = document.createElement("img");
			$searchResultImg.id = "search-result-img";
			$addVideoButton.appendChild($searchResultImg);
			
		var $searchResultTitle = document.createElement("h1");
		$searchResultTitle.id = "search-result-title";
		$searchResultFrame.appendChild($searchResultTitle);
		
		var $searchResultAuthor = document.createElement("h2");
		$searchResultAuthor.id = "search-result-author";
		$searchResultFrame.appendChild($searchResultAuthor);
		
	var copyURLButton = document.createElement("button");
	copyURLButton.innerHTML = "Copy URL";
	copyURLButton.style.visibility = "hidden";
	copyURLButton.style.position = "absolute";
	copyURLButton.addEventListener("click", function(e) {
		e.stopPropagation();
		onClickOutside(e);
		
		const el = document.createElement("textarea");
		el.value = `https://www.youtube.com/watch?v=${rightClickVideoID}`;
		document.body.appendChild(el);
		el.select();
		document.execCommand("copy");
		document.body.removeChild(el);
		
		setTimeout(() => {alert("Video URL Copied!");}, 1);
	});
		
	// =================================================================================
	
	document.addEventListener("keydown", function(event) {
		if (event.code == "KeyN" || event.code == "KeyI" || event.code == "KeyT") {  // Shift+N / I / T on youtube is nextVideo / miniPlayer / sizeControl
			event.preventDefault();
			event.stopPropagation();
		}
	});
	window.onload = () => {
		$ipInfo.innerHTML = "Connecting to " + watchTogetherIP;

		ws = new WebSocket("ws://" + watchTogetherIP);
		ws.onopen = onConnected;
		ws.onerror = onConnectFailed;
		ws.onmessage = onReceive;
	}
	window.onbeforeunload = function() {
		if (ws !== undefined)
			ws.close();
	}
	
	initCheck = setInterval(() => {
		document.title = "Watch Together Extension";
		ytPlayer = document.getElementById("movie_player");
		if (ytPlayer != undefined && !ytPlayerReady) {
			ytPlayer.addEventListener("onStateChange", onPlayerStateChanged);
			ytPlayer.loadVideoById("0");
			ytPlayerReady = true;
		}
		htmlVideo = document.getElementsByTagName("video")[0];
		
		let topBar = document.getElementById("masthead-container");
		let rightFrame = document.getElementById("related");
		let belowFrame = document.getElementById("below");
		let nextButton = document.getElementsByClassName("ytp-next-button")[0];
		let miniPlayerButton = document.getElementsByClassName("ytp-miniplayer-button")[0];
		let sizeControlButton = document.getElementsByClassName("ytp-size-button")[0];
		if (!ytPlayer || !htmlVideo || !rightFrame || !topBar || !belowFrame || !nextButton || !miniPlayerButton || !sizeControlButton)
			return;
		
		topBar.innerHTML = "";
		topBar.appendChild($ipInfo);
		topBar.appendChild(copyURLButton);
		
		let tmpElement = rightFrame;
		rightFrame = rightFrame.parentElement;
		rightFrame.removeChild(tmpElement);
		rightFrame.appendChild($playlistContainer);
		
		belowFrame.style.visibility = "hidden";
		belowFrame.prepend(searchField, $searchResultFrame);
		
		nextButton.parentElement.removeChild(nextButton);
		miniPlayerButton.parentElement.removeChild(miniPlayerButton);
		sizeControlButton.parentElement.removeChild(sizeControlButton);
		
		// stop the video before it ends to avoid autoplay
		htmlVideo.ontimeupdate = () => {
			if (ytPlayer.getPlayerState() == YTPlayerState.PLAYING && htmlVideo.duration - htmlVideo.currentTime < 0.3) {
				sendMsg({"type": "end", "id": playingID});
				ytPlayer.cancelPlayback();
			}
		}
		
		clearInterval(initCheck);
	}, 100);
}