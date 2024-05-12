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

import pathlib
import ssl
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
playback_rate = 1
self_loop = False
playlist = [
	{"vid": "3cJzGD9xkzg", "user": "server", "invalid": ""},
	{"vid": "lAM3diipp7Y", "user": "server", "invalid": ""}
]
playlist_info_cache = {}
playmode = PLAYMODE["DEFAULT"]
user_idx = 0
has_pin = False
# playlist data
def GetListPacket(play_id, current_list, pin, update_only = True):
	return json.dumps({
		"type": "list",
		"id": play_id,
		"playlist": current_list,
		"pin": pin,
		"update_only": update_only
	})
# add videos to playlist at specific pos
def GetAddPacket(play_id, pos, add_list, update_only = True):
	return json.dumps({
		"type": "add",
		"id": play_id,
		"at": pos,
		"list": add_list,
		"update_only": update_only
	})
# remove video at specific pos in playlist
def GetRemovePacket(play_id, pos, update_only = True):
	return json.dumps({
		"type": "remove",
		"id": play_id,
		"at": pos,
		"update_only": update_only
	})
# move a video from `from_id` to `to_id` in playlist
def GetMovePacket(play_id, from_id, to_id, update_only):
	return json.dumps({
		"type": "move",
		"id": play_id,
		"from": from_id,
		"to": to_id,
		"update_only": update_only
	})
# pin the video at `pin_id` to bottom, `pin_id < 0` means removing the pin
def GetPinPacket(play_id, pin_id):
	return json.dumps({
		"type": "pin",
		"id": play_id,
		"pin": pin_id
	})
# load video but not play yet
def GetLoadPacket(play_id):
	return json.dumps({
		"type": "load",
		"id": play_id
	})
# play video at specified time
def GetPlayPacket(play_id, now, rate, paused):
	return json.dumps({
		"type": "play",
		"id": play_id,
		"time": now,
		"rate": rate,
		"paused": paused
	})
# playlist data request by user
def GetPlaylistPacket(playlist_data):
	if playlist_data == None:
		return json.dumps({ "type": "search", "list": [] })
	else:
		return json.dumps({
			"type": "search",
			"title": playlist_data["title"],
			"icon": playlist_data["icon"],
			"list": playlist_data["list"],
		})
# playmode request by user
def GetPlayModePacket(mode, loop):
	return json.dumps({
		"type": "playmode",
		"mode": mode,
		"self_loop": loop
	})
# user list
def GetUserListPacket(userlist):
	return json.dumps({
		"type": "userlist",
		"list": userlist
	})
# video invalid by specific user
def GetInvalidPacket(play_id, by):
	return json.dumps({
		"type": "invalid",
		"id": play_id,
		"by": by
	})
# notify user the id of himself
def GetUserIDPacket(id):
	return json.dumps({
		"type": "uid",
		"id": id
	})



USERS = dict()
async def process(websocket, path):
	global current_id
	global start_time
	global pause_time
	global playback_rate
	global self_loop
	global playlist
	global playlist_info_cache
	global playmode
	global user_idx
	global has_pin
	
	def MovePlaylist(from_id, to_id):
		global current_id
		
		targetVideo = playlist[from_id]
		if from_id < to_id:
			for i in range(from_id, to_id):
				playlist[i] = playlist[i + 1]
				
			if current_id == from_id:
				current_id = to_id
			elif current_id <= to_id and current_id > from_id:
				current_id -= 1
		else:
			for i in range(from_id, to_id, -1):
				playlist[i] = playlist[i - 1]
				
			if current_id == from_id:
				current_id = to_id
			elif current_id >= to_id and current_id < from_id:
				current_id += 1
		playlist[to_id] = targetVideo
	
	
	
	try:
		USERS[websocket] = {"name": "Anonymous", "id": -1}
		
		await websocket.send(GetListPacket(current_id, playlist, has_pin, False))
		await websocket.send(GetPlayModePacket(playmode, self_loop))
		async for message in websocket:
			data = json.loads(message)
			print("[{0}] {1}".format(USERS[websocket]["id"], data))
			protocol = data["type"]
			if protocol == "load":
				if data["id"] >= 0 and data["id"] < len(playlist):
					current_id = data["id"]
					start_time = 0
					pause_time = 0
					# broadcast load video
					packet = GetLoadPacket(current_id)
					await asyncio.wait([asyncio.create_task(user.send(packet)) for user in USERS])
			elif protocol == "ready":
				if data["id"] == current_id:
					if start_time == 0:
						start_time = time.time()
						
					if pause_time > 0:
						await websocket.send(GetPlayPacket(current_id, (pause_time - start_time) * playback_rate, playback_rate, True))
					else:
						await websocket.send(GetPlayPacket(current_id, (time.time() - start_time) * playback_rate, playback_rate, False))
			elif protocol == "pause":
				if data["id"] == current_id:
					if pause_time == 0:
						pause_time = time.time()
						# broadcast pause
						packet = GetPlayPacket(current_id, (pause_time - start_time) * playback_rate, playback_rate, True)
						await asyncio.wait([asyncio.create_task(user.send(packet)) for user in USERS])
			elif protocol == "play":
				if data["id"] == current_id:
					if "invalid" in playlist[current_id]:
						playlist[current_id]["invalid"] = ""
						# broadcast video invalid state
						packet = GetInvalidPacket(current_id, "")
						await asyncio.wait([asyncio.create_task(user.send(packet)) for user in USERS])
						
					client_played_time = data["time"]
					current_time = time.time()
					if pause_time > 0 or abs((client_played_time / playback_rate) - (current_time - start_time)) > 1:  # 1 second diff tolerant
						pause_time = 0  # force start playing
						start_time = current_time - client_played_time / playback_rate
						# broadcast seek to time
						packet = GetPlayPacket(current_id, client_played_time, playback_rate, False)
						await asyncio.wait([asyncio.create_task(user.send(packet)) for user in USERS])
			elif protocol == "end":
				if data["id"] == current_id:
					if "error" in data:
						invalid_by_user = USERS[websocket]["name"]
						playlist[current_id]["invalid"] = invalid_by_user
						# broadcast video invalid state
						packet = GetInvalidPacket(current_id, invalid_by_user)
						await asyncio.wait([asyncio.create_task(user.send(packet)) for user in USERS])
						
					start_time = 0
					pause_time = 0
					if self_loop:
						# broadcast seek to start
						packet = GetPlayPacket(current_id, 0, playback_rate, False)
						await asyncio.wait([asyncio.create_task(user.send(packet)) for user in USERS])
					else:
						if playmode == PLAYMODE["RANDOM"]:
							temp_list = list(range(len(playlist)))
							temp_list[current_id], temp_list[-1] = temp_list[-1], temp_list[current_id]
							current_id = temp_list[random.randint(0, len(temp_list) - 2)]  # random except the last element (current_id)
						else:
							current_id += 1
							if current_id >= len(playlist):
								if playmode == PLAYMODE["DEFAULT"]:
									current_id = -1  # stop playing
								elif playmode == PLAYMODE["LOOP"]:
									current_id = 0
						
						# delay a little bit and broadcast the next video load msg
						await asyncio.sleep(2)
						packet = GetLoadPacket(current_id)
						await asyncio.wait([asyncio.create_task(user.send(packet)) for user in USERS])
						
			elif protocol == "add":
				wasPlaylistEmpty = len(playlist) == 0
				user_name = USERS[websocket]["name"]
				if "interrupt" in data:
					insert_pos = max(current_id, 0)
					start_time = 0
					pause_time = 0
				elif has_pin:
					if current_id == len(playlist) - 1:
						current_id += len(data["vid"])
					insert_pos = len(playlist) - 1
				else:
					insert_pos = len(playlist)
					
				insert_list = [{"vid": vid, "user": user_name, "invalid": ""} for vid in data["vid"]]
				playlist[insert_pos:insert_pos] = insert_list
					
				# broadcast added videos
				if wasPlaylistEmpty or "interrupt" in data:
					current_id = max(current_id, 0)
					packet = GetAddPacket(current_id, insert_pos, insert_list, False)
					await asyncio.wait([asyncio.create_task(user.send(packet)) for user in USERS])
				else:
					packet = GetAddPacket(current_id, insert_pos, insert_list)
					await asyncio.wait([asyncio.create_task(user.send(packet)) for user in USERS])
			elif protocol == "remove":
				target_id = data["id"]
				if target_id >= 0 and target_id < len(playlist):
					if target_id == len(playlist) - 1:
						has_pin = False
						
					del playlist[target_id]
					if target_id == current_id:
						# load next video
						start_time = 0
						pause_time = 0
						if current_id >= len(playlist):
							current_id = -1
						# broadcast new playlist and force load new video
						packet = GetRemovePacket(current_id, target_id, False)
						await asyncio.wait([asyncio.create_task(user.send(packet)) for user in USERS])
					else:
						if target_id < current_id:
							current_id -= 1
						# broadcast new playlist
						packet = GetRemovePacket(current_id, target_id)
						await asyncio.wait([asyncio.create_task(user.send(packet)) for user in USERS])
			elif protocol == "move":
				from_id = data["from"]
				to_id = data["to"]
				if not has_pin or (from_id < len(playlist) - 1 and to_id < len(playlist) - 1):
					if from_id >= 0 and from_id < len(playlist) and to_id >= 0 and to_id < len(playlist):
						need_update = False
						if from_id != to_id:
							MovePlaylist(from_id, to_id)
							need_update = True
							
						no_reload = True
						if "interrupt" in data:
							current_id = to_id
							start_time = 0
							pause_time = 0
							no_reload = False
							need_update = True
							
						if need_update:
							# broadcast new playlist
							packet = GetMovePacket(current_id, from_id, to_id, no_reload)
							await asyncio.wait([asyncio.create_task(user.send(packet)) for user in USERS])
			elif protocol == "clear":
				playlist.clear()
				start_time = 0
				pause_time = 0
				current_id = -1
				has_pin = False
				# broadcast new playlist and force load new video
				packet = GetListPacket(current_id, playlist, has_pin, False)
				await asyncio.wait([asyncio.create_task(user.send(packet)) for user in USERS])
			elif protocol == "pin":
				pin_id = data["id"]
				if pin_id >= 0:
					if not has_pin or pin_id != len(playlist) - 1:
						has_pin = True
						MovePlaylist(pin_id, len(playlist) - 1)
				elif has_pin:
					has_pin = False
					
				# broadcast new playlist
				packet = GetPinPacket(current_id, pin_id)
				await asyncio.wait([asyncio.create_task(user.send(packet)) for user in USERS])
			
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
							icon_url = f"https://i.ytimg.com/vi/{video_id_list[0]}/mqdefault.jpg"
							
						playlist_info_cache[playlist_id] = { "title": playlist_title, "icon": icon_url, "list": video_id_list }
					
					await websocket.send(GetPlaylistPacket(playlist_info_cache[playlist_id]))
				except:
					await websocket.send(GetPlaylistPacket(None))
					
			elif protocol == "playmode":
				if data["mode"] != playmode:
					playmode = data["mode"]
					# broadcast new playmode
					packet = GetPlayModePacket(playmode, self_loop)
					await asyncio.wait([asyncio.create_task(user.send(packet)) for user in USERS])
			elif protocol == "rate":
				if abs(data["rate"] - playback_rate) > 0.01:
					# always make [(current_time - start_time) * playback_rate] == video play time
					if pause_time > 0:
						video_time = (pause_time - start_time) * playback_rate
						start_time = pause_time - video_time / playback_rate
					else:
						current_time = time.time()
						video_time = (current_time - start_time) * playback_rate
						playback_rate = data["rate"]
						start_time = current_time - video_time / playback_rate
						
					# broadcast new playback rate using play packet
					packet = GetPlayPacket(current_id, video_time, playback_rate, pause_time > 0)
					await asyncio.wait([asyncio.create_task(user.send(packet)) for user in USERS])
			elif protocol == "loop":
				if data["state"] != self_loop:
					self_loop = data["state"]
					# broadcast new loop state using playmode packet
					packet = GetPlayModePacket(playmode, self_loop)
					await asyncio.wait([asyncio.create_task(user.send(packet)) for user in USERS])
					
			elif protocol == "name":
				if USERS[websocket]["id"] < 0:
					USERS[websocket]["id"] = user_idx
					user_idx += 1
					if user_idx > 999:
						user_idx = 0
						
					await websocket.send(GetUserIDPacket(USERS[websocket]["id"]))
						
				USERS[websocket]["name"] = data["name"]
				# broadcast to all users
				packet = GetUserListPacket(list(USERS.values()))
				await asyncio.wait([asyncio.create_task(user.send(packet)) for user in USERS])
				
	except Exception as error:
		print("[{0}] error: {1}".format(USERS[websocket]["id"], error))
		
	if USERS[websocket]["id"] >= 0:
		print("[{0}] User {1} leaved".format(USERS[websocket]["id"], USERS[websocket]["name"]))
		
	del USERS[websocket]
	if len(USERS) > 0:
		packet = GetUserListPacket(list(USERS.values()))
		await asyncio.wait([asyncio.create_task(user.send(packet)) for user in USERS])



IP = "127.0.0.1"
PORT = 5555

ssl_context = ssl.SSLContext(ssl.PROTOCOL_TLS_SERVER)
localhost_pem = pathlib.Path(__file__).with_name("localhost.pem")
ssl_context.load_cert_chain(localhost_pem)

async def main():
	async with websockets.serve(process, IP, PORT, ssl=ssl_context):
		await asyncio.Future()  # run forever

if __name__ == "__main__":
	os.system("cls")
	print(f"Server started at {IP}:{PORT}")
	asyncio.run(main())