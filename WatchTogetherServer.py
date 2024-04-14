import os

try:
	import websockets
except:
	os.system("pip3 install websockets")
	import websockets

import asyncio
import json
import time



current_id = -1
start_time = 0
pause_time = 0
playlist = [ "3cJzGD9xkzg", "lAM3diipp7Y" ]
# init setting
def GetInitPacket(play_id, current_list):
	return json.dumps({
		"type": "set",
		"id": play_id,
		"playlist": current_list
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



USERS = set()
async def process(websocket, path):
	global current_id
	global start_time
	global pause_time
	global playlist
	
	USERS.add(websocket)
	
	await websocket.send(GetInitPacket(current_id, playlist))
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
				pause_time = 0  # force start playing
				
				client_played_time = data["time"]
				current_time = time.time()
				if abs(client_played_time - (current_time - start_time)) > 1:  # 1 second diff tolerant
					start_time = current_time - client_played_time
					# broadcast seek to time
					await asyncio.wait([asyncio.create_task(user.send(GetPlayPacket(current_id, current_time - start_time, False))) for user in USERS])
		elif protocol == "end":
			if data["id"] == current_id:
				current_id += 1  # only process the first user end event
				start_time = 0
				pause_time = 0
				if current_id >= len(playlist):
					current_id = -1  # stop playing
				else:
					# delay a little bit and broadcast the next video load msg
					await asyncio.sleep(1)
					await asyncio.wait([asyncio.create_task(user.send(GetLoadPacket(current_id))) for user in USERS])
		
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