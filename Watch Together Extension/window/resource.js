var joinSound = new Audio(chrome.runtime.getURL("sounds/user_join.mp3"));
joinSound.volume = 0.4;
var leaveSound = new Audio(chrome.runtime.getURL("sounds/user_leave.mp3"));
leaveSound.volume = 0.4;

window.addEventListener("message", (event) => {
	switch (event.data) {
		case "join_sound":
			joinSound.play();
			break;
		case "leave_sound":
			leaveSound.play();
			break;
	}
});