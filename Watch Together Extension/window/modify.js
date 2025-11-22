const sanitizePolicy = trustedTypes.createPolicy('sanitizePolicy', { createHTML: (string) => string });

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

var searchResultPlaylist = [];
var playlistPreviewItems = [];

var ws = undefined;
var serverPlaylist = [];  // playlist data from server
var playlistObjs = [];  // client playlist objects
var playingID = -1;
var serverCallPlayTime = -1;
var serverPlayTime = -1;
var serverPaused = false;
var serverPlayMode = PlayMode.DEFAULT;
var serverPlaybackRate = 1;
var serverSelfLoop = false;
var serverHasPin = false;
var cacheVideoInfo = {};

var userList = [];
var selfUserID;
var userListFolded = false;

var rightClickVideoIdx = -1;

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
	rightClickMenu.style.visibility = "hidden";
	document.removeEventListener("click", onClickOutside);
}

function videoRightClick(e) {
	e.preventDefault();
	e.stopPropagation();
	document.addEventListener("click", onClickOutside);
	
	const rect = e.target.getBoundingClientRect();
	rightClickMenu.style.visibility = "visible";
	rightClickMenu.style.top = `${rect.top + e.offsetY + 3}px`;
	rightClickMenu.style.left  = `${rect.left + e.offsetX + 3}px`;
	
	rightClickVideoIdx = parseInt(e.currentTarget.getAttribute("video-idx"));
	
	let isPinnedVideo = serverHasPin && rightClickVideoIdx == playlistObjs.length - 1;
	if (isPinnedVideo)
		pinBottomButton.innerHTML = sanitizePolicy.createHTML("Remove Pin");
	else
		pinBottomButton.innerHTML = sanitizePolicy.createHTML("Pin to Bottom");
	
	if (isPinnedVideo || rightClickVideoIdx == playingID || rightClickVideoIdx == playingID + 1)
		moveToNextButton.style.display = "None";
	else
		moveToNextButton.style.display = null;
	
	if (isPinnedVideo || rightClickVideoIdx == playingID)
		interruptButton.style.display = "None";
	else
		interruptButton.style.display = null;
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
	$ipInfo.innerHTML = sanitizePolicy.createHTML("Connected to " + watchTogetherIP);
	sendMsg({"type": "name", "name": nickName});
};
// on WebSocket connect failed
// function onConnectFailed() {
	// $ipInfo.innerHTML = sanitizePolicy.createHTML("Can not connect to " + watchTogetherIP);
// };
// on WebSocket server closed
function onServerClosed() {
	if (selfClosing)
		return;
	
	alert("Remote server closed!");
	history.back();
};

function refreshPlaylistCount() {
	if (playingID < 0)
		playlistCountInfo.innerHTML = sanitizePolicy.createHTML(`- / ${serverPlaylist.length}`);
	else
		playlistCountInfo.innerHTML = sanitizePolicy.createHTML(`${playingID + 1} / ${serverPlaylist.length}`);
}
function updatePlaylistOverlay(idx) {
	if (idx == playingID) {
		playlistObjs[idx].overlayObj.style.visibility = "visible";
		playlistObjs[idx].overlayObj.style["text-decoration"] = null;
		playlistObjs[idx].overlayObj.innerHTML = sanitizePolicy.createHTML("playing");
	}
	else {
		if (serverPlaylist[idx].invalid == "")
			playlistObjs[idx].overlayObj.style.visibility = "hidden";
		else {
			playlistObjs[idx].overlayObj.style.visibility = "visible";
			playlistObjs[idx].overlayObj.style["text-decoration"] = "line-through";
			playlistObjs[idx].overlayObj.innerHTML = sanitizePolicy.createHTML(serverPlaylist[idx].invalid);
		}
	}
}
function rebuildPlaylist() {
	$playlistContainer.innerHTML = sanitizePolicy.createHTML("");
	draggingIdx = -1;  // reset drag event
	playlistObjs = [];
	for (let i = 0; i < serverPlaylist.length; i++) {
		const videoID = serverPlaylist[i].vid;
		const userName = serverPlaylist[i].user;
		
		var btnFrame = document.createElement("div");
		btnFrame.className = "playlist-item";
		btnFrame.setAttribute("video-idx", i);
		btnFrame.addEventListener("contextmenu", videoRightClick);
		
			let btnDrag = document.createElement("button");
			btnDrag.className = "playlist-drag";
			btnDrag.innerHTML = sanitizePolicy.createHTML("⠿");
			if (!serverHasPin || i < serverPlaylist.length - 1) {
				btnFrame.addEventListener("mouseover", videoDragEnter);
				btnFrame.addEventListener("mouseout", videoDragLeave);
				
				btnDrag.addEventListener("mousedown", videoDragMouseDown);
			}
			else {
				btnDrag.style.color = "red";
				btnDrag.style.cursor = "not-allowed";
				btnFrame.style["border-top"] = "4px solid yellow";
			}
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
					fromUser.innerHTML = sanitizePolicy.createHTML(userName);
					infoFrame.appendChild(fromUser);
			
			let playingOverlay = document.createElement("div");
			playingOverlay.className = "playing-overlay";
			btnFrame.appendChild(playingOverlay);
			
			let btnRemove = document.createElement("button");
			btnRemove.className = "playlist-remove";
			btnRemove.innerHTML = sanitizePolicy.createHTML("X");
			btnRemove.addEventListener('click', function(event) {
				sendMsg({"type": "remove", "id": i});
			});
			btnFrame.appendChild(btnRemove);
		
		$playlistContainer.appendChild(btnFrame);
		playlistObjs.push({ obj: btnFrame, overlayObj: playingOverlay });
		updatePlaylistOverlay(i);
		
		// write video title and author
		let cacheData = cacheVideoInfo[videoID];
		if (cacheData === undefined) {
			fetch(`https://noembed.com/embed?dataType=json&url=https://www.youtube.com/watch?v=${videoID}`)
				.then(res => res.json())
				.then(data => {
					title.innerHTML = sanitizePolicy.createHTML(data.title);
					author.innerHTML = sanitizePolicy.createHTML(data.author_name);
					// cache data for less html request
					cacheVideoInfo[videoID] = { title: data.title, author: data.author_name };
				});
		}
		else {
			title.innerHTML = sanitizePolicy.createHTML(cacheData.title);
			author.innerHTML = sanitizePolicy.createHTML(cacheData.author);
		}
	}
	
	if (playlistObjs.length == 0)
		$playlistContainer.innerHTML = sanitizePolicy.createHTML("Search and add videos to playlist");
	
	refreshPlaylistCount();
}
// on receive WebSocket server msg
function onReceive(e) {
	var msg = JSON.parse(e.data);
	switch (msg.type) {
		case "list":
			playingID = msg.id;
			serverHasPin = msg.pin;
			serverPlaylist = msg.playlist;
			rebuildPlaylist();
			
			if (ytPlayerReady) {
				if (playingID < 0)
					ytPlayer.cueVideoById("0");
				else if (!msg.update_only)
					ytPlayer.cueVideoById(serverPlaylist[playingID].vid);
			}
			break;
			
		case "add":
			playingID = msg.id;
			for (let i = 0; i < msg.list.length; i++)
				serverPlaylist.splice(msg.at + i, 0, msg.list[i]);
			rebuildPlaylist();
			
			if (ytPlayerReady && !msg.update_only)
				ytPlayer.cueVideoById(serverPlaylist[playingID].vid);
			break;
			
		case "remove":
			playingID = msg.id;
			serverPlaylist.splice(msg.at, 1);
			rebuildPlaylist();
			
			if (ytPlayerReady && !msg.update_only) {
				if (playingID >= 0)
					ytPlayer.cueVideoById(serverPlaylist[playingID].vid);
				else
					ytPlayer.cueVideoById("0");
			}
			break;
			
		case "move":
			playingID = msg.id;
			serverPlaylist.splice(msg.to, 0, serverPlaylist.splice(msg.from, 1)[0]);
			rebuildPlaylist();
			
			if (ytPlayerReady && !msg.update_only)
				ytPlayer.cueVideoById(serverPlaylist[playingID].vid);
			break;
			
		case "pin":
			playingID = msg.id;
			if (msg.pin < 0) {
				serverHasPin = false;
			}
			else {
				serverHasPin = true;
				serverPlaylist.splice(serverPlaylist.length - 1, 0, serverPlaylist.splice(msg.pin, 1)[0]);
			}
			rebuildPlaylist();
			break;
			
		case "load":
			if (!ytPlayerReady)
				break;
			
			playingID = msg.id;
			// update playing notation
			for (let i = 0; i < playlistObjs.length; i++)
				updatePlaylistOverlay(i);
			refreshPlaylistCount();
			
			if (playingID >= 0)
				ytPlayer.cueVideoById(serverPlaylist[playingID].vid);
			else
				ytPlayer.cueVideoById("0");
			break;
			
		case "play":
			if (!ytPlayerReady)
				break;
			if (msg.id != playingID)
				break;
			
			serverPaused = msg.paused;
			serverCallPlayTime = Date.now();
			serverPlayTime = msg.time;
			if (Math.abs(ytPlayer.getCurrentTime() - serverPlayTime) > 0.5) {
				// do not seekTo when already paused
				if (!(serverPaused && ytPlayer.getPlayerState() == YTPlayerState.PAUSED))
					ytPlayer.seekTo(Math.min(serverPlayTime, ytPlayer.getDuration() - 1), true);
			}
			
			serverPlaybackRate = msg.rate;
			if (Math.abs(ytPlayer.getPlaybackRate() - serverPlaybackRate) > 0.01)
				ytPlayer.setPlaybackRate(serverPlaybackRate);
			
			if (serverPaused) {
				if (!isFirstLoad)  // directly pause the video will cause the play event never fires (which means you don't know when to fix the timeline) when there is no ads
					ytPlayer.pauseVideo();
			}
			else
				ytPlayer.playVideo();
			
			break;
			
		case "search":
			searchResultPlaylist = msg.list;
			if (searchResultPlaylist.length == 0) {
				alert("Invalid playlist url!");
				break;
			}
			
			showSearchResult(msg.icon, msg.title, searchResultPlaylist.length + " clip(s)");
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
			if (userList.length < msg.list.length)
				window.postMessage({"type": "join_sound"});
			else if (userList.length > msg.list.length)
				window.postMessage({"type": "leave_sound"});
			
			userList = msg.list;
			userList.sort(function(a, b) {
				return a.id - b.id;
			});
			
			userListFrame.innerHTML = sanitizePolicy.createHTML("");
			for (let i = 0; i < userList.length; i++) {
				let userElement = document.createElement("div");
				userElement.classList.add("user");
				userElement.innerHTML = sanitizePolicy.createHTML(`[${userList[i].id}] ${userList[i].name}`);
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
			serverPlaylist[updateID].invalid = msg.by;
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



function showSearchResult(imageUrl, title, author) {
	$searchResultImg.src = imageUrl;
	$searchResultTitle.innerHTML = sanitizePolicy.createHTML(title);
	$searchResultAuthor.innerHTML = sanitizePolicy.createHTML(author);
	$searchResultPreview.innerHTML = sanitizePolicy.createHTML("");
	playlistPreviewItems = [];
	
	for (let i = 0; i < searchResultPlaylist.length; i++) {
		const videoID = searchResultPlaylist[i];
		let previewObj = document.createElement("button");
		previewObj.className = "playlist-preview-item active";
		previewObj.addEventListener("click", function() {
			if (playlistPreviewItems[i].classList.contains("active"))
				playlistPreviewItems[i].classList.remove("active");
			else
				playlistPreviewItems[i].classList.add("active");
		});
		// write video title
		let cacheData = cacheVideoInfo[videoID];
		if (cacheData === undefined) {
			fetch(`https://noembed.com/embed?dataType=json&url=https://www.youtube.com/watch?v=${videoID}`)
				.then(res => res.json())
				.then(data => {
					previewObj.title = data.title;
					// cache data for less html request
					cacheVideoInfo[videoID] = { title: data.title, author: data.author_name };
				});
		}
		else
			previewObj.title = cacheData.title;
		
		$searchResultPreview.appendChild(previewObj);
			
			let img = document.createElement("img");
			img.src = `https://i.ytimg.com/vi/${videoID}/default.jpg`;
			img.className = "search-result-img";
			previewObj.appendChild(img);
		
		playlistPreviewItems.push(previewObj);
	}
	
	$searchResultFrame.style.visibility = "visible";
	$searchResultFrame.scrollIntoView({
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
	window.addEventListener("message", (event) => {
		let msg = event.data;
		switch (msg.type) {
			case "init_volume":
				soundSlider.value = msg.value;
				soundVolumeText.innerHTML = sanitizePolicy.createHTML(`${msg.value}%`);
				break;
		}
	});
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
		renameButton.innerHTML = sanitizePolicy.createHTML("rename");
		renameButton.addEventListener("click", function() {
			if (renameInput.value != nickName)
				sendMsg({"type": "name", "name": renameInput.value});
		});
		renameFrame.appendChild(renameButton);
	
	var foldUserListButton = document.createElement("button");
	foldUserListButton.id = "fold-user-button";
	foldUserListButton.innerHTML = sanitizePolicy.createHTML("﹀");
	foldUserListButton.style.bottom = "200px";
	foldUserListButton.addEventListener("click", function() {
		if (userListFolded) {
			foldUserListButton.innerHTML = sanitizePolicy.createHTML("﹀");
			userListFrame.style.visibility = "visible";
			renameFrame.style.visibility = "visible";
			foldUserListButton.style.bottom = "200px";
			userListFolded = false;
		}
		else {
			foldUserListButton.innerHTML = sanitizePolicy.createHTML("︿");
			userListFrame.style.visibility = "hidden";
			renameFrame.style.visibility = "hidden";
			foldUserListButton.style.bottom = "0";
			userListFolded = true;
		}
	});
	
	let settingButton = document.createElement("button");
	settingButton.id = "setting-button";
	settingButton.innerHTML = sanitizePolicy.createHTML("⚙︎");
	settingButton.addEventListener("click", function() {
		settingFrame.style.visibility = "visible";
	});
	
	var settingFrame = document.createElement("button");
	settingFrame.className = "mask-button";
	settingFrame.style.visibility = "hidden";
	settingFrame.addEventListener("click", function(e) {
		e.stopPropagation();
		settingFrame.style.visibility = "hidden";
	});
	
		let settingPanel = document.createElement("div");
		settingPanel.id = "setting-panel";
		settingPanel.onclick = function(e) { e.stopPropagation(); }
		settingFrame.appendChild(settingPanel);
		
			let soundSliderTitle = document.createElement("h3");
			soundSliderTitle.innerHTML = sanitizePolicy.createHTML("System Sound Volume");
			soundSliderTitle.style.color = "#fff";
			settingPanel.appendChild(soundSliderTitle);
			
			let soundSlider = document.createElement("input");
			soundSlider.type = "range";
			soundSlider.className = "slider";
			soundSlider.min = "0";
			soundSlider.max = "100";
			soundSlider.value = "40";
			soundSlider.oninput = function(e) {
				soundVolumeText.innerHTML = sanitizePolicy.createHTML(`${this.value}%`);
				window.postMessage({"type": "sound_volume", "value": this.value});
			}
			settingPanel.appendChild(soundSlider);
		
			var soundVolumeText = document.createElement("span");
			soundVolumeText.innerHTML = sanitizePolicy.createHTML("40%");
			soundVolumeText.style.color = "#fff";
			settingPanel.appendChild(soundVolumeText);
	
	var $ipInfo = document.createElement("label");
	$ipInfo.id = "connecting-ip";
	
	let playlistControlFrame = document.createElement("div");
	playlistControlFrame.id = "playlist-control";
	
		let leftControlArea = document.createElement("div");
		playlistControlFrame.appendChild(leftControlArea);
		
			let whereButton = document.createElement("button");
			whereButton.className = "playlist-control-button";
			whereButton.innerHTML = sanitizePolicy.createHTML("where");
			whereButton.addEventListener("click", function() {
				if (playingID < 0)
					return;
				playlistObjs[playingID].obj.scrollIntoView({
					behavior: "smooth",
					block: "nearest"
				});
			});
			leftControlArea.appendChild(whereButton);
		
			let nextButton = document.createElement("button");
			nextButton.className = "playlist-control-button";
			nextButton.innerHTML = sanitizePolicy.createHTML("next");
			nextButton.addEventListener("click", function() {
				if (playingID < 0)
					return;
				sendMsg({"type": "load", "id": playingID + 1});
			});
			leftControlArea.appendChild(nextButton);
		
			let clearButton = document.createElement("button");
			clearButton.className = "playlist-control-button";
			clearButton.innerHTML = sanitizePolicy.createHTML("clear");
			clearButton.addEventListener("click", function() {
				sendMsg({"type": "clear"});
			});
			leftControlArea.appendChild(clearButton);
		
		let rightControlArea = document.createElement("div");
		playlistControlFrame.appendChild(rightControlArea);
	
			var loopButton = document.createElement("button");
			loopButton.className = "playlist-control-button";
			loopButton.innerHTML = sanitizePolicy.createHTML("loop");
			loopButton.addEventListener("click", function() {
				if (serverPlayMode == PlayMode.LOOP)
					sendMsg({"type": "playmode", "mode": PlayMode.DEFAULT});
				else
					sendMsg({"type": "playmode", "mode": PlayMode.LOOP});
			});
			rightControlArea.appendChild(loopButton);
		
			var randomButton = document.createElement("button");
			randomButton.className = "playlist-control-button";
			randomButton.innerHTML = sanitizePolicy.createHTML("random");
			randomButton.addEventListener("click", function() {
				if (serverPlayMode == PlayMode.RANDOM)
					sendMsg({"type": "playmode", "mode": PlayMode.DEFAULT});
				else
					sendMsg({"type": "playmode", "mode": PlayMode.RANDOM});
			});
			rightControlArea.appendChild(randomButton);
	
	var $playlistContainer = document.createElement("div");
	$playlistContainer.id = "playlist";
	
	var playlistCountInfo = document.createElement("div");
	playlistCountInfo.id = "playlist-count-text";
	playlistCountInfo.innerHTML = sanitizePolicy.createHTML("- / 0");
	
	let searchField = document.createElement("div");
	searchField.id = "search-field";
	
		var $urlInputLabel = document.createElement("h3");
		$urlInputLabel.for = "url-input";
		$urlInputLabel.innerHTML = sanitizePolicy.createHTML("Youtube URL:");
		searchField.appendChild($urlInputLabel);
		
		var $urlInput = document.createElement("textarea");
		$urlInput.id = "url-input";
		$urlInput.rows = "1";
		searchField.appendChild($urlInput);
		
		var $searchVideoButton = document.createElement("button");
		$searchVideoButton.id = "video-button";
		$searchVideoButton.className = "search-button";
		$searchVideoButton.innerHTML = sanitizePolicy.createHTML("Video");
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
						// cache data for less html request
						cacheVideoInfo[vID] = { title: data.title, author: data.author_name };
						
						searchResultPlaylist = [vID];
						showSearchResult(imageUrl, data.title, data.author_name);
					});
			}
			else {
				searchResultPlaylist = [vID];
				showSearchResult(imageUrl, cacheData.title, cacheData.author);
			}
			$urlInput.value = "";
		});
		searchField.appendChild($searchVideoButton);
		
		var $searchPlaylistButton = document.createElement("button");
		$searchPlaylistButton.id = "playlist-button";
		$searchPlaylistButton.className = "search-button";
		$searchPlaylistButton.innerHTML = sanitizePolicy.createHTML("Playlist");
		$searchPlaylistButton.addEventListener("click", function() {
			sendMsg({"type": "search", "url": $urlInput.value});
			$urlInput.value = "";
		});
		searchField.appendChild($searchPlaylistButton);
	
	var $searchResultFrame = document.createElement("div");
	$searchResultFrame.id = "search-result";
	
		var $searchResultBasic = document.createElement("div");
		$searchResultBasic.id = "search-result-basic";
		$searchResultFrame.appendChild($searchResultBasic);
			
			var $searchResultImg = document.createElement("img");
			$searchResultImg.className = "search-result-img";
			$searchResultBasic.appendChild($searchResultImg);
			
			var $searchResultTitle = document.createElement("p");
			$searchResultTitle.className = "search-result-text bold";
			$searchResultBasic.appendChild($searchResultTitle);
			
			var $searchResultAuthor = document.createElement("p");
			$searchResultAuthor.className = "search-result-text";
			$searchResultBasic.appendChild($searchResultAuthor);
			
			let addVideoOperationFrame = document.createElement("button");
			addVideoOperationFrame.className = "search-operation";
			addVideoOperationFrame.disabled = true;
			$searchResultBasic.appendChild(addVideoOperationFrame);
		
				let addVideoButton = document.createElement("button");
				addVideoButton.className = "search-operation-button";
				addVideoButton.innerHTML = sanitizePolicy.createHTML("Add Video(s)");
				addVideoButton.addEventListener("click", function() {
					let tempList = [];
					for (let i = 0; i < playlistPreviewItems.length; i++) {
						if (playlistPreviewItems[i].classList.contains("active"))
							tempList.push(searchResultPlaylist[i]);
					}
					sendMsg({"type": "add", "vid": tempList, "mode": 0});
				});
				addVideoOperationFrame.appendChild(addVideoButton);
			
				let addNextVideoButton = document.createElement("button");
				addNextVideoButton.className = "search-operation-button";
				addNextVideoButton.innerHTML = sanitizePolicy.createHTML("Insert Next Video(s)");
				addNextVideoButton.addEventListener("click", function() {
					if (serverHasPin && playingID == serverPlaylist.length - 1) {
						alert("Can not insert videos next to the pinned video!");
						return;
					}
					
					let tempList = [];
					for (let i = 0; i < playlistPreviewItems.length; i++) {
						if (playlistPreviewItems[i].classList.contains("active"))
							tempList.push(searchResultPlaylist[i]);
					}
					sendMsg({"type": "add", "vid": tempList, "mode": 1});
				});
				addVideoOperationFrame.appendChild(addNextVideoButton);
			
				let interruptVideoButton = document.createElement("button");
				interruptVideoButton.className = "search-operation-button";
				interruptVideoButton.innerHTML = sanitizePolicy.createHTML("Interrupt Video(s)");
				interruptVideoButton.addEventListener("click", function() {
					let tempList = [];
					for (let i = 0; i < playlistPreviewItems.length; i++) {
						if (playlistPreviewItems[i].classList.contains("active"))
							tempList.push(searchResultPlaylist[i]);
					}
					sendMsg({"type": "add", "vid": tempList, "mode": 2});
				});
				addVideoOperationFrame.appendChild(interruptVideoButton);
			
			let playlistOperationFrame = document.createElement("button");
			playlistOperationFrame.className = "search-operation";
			playlistOperationFrame.disabled = true;
			$searchResultBasic.appendChild(playlistOperationFrame);
		
				let selectAllButton = document.createElement("button");
				selectAllButton.className = "search-operation-button";
				selectAllButton.innerHTML = sanitizePolicy.createHTML("Select All");
				selectAllButton.addEventListener("click", function() {
					for (let i = 0; i < playlistPreviewItems.length; i++)
						playlistPreviewItems[i].classList.add("active");
				});
				playlistOperationFrame.appendChild(selectAllButton);
			
				let deselectAllButton = document.createElement("button");
				deselectAllButton.className = "search-operation-button";
				deselectAllButton.innerHTML = sanitizePolicy.createHTML("Deselect All");
				deselectAllButton.addEventListener("click", function() {
					for (let i = 0; i < playlistPreviewItems.length; i++)
						playlistPreviewItems[i].classList.remove("active");
				});
				playlistOperationFrame.appendChild(deselectAllButton);
		
		var $searchResultPreview = document.createElement("div");
		$searchResultPreview.id = "playlist-preview";
		$searchResultFrame.appendChild($searchResultPreview);
		
	
	var rightClickMenu = document.createElement("div");
	rightClickMenu.id = "right-click-menu";
	
		let copyURLButton = document.createElement("button");
		copyURLButton.innerHTML = sanitizePolicy.createHTML("Copy URL");
		copyURLButton.className = "right-click-menu-item";
		copyURLButton.addEventListener("click", function(e) {
			e.stopPropagation();
			onClickOutside(e);
			
			const el = document.createElement("textarea");
			el.value = `https://www.youtube.com/watch?v=${serverPlaylist[rightClickVideoIdx].vid}`;
			document.body.appendChild(el);
			el.select();
			document.execCommand("copy");
			document.body.removeChild(el);
			
			setTimeout(() => {alert("Video URL Copied!");}, 10);
		});
		rightClickMenu.appendChild(copyURLButton);
	
		var pinBottomButton = document.createElement("button");
		pinBottomButton.className = "right-click-menu-item";
		pinBottomButton.addEventListener("click", function(e) {
			e.stopPropagation();
			onClickOutside(e);
			
			if (serverHasPin && rightClickVideoIdx == playlistObjs.length - 1)
				sendMsg({"type": "pin", "id": -1});
			else
				sendMsg({"type": "pin", "id": rightClickVideoIdx});
		});
		rightClickMenu.appendChild(pinBottomButton);
	
		var moveToNextButton = document.createElement("button");
		moveToNextButton.innerHTML = sanitizePolicy.createHTML("Move to next");
		moveToNextButton.className = "right-click-menu-item";
		moveToNextButton.addEventListener("click", function(e) {
			e.stopPropagation();
			onClickOutside(e);
			
			if (playingID < 0 || playingID == rightClickVideoIdx)
				return;
			
			let targetID = rightClickVideoIdx < playingID ? playingID : playingID + 1;
			sendMsg({"type": "move", "from": rightClickVideoIdx, "to": targetID});
		});
		rightClickMenu.appendChild(moveToNextButton);
	
		var interruptButton = document.createElement("button");
		interruptButton.innerHTML = sanitizePolicy.createHTML("Interrupt");
		interruptButton.className = "right-click-menu-item";
		interruptButton.addEventListener("click", function(e) {
			e.stopPropagation();
			onClickOutside(e);
			
			let targetID = playingID < 0 ? rightClickVideoIdx : playingID;
			if (targetID > rightClickVideoIdx)
				targetID--;
			sendMsg({"type": "move", "from": rightClickVideoIdx, "to": targetID, "interrupt": true});
		});
		rightClickMenu.appendChild(interruptButton);
		
	// =================================================================================
	
	document.addEventListener("keydown", function(event) {
		if (event.code == "KeyN" || event.code == "KeyI" || event.code == "KeyT") {  // Shift+N / I / T on youtube is nextVideo / miniPlayer / sizeControl
			if (document.activeElement.tagName.toLowerCase() == "textarea")
				return;
			
			event.preventDefault();
			event.stopPropagation();
		}
	});
	window.addEventListener("load", () => {
		$ipInfo.innerHTML = sanitizePolicy.createHTML("Connecting to " + watchTogetherIP);

		ws = new WebSocket("wss://" + watchTogetherIP);
		ws.onopen = onConnected;
		ws.onerror = onServerClosed; //onConnectFailed;
		ws.onclose = onServerClosed;
		ws.onmessage = onReceive;
	});
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
		if (!ytPlayer || !htmlVideo || !rightFrame || !topBar || !belowFrame)
			return;
		
		document.body.appendChild(foldUserListButton);
		document.body.appendChild(userListFrame);
		document.body.appendChild(renameFrame);
		document.body.appendChild(settingButton);
		document.body.appendChild(settingFrame);
		
		topBar.innerHTML = sanitizePolicy.createHTML("");
		topBar.appendChild($ipInfo);
		topBar.appendChild(rightClickMenu);
		
		let tmpElement = rightFrame;
		rightFrame = rightFrame.parentElement;
		rightFrame.removeChild(tmpElement);
		rightFrame.appendChild(playlistControlFrame);
		rightFrame.appendChild($playlistContainer);
		rightFrame.appendChild(playlistCountInfo);
		
		belowFrame.style.visibility = "hidden";
		belowFrame.prepend(searchField, $searchResultFrame);
		
		nextButton?.parentElement.removeChild(nextButton);
		miniPlayerButton?.parentElement.removeChild(miniPlayerButton);
		sizeControlButton?.parentElement.removeChild(sizeControlButton);
		
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