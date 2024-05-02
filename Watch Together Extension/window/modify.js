const YTPlayerState = {
	UNLOADED: -1,
	ENDED: 0,
	PLAYING: 1,
	PAUSED: 2,
	BUFFERING: 3,
	CUED: 5
}

const PlayMode = {
	DEFAULT: 0,
	LOOP: 1,
	RANDOM: 2
}

var selfClosing = false;

var initCheck;
var ytPlayer;
var htmlVideo;
var ytPlayerReady = false;

var isFirstLoad = false;
var bufferStartTime = 0;

var searchResultType = -1;  // 0 = video, 1 = playlist
var searchResultVideoID = undefined;
var searchResultPlaylistID = undefined;

var ws = undefined;
var playlist = [];
var playingID = -1;
var serverCallPlayTime = -1;
var serverPlayTime = -1;
var serverPaused = false;
var serverPlayMode = PlayMode.DEFAULT;
var serverPlaybackRate = 1;
var serverSelfLoop = false;
var cacheVideoInfo = {};

var userList;
var selfUserID;
var userListFolded = true;

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
	copyURLButton.style.top = `${rect.top + e.offsetY + 3}px`;
	copyURLButton.style.left  = `${rect.left + e.offsetX + 3}px`;
	
	rightClickVideoID = playlist[parseInt(e.currentTarget.getAttribute("video-idx"))].vID;
}

// ============= WebSocket server protocol ============= //

// send msg to WebSocket server
function sendMsg(msg) {
	if (ws === undefined)
		return;
	
	var data = JSON.stringify(msg);
	ws.send(data);
}
// on WebSocket connected
function onConnected() {
	$ipInfo.innerHTML = "Connected to " + watchTogetherIP;
	sendMsg({"type": "name", "name": nickName});
};
// on WebSocket connect failed
// function onConnectFailed() {
	// $ipInfo.innerHTML = "Can not connect to " + watchTogetherIP;
// };
// on WebSocket server closed
function onServerClosed() {
	if (selfClosing)
		return;
	
	alert("Remote server closed!");
	history.back();
};

function updatePlaylistOverlay(idx) {
	if (idx == playingID) {
		playlist[idx].overlayObj.style.visibility = "visible";
		playlist[idx].overlayObj.style["text-decoration"] = null;
		playlist[idx].overlayObj.innerHTML = "playing";
	}
	else {
		if (playlist[idx].invalid == "")
			playlist[idx].overlayObj.style.visibility = "hidden";
		else {
			playlist[idx].overlayObj.style.visibility = "visible";
			playlist[idx].overlayObj.style["text-decoration"] = "line-through";
			playlist[idx].overlayObj.innerHTML = playlist[idx].invalid;
		}
	}
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
				const videoID = msg.playlist[i].vid;
				const userName = msg.playlist[i].user;
				const invalidUser = msg.playlist[i].invalid;
				
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
						if (i != playingID)
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
							title.style.height = "60%";
							infoFrame.appendChild(title);
							
							let author = document.createElement("p");
							author.className = "playlist-item-info-text";
							author.style.height = "20%";
							author.style["text-wrap"] = "nowrap";
							infoFrame.appendChild(author);
							
							let fromUser = document.createElement("p");
							fromUser.className = "playlist-item-info-text";
							fromUser.style.height = "20%";
							fromUser.style["text-wrap"] = "nowrap";
							fromUser.innerHTML = userName;
							infoFrame.appendChild(fromUser);
					
					let playingOverlay = document.createElement("div");
					playingOverlay.className = "playing-overlay";
					btnFrame.appendChild(playingOverlay);
					
					let btnRemove = document.createElement("button");
					btnRemove.className = "playlist-remove";
					btnRemove.innerHTML = "X";
					btnRemove.addEventListener('click', function(event) {
						sendMsg({"type": "remove", "id": i});
					});
					btnFrame.appendChild(btnRemove);
				
				$playlistContainer.appendChild(btnFrame);
				playlist.push({ vID: videoID, obj: btnFrame, overlayObj: playingOverlay, invalid: invalidUser });
				updatePlaylistOverlay(i);
				
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
			if (playlist.length == 0)
				$playlistContainer.innerHTML = "Search and add videos to playlist";
				
			
			if (ytPlayerReady) {
				if (playingID < 0) {
					// stop current playing video
					if (ytPlayer.getPlayerState() == YTPlayerState.PLAYING || ytPlayer.getPlayerState() == YTPlayerState.PAUSED) {
						ytPlayer.seekTo(0);
						ytPlayer.cancelPlayback();
					}
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
			for (let i = 0; i < playlist.length; i++)
				updatePlaylistOverlay(i);
			
			if (playingID >= 0)
				ytPlayer.cueVideoById(playlist[playingID].vID);
			else
				ytPlayer.cueVideoById("0");
			break;
			
		case "play":
			if (!ytPlayerReady)
				break;
			if (msg.id != playingID)
				break;
			
			serverCallPlayTime = Date.now();
			serverPlayTime = msg.time;
			if (Math.abs(ytPlayer.getCurrentTime() - serverPlayTime) > 0.5)
				ytPlayer.seekTo(Math.min(serverPlayTime, ytPlayer.getDuration() - 1), true);
			
			serverPlaybackRate = msg.rate;
			if (Math.abs(ytPlayer.getPlaybackRate() - serverPlaybackRate) > 0.01)
				ytPlayer.setPlaybackRate(serverPlaybackRate);
			
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
			
			$searchResultImg.src = msg.icon;
			$searchResultTitle.innerHTML = msg.title;
			$searchResultAuthor.innerHTML = msg.len + " clip(s)";
			searchResultPlaylistID = msg.id;
			searchResultType = 1;
			
			showSearchResult();
			break;
			
		case "playmode":
			if (serverPlayMode != msg.mode) {
				serverPlayMode = msg.mode;
				if (serverPlayMode == PlayMode.LOOP)
					loopButton.classList.add("active");
				else
					loopButton.classList.remove("active");
				
				if (serverPlayMode == PlayMode.RANDOM)
					randomButton.classList.add("active");
				else
					randomButton.classList.remove("active");
			}
			if (serverSelfLoop != msg.self_loop) {
				serverSelfLoop = msg.self_loop;
				ytPlayer.setLoopVideo(serverSelfLoop);
			}
			break;
			
		case "uid":
			selfUserID = msg.id;
			break;
			
		case "userlist":
			userList = msg.list;
			userList.sort(function(a, b) {
				return a.id - b.id;
			});
			
			userListFrame.innerHTML = "";
			for (let i = 0; i < userList.length; i++) {
				let userElement = document.createElement("div");
				userElement.classList.add("user");
				userElement.innerHTML = `[${userList[i].id}] ${userList[i].name}`;
				if (userList[i].id == selfUserID) {
					userElement.classList.add("self");
					nickName = userList[i].name;
				}
				userListFrame.appendChild(userElement);
			}
			break;
			
		case "invalid":
		{
			let updateID = msg.id;
			playlist[updateID].invalid = msg.by;
			// update overlay text
			if (updateID != playingID)
				updatePlaylistOverlay(updateID);
				
		}	break;
	}
};

// Youtube Player state changed
function onPlayerStateChanged(e) {
	if (playingID < 0) {
		if (e == YTPlayerState.PLAYING)
			ytPlayer.cueVideoById("0");
		return;
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
			}, 300);
			break;
		case YTPlayerState.ENDED:
			// to avoid autoplay, we need to stop the video before it ends
			// sendMsg({"type": "end", "id": playingID});
			break;
		case YTPlayerState.PLAYING:
			// ignore play events just after the server called play
			let timeNow = Date.now();
			if (timeNow - serverCallPlayTime > 200) {
				if (isFirstLoad || (bufferStartTime > 0 && timeNow - bufferStartTime > 500)) {
					if (serverPaused) {
						ytPlayer.seekTo(serverPlayTime, true);
						ytPlayer.pauseVideo();
					}
					else
						ytPlayer.seekTo(Math.min(serverPlayTime + (Date.now() - serverCallPlayTime) / 1000 * serverPlaybackRate, ytPlayer.getDuration() - 1), true);
				}
				else
					sendMsg({"type": "play", "id": playingID, "time": ytPlayer.getCurrentTime()});
			}
			isFirstLoad = false;
			bufferStartTime = 0;
			break;
		// case YTPlayerState.UNLOADED:
			// break;
		case YTPlayerState.BUFFERING:
			bufferStartTime = Date.now();
			break;
	}
}

// Youtube playback rate changed
function onPlaybackRateChanged(e) {
	if (playingID < 0)
		return;
	if (Math.abs(serverPlaybackRate - e) < 0.01)
		return;
	
	sendMsg({"type": "rate", "rate": e});
}

// Youtube self loop state changed
function onLoopChanged(e) {
	if (playingID < 0)
		return;
	if (e == serverSelfLoop)
		return;
	
	sendMsg({"type": "loop", "state": e});
}

// Youtube video can not play
function onVideoError(e) {
	if (playingID < 0)
		return;
	
	sendMsg({"type": "end", "id": playingID, "error": true});
}



function showSearchResult() {
	$searchResultFrame.style.visibility = "visible";
	$searchResultAuthor.scrollIntoView({
		behavior: "smooth",
		block: "end"
	});
}

function getParameterValue(parameterName) {
	var params = {};
    var query = window.location.search.substring(1);
    var vars = query.split('&');
    for (var i = 0; i < vars.length; i++) {
        var pair = vars[i].split('=');
		params[decodeURIComponent(pair[0])] = decodeURIComponent(pair[1]);
    }
	return params;
}
var urlParams = getParameterValue();
var watchTogetherIP = urlParams["watchTogetherIP"];
var nickName = urlParams["nickname"];
if (watchTogetherIP != null) {
	// Inject some HTML elements =======================================================
	
	var userListFrame = document.createElement("div");
	userListFrame.id = "user-list";
	
	var renameFrame = document.createElement("div");
	renameFrame.id = "rename-frame";
	
		let renameInput = document.createElement("textarea");
		renameInput.id = "rename-input";
		renameInput.value = nickName;
		renameFrame.appendChild(renameInput);
		
		let renameButton = document.createElement("button");
		renameButton.id = "rename-button";
		renameButton.innerHTML = "rename";
		renameButton.addEventListener("click", function() {
			if (renameInput.value != nickName)
				sendMsg({"type": "name", "name": renameInput.value});
		});
		renameFrame.appendChild(renameButton);
	
	var foldUserListButton = document.createElement("button");
	foldUserListButton.id = "fold-user-button";
	foldUserListButton.innerHTML = "︿";
	foldUserListButton.addEventListener("click", function() {
		if (userListFolded) {
			foldUserListButton.innerHTML = "﹀";
			let frameHeight = "200px";
			userListFrame.style.visibility = "visible";
			renameFrame.style.visibility = "visible";
			foldUserListButton.style.bottom = frameHeight;
			userListFolded = false;
		}
		else {
			foldUserListButton.innerHTML = "︿";
			userListFrame.style.visibility = "hidden";
			renameFrame.style.visibility = "hidden";
			foldUserListButton.style.bottom = "0";
			userListFolded = true;
		}
	});
	
	var $ipInfo = document.createElement("label");
	$ipInfo.id = "connecting-ip";
	
	let playlistControlFrame = document.createElement("div");
	playlistControlFrame.id = "playlist-control";
	
		let leftControlArea = document.createElement("div");
		playlistControlFrame.appendChild(leftControlArea);
		
			let whereButton = document.createElement("button");
			whereButton.className = "playlist-control-button";
			whereButton.innerHTML = "where";
			whereButton.addEventListener("click", function() {
				if (playingID < 0)
					return;
				playlist[playingID].obj.scrollIntoView({
					behavior: "smooth",
					block: "nearest"
				});
			});
			leftControlArea.appendChild(whereButton);
		
			let nextButton = document.createElement("button");
			nextButton.className = "playlist-control-button";
			nextButton.innerHTML = "next";
			nextButton.addEventListener("click", function() {
				if (playingID < 0)
					return;
				sendMsg({"type": "load", "id": playingID + 1});
			});
			leftControlArea.appendChild(nextButton);
		
			let clearButton = document.createElement("button");
			clearButton.className = "playlist-control-button";
			clearButton.innerHTML = "clear";
			clearButton.addEventListener("click", function() {
				sendMsg({"type": "clear"});
			});
			leftControlArea.appendChild(clearButton);
		
		let rightControlArea = document.createElement("div");
		playlistControlFrame.appendChild(rightControlArea);
	
			var loopButton = document.createElement("button");
			loopButton.className = "playlist-control-button";
			loopButton.innerHTML = "loop";
			loopButton.addEventListener("click", function() {
				if (serverPlayMode == PlayMode.LOOP)
					sendMsg({"type": "playmode", "mode": PlayMode.DEFAULT});
				else
					sendMsg({"type": "playmode", "mode": PlayMode.LOOP});
			});
			rightControlArea.appendChild(loopButton);
		
			var randomButton = document.createElement("button");
			randomButton.className = "playlist-control-button";
			randomButton.innerHTML = "random";
			randomButton.addEventListener("click", function() {
				if (serverPlayMode == PlayMode.RANDOM)
					sendMsg({"type": "playmode", "mode": PlayMode.DEFAULT});
				else
					sendMsg({"type": "playmode", "mode": PlayMode.RANDOM});
			});
			rightControlArea.appendChild(randomButton);
	
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
						$searchResultImg.src = imageUrl;
						$searchResultTitle.innerHTML = data.title;
						$searchResultAuthor.innerHTML = data.author_name;
						searchResultType = 0;
						searchResultVideoID = vID;
						// cache data for less html request
						cacheVideoInfo[vID] = { title: data.title, author: data.author_name };
						
						showSearchResult();
					});
			}
			else {
				$searchResultImg.src = imageUrl;
				$searchResultTitle.innerHTML = cacheData.title;
				$searchResultAuthor.innerHTML = cacheData.author;
				searchResultType = 0;
				searchResultVideoID = vID;
				
				showSearchResult();
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
	copyURLButton.id = "copy-url-button";
	copyURLButton.addEventListener("click", function(e) {
		e.stopPropagation();
		onClickOutside(e);
		
		const el = document.createElement("textarea");
		el.value = `https://www.youtube.com/watch?v=${rightClickVideoID}`;
		document.body.appendChild(el);
		el.select();
		document.execCommand("copy");
		document.body.removeChild(el);
		
		setTimeout(() => {alert("Video URL Copied!");}, 10);
	});
		
	// =================================================================================
	
	document.addEventListener("keydown", function(event) {
		if (event.code == "KeyN" || event.code == "KeyI" || event.code == "KeyT") {  // Shift+N / I / T on youtube is nextVideo / miniPlayer / sizeControl
			if (document.activeElement.tagName.toLowerCase() == "textarea")
				return;
			
			event.preventDefault();
			event.stopPropagation();
		}
	});
	window.onload = () => {
		$ipInfo.innerHTML = "Connecting to " + watchTogetherIP;

		ws = new WebSocket("wss://" + watchTogetherIP);
		ws.onopen = onConnected;
		ws.onerror = onServerClosed; //onConnectFailed;
		ws.onclose = onServerClosed;
		ws.onmessage = onReceive;
	}
	window.onbeforeunload = function() {
		if (ws !== undefined) {
			selfClosing = true;
			ws.close();
		}
	}
	
	initCheck = setInterval(() => {
		document.title = "Watch Together Extension";
		ytPlayer = document.getElementById("movie_player");
		if (ytPlayer != undefined && !ytPlayerReady) {
			ytPlayer.addEventListener("onStateChange", onPlayerStateChanged);
			ytPlayer.addEventListener("onPlaybackRateChange", onPlaybackRateChanged);
			ytPlayer.addEventListener("onLoopChange", onLoopChanged);
			ytPlayer.addEventListener("onError", onVideoError);
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
		
		document.body.appendChild(foldUserListButton);
		document.body.appendChild(userListFrame);
		document.body.appendChild(renameFrame);
		
		topBar.innerHTML = "";
		topBar.appendChild($ipInfo);
		topBar.appendChild(copyURLButton);
		
		let tmpElement = rightFrame;
		rightFrame = rightFrame.parentElement;
		rightFrame.removeChild(tmpElement);
		rightFrame.appendChild(playlistControlFrame);
		rightFrame.appendChild($playlistContainer);
		
		belowFrame.style.visibility = "hidden";
		belowFrame.prepend(searchField, $searchResultFrame);
		
		nextButton.parentElement.removeChild(nextButton);
		miniPlayerButton.parentElement.removeChild(miniPlayerButton);
		sizeControlButton.parentElement.removeChild(sizeControlButton);
		
		// stop the video before it ends to avoid autoplay
		htmlVideo.ontimeupdate = () => {
			if (ytPlayer.getPlayerState() == YTPlayerState.PLAYING && htmlVideo.duration - htmlVideo.currentTime < 0.5) {
				sendMsg({"type": "end", "id": playingID});
				ytPlayer.cancelPlayback();
			}
		}
		
		clearInterval(initCheck);
	}, 100);
}