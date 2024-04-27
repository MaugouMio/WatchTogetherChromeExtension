import os

try:
	import websockets
except:
	os.system("pip3 install websockets")
	import websockets

try:
	import pytube
except:
	os.system("pip3 install pytube")
	import pytube

import asyncio
import json
import time
import random
import re



YT_VID_REGEX = r"v=([^\&\?\/]*)"
PLAYMODE = {
	"DEFAULT": 0,
	"LOOP": 1,
	"RANDOM": 2
}



current_id = -1
start_time = 0
pause_time = 0
playlist = [ "3cJzGD9xkzg", "lAM3diipp7Y" ]
playlist_info_cache = {}
playmode = PLAYMODE["DEFAULT"]
# playlist data
def GetListPacket(play_id, current_list, update_only = True):
	return json.dumps({
		"type": "list",
		"id": play_id,
		"playlist": current_list,
		"update_only": update_only
	})
# load video but not play yet
def GetLoadPacket(play_id):
	return json.dumps({
		"type": "load",
		"id": play_id
	})
# play video at specified time
def GetPlayPacket(play_id, now, paused):
	return json.dumps({
		"type": "play",
		"id": play_id,
		"time": now,
		"paused": paused
	})
# playlist data request by user
def GetPlaylistPacket(playlist_data):
	if playlist_data == None:
		return json.dumps({ "type": "search", "id": "" })
	else:
		return json.dumps({
			"type": "search",
			"id": playlist_data["id"],
			"title": playlist_data["title"],
			"icon": playlist_data["icon"],
			"len": len(playlist_data["list"]),
		})
# playmode request by user
def GetPlayModePacket(mode):
	return json.dumps({ "type": "playmode", "mode": mode })



USERS = set()
async def process(websocket, path):
	global current_id
	global start_time
	global pause_time
	global playlist
	global playlist_info_cache
	global playmode
	
	USERS.add(websocket)
	
	await websocket.send(GetListPacket(current_id, playlist, False))
	await websocket.send(GetPlayModePacket(playmode))
	async for message in websocket:
		data = json.loads(message)
		print(data)
		protocol = data["type"]
		if protocol == "load":
			current_id = data["id"]
			start_time = 0
			pause_time = 0
			# broadcast load video
			await asyncio.wait([asyncio.create_task(user.send(GetLoadPacket(current_id))) for user in USERS])
		elif protocol == "ready":
			if data["id"] == current_id:
				if start_time == 0:
					start_time = time.time()
					
				if pause_time > 0:
					await websocket.send(GetPlayPacket(current_id, pause_time - start_time, True))
				else:
					await websocket.send(GetPlayPacket(current_id, time.time() - start_time, False))
		elif protocol == "pause":
			if data["id"] == current_id:
				if pause_time == 0:
					pause_time = time.time()
					# broadcast pause
					await asyncio.wait([asyncio.create_task(user.send(GetPlayPacket(current_id, pause_time - start_time, True))) for user in USERS])
		elif protocol == "play":
			if data["id"] == current_id:
				client_played_time = data["time"]
				current_time = time.time()
				if pause_time > 0 or abs(client_played_time - (current_time - start_time)) > 1:  # 1 second diff tolerant
					pause_time = 0  # force start playing
					start_time = current_time - client_played_time
					# broadcast seek to time
					await asyncio.wait([asyncio.create_task(user.send(GetPlayPacket(current_id, client_played_time, False))) for user in USERS])
		elif protocol == "end":
			if data["id"] == current_id:
				start_time = 0
				pause_time = 0
				keep_playing = True
				if playmode == PLAYMODE["RANDOM"]:
					tempList = list(range(len(playlist)))
					tempList[current_id], tempList[-1] = tempList[-1], tempList[current_id]
					current_id = tempList[random.randint(0, len(tempList) - 2)]  # random except the last element (current_id)
				else:
					current_id += 1
					if current_id >= len(playlist):
						if playmode == PLAYMODE["DEFAULT"]:
							current_id = -1  # stop playing
							keep_playing = False
						elif playmode == PLAYMODE["LOOP"]:
							current_id = 0
						
				if keep_playing:
					# delay a little bit and broadcast the next video load msg
					await asyncio.sleep(2)
					await asyncio.wait([asyncio.create_task(user.send(GetLoadPacket(current_id))) for user in USERS])
					
		elif protocol == "add":
			playlist.append(data["vid"])
			# broadcast new playlist
			await asyncio.wait([asyncio.create_task(user.send(GetListPacket(current_id, playlist))) for user in USERS])
		elif protocol == "add_list":
			list_id = data["lid"]
			if list_id in playlist_info_cache:
				playlist += playlist_info_cache[list_id]["list"]
				# broadcast new playlist
				await asyncio.wait([asyncio.create_task(user.send(GetListPacket(current_id, playlist))) for user in USERS])
		elif protocol == "remove":
			target_id = data["id"]
			if target_id >= 0 and target_id < len(playlist):
				del playlist[target_id]
				if target_id == current_id:
					# load next video
					start_time = 0
					pause_time = 0
					if current_id >= len(playlist):
						current_id = -1
					# broadcast new playlist and force load new video
					await asyncio.wait([asyncio.create_task(user.send(GetListPacket(current_id, playlist, False))) for user in USERS])
				else:
					if target_id < current_id:
						current_id -= 1
					# broadcast new playlist
					await asyncio.wait([asyncio.create_task(user.send(GetListPacket(current_id, playlist))) for user in USERS])
		elif protocol == "move":
			from_id = data["from"]
			to_id = data["to"]
			if from_id >= 0 and from_id < len(playlist) and to_id >= 0 and to_id < len(playlist):
				if from_id != to_id:
					targetVideo = playlist[from_id]
					
					if from_id < to_id:
						for i in range(from_id, to_id):
							playlist[i] = playlist[i + 1]
							
						if current_id == from_id:
							current_id = to_id
						elif current_id <= to_id:
							current_id -= 1
					else:
						for i in range(from_id, to_id, -1):
							playlist[i] = playlist[i - 1]
							
						if current_id == from_id:
							current_id = to_id
						elif current_id >= to_id:
							current_id += 1
							
					playlist[to_id] = targetVideo
					# broadcast new playlist
					await asyncio.wait([asyncio.create_task(user.send(GetListPacket(current_id, playlist))) for user in USERS])
		elif protocol == "clear":
			playlist.clear()
			start_time = 0
			pause_time = 0
			current_id = -1
			# broadcast new playlist and force load new video
			await asyncio.wait([asyncio.create_task(user.send(GetListPacket(current_id, playlist, False))) for user in USERS])
		
		elif protocol == "search":
			try:
				playlist_obj = pytube.Playlist(data["url"])
				playlist_id = playlist_obj.playlist_id
				if playlist_id not in playlist_info_cache:
					playlist_title = playlist_obj.title
					video_id_list = [re.search(YT_VID_REGEX, url).group(1) for url in playlist_obj.video_urls]
					
					thumbnailData = playlist_obj.sidebar_info[0]["playlistSidebarPrimaryInfoRenderer"]["thumbnailRenderer"]
					if "playlistCustomThumbnailRenderer" in thumbnailData:  # has custom thumbnail for playlist
						icon_url = thumbnailData["playlistCustomThumbnailRenderer"]["thumbnail"]["thumbnails"][-1]["url"]
					else:  # use first video thumbnail
						icon_url = f"https://i.ytimg.com/vi/{videoID}/mqdefault.jpg"
						
					playlist_info_cache[playlist_id] = { "id": playlist_id, "title": playlist_title, "icon": icon_url, "list": video_id_list }
				
				await websocket.send(GetPlaylistPacket(playlist_info_cache[playlist_id]))
			except:
				await websocket.send(GetPlaylistPacket(None))
				
		elif protocol == "playmode":
			if data["mode"] != playmode:
				playmode = data["mode"]
				# broadcast new playmode
				await asyncio.wait([asyncio.create_task(user.send(GetPlayModePacket(playmode))) for user in USERS])
		
	USERS.remove(websocket)



IP = "127.0.0.1"
PORT = 5555

async def main():
	async with websockets.serve(process, IP, PORT):
		await asyncio.Future()  # run forever

if __name__ == "__main__":
	os.system("cls")
	print(f"Server started at {IP}:{PORT}")
	asyncio.run(main())