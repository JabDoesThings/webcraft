//+build windows

// linux darwin
package Type

import (
	"encoding/json"
	"log"
	"math"
	"os"
	"path/filepath"
	"sync"
	"time"

	"whiteframe.ru/webcraft/Struct"
)

const (
	CHUNK_SIZE_X int = 16
	CHUNK_SIZE_Y int = 32
	CHUNK_SIZE_Z int = 16
)

type (
	World struct {
		ID          string
		Seed        string
		Mu          *sync.Mutex          // чтобы избежать коллизий
		Connections map[string]*UserConn // Registered connections.
		Chunks      map[Struct.Vector3]*Chunk
		Entities    *EntityManager
		CreateTime  time.Time // Время создания, time.Now()
		Directory   string
		State       *Struct.WorldState
	}
)

func (this *World) Load() {
	this.Directory = this.GetDir()
	this.CreateTime = this.getDirectoryCTime(this.Directory)
	this.State = &Struct.WorldState{}
	this.Entities.Load(this)
}

func (this *World) updateWorldState() {
	currentTime := time.Now()
	// возраст в реальных секундах
	diff_sec := currentTime.Sub(this.CreateTime).Seconds()
	// один игровой день в реальных секундах
	game_day_in_real_seconds := float64(86400 / Struct.GAME_ONE_SECOND) // 1200
	// возраст в игровых днях
	age := diff_sec / game_day_in_real_seconds // например 215.23
	// возраст в ЦЕЛЫХ игровых днях
	this.State.Age = int64(math.Floor(age)) // например 215
	// количество игровых секунд прошедших в текущем игровом дне
	this.State.DayTime = int64((age - float64(this.State.Age)) * float64(Struct.GAME_DAY_SECONDS))
}

func (this *World) OnPlayer(conn *UserConn) {
	if val, ok := this.Connections[conn.ID]; ok {
		log.Printf("OnPlayer delete existing conn: %s", conn.ID)
		val.Close()
		delete(this.Connections, conn.ID)
	}
	log.Printf("OnPlayer add conn: %s", conn.ID)
	this.Connections[conn.ID] = conn
	params := &Struct.ParamPlayerJoin{
		ID:       conn.ID,
		Skin:     conn.Skin,
		Nickname: conn.Username,
		Pos:      conn.Pos,
		Angles:   conn.Angles,
	}
	packet := Struct.JSONResponse{Name: Struct.CLIENT_PLAYER_JOIN, Data: params, ID: nil}
	packets := []Struct.JSONResponse{packet}
	// this.SendAll(packets, []string{conn.ID})
	this.SendAll(packets, []string{})

	// Send about all other players
	for _, c := range this.Connections {
		if c.ID != conn.ID {
			params := &Struct.ParamPlayerJoin{
				ID:       c.ID,
				Skin:     c.Skin,
				Nickname: c.Username,
				Pos:      c.Pos,
				Angles:   c.Angles,
			}
			packet := Struct.JSONResponse{Name: Struct.CLIENT_PLAYER_JOIN, Data: params, ID: nil}
			packets := []Struct.JSONResponse{packet}
			conn.WriteJSON(packets)
		}
	}

	// Write to chat about new player
	chatMessage := &Struct.ParamChatSendMessage{
		Nickname: "<SERVER>",
		Text:     conn.Username + " подключился",
	}
	packet2 := Struct.JSONResponse{Name: Struct.EVENT_CHAT_SEND_MESSAGE, Data: chatMessage, ID: nil}
	packets2 := []Struct.JSONResponse{packet2}
	this.SendAll(packets2, []string{conn.ID})

	// Send World State to new player
	cons := make(map[string]*UserConn, 0)
	cons[conn.ID] = conn
	this.SendWorldState(cons)
}

// Send World State
func (this *World) SendWorldState(connections map[string]*UserConn) {
	this.updateWorldState()
	packet3 := Struct.JSONResponse{Name: Struct.WORLD_STATE, Data: this.State, ID: nil}
	packets3 := []Struct.JSONResponse{packet3}
	if len(connections) > 0 {
		this.SendSelected(packets3, connections, []string{})
	} else {
		this.SendAll(packets3, []string{})
	}
}

//
func (this *World) GetChunkPos(pos Struct.Vector3) Struct.Vector3 {
	v := Struct.Vector3{
		X: pos.X / CHUNK_SIZE_X,
		Y: pos.Y / CHUNK_SIZE_Y,
		Z: pos.Z / CHUNK_SIZE_Z,
	}
	return v
}

func (this *World) OnCommand(cmdIn Struct.Command, conn *UserConn) {
	// log.Printf("OnCommand: %d", cmdIn.Name)
	switch cmdIn.Name {

	case Struct.CLIENT_BLOCK_SET:

		out, _ := json.Marshal(cmdIn.Data)
		var params *Struct.ParamBlockSet
		json.Unmarshal(out, &params)
		chunkPos := this.GetChunkPos(params.Pos)
		chunk := this.ChunkGet(chunkPos)
		chunk.BlockSet(conn, params, false)

	case Struct.CLIENT_CREATE_ENTITY:

		out, _ := json.Marshal(cmdIn.Data)
		var params *Struct.ParamBlockSet
		json.Unmarshal(out, &params)
		chunkPos := this.GetChunkPos(params.Pos)
		chunk := this.ChunkGet(chunkPos)
		chunk.BlockSet(conn, params, false)

	// Пользователь подгрузил чанк
	case Struct.EVENT_CHUNK_ADD:
		out, _ := json.Marshal(cmdIn.Data)
		var params *Struct.ParamChunkAdd
		json.Unmarshal(out, &params)
		// получим чанк
		chunk := this.ChunkGet(params.Pos)
		//
		this.Mu.Lock()
		defer this.Mu.Unlock()
		// запомним, что юзер в этом чанке
		chunk.AddUserConn(conn)
		// отправим ему modify_list
		chunk.Loaded(conn)

	// Пользователь выгрузил чанк
	case Struct.EVENT_CHUNK_REMOVE:

		out, _ := json.Marshal(cmdIn.Data)
		var params *Struct.ParamChunkRemove
		json.Unmarshal(out, &params)
		// this.ChunkRemove(params, conn)
		// получим чанк
		chunk := this.ChunkGet(params.Pos)
		//
		this.Mu.Lock()
		defer this.Mu.Unlock()
		// забудем, что юзер в этом чанке
		chunk.RemoveUserConn(conn)
		// если в чанке больше нет юзеров, до удалим чанк
		if len(chunk.Connections) < 1 {
			delete(this.Chunks, params.Pos)
		}
	case Struct.EVENT_CHAT_SEND_MESSAGE:
		// Send to users
		out, _ := json.Marshal(cmdIn.Data)
		var params *Struct.ParamChatSendMessage
		json.Unmarshal(out, &params)
		params.Nickname = conn.Username
		packet := Struct.JSONResponse{Name: Struct.EVENT_CHAT_SEND_MESSAGE, Data: params, ID: nil}
		packets := []Struct.JSONResponse{packet}
		this.SendAll(packets, []string{conn.ID})

	case Struct.EVENT_PLAYER_STATE:
		out, _ := json.Marshal(cmdIn.Data)
		var params *Struct.ParamPlayerState
		json.Unmarshal(out, &params)
		params.ID = conn.ID
		params.Nickname = conn.Username
		packet := Struct.JSONResponse{Name: Struct.EVENT_PLAYER_STATE, Data: params, ID: nil}
		packets := []Struct.JSONResponse{packet}
		// Update local position
		conn.Pos = params.Pos
		conn.Angles = params.Angles
		this.SendAll(packets, []string{conn.ID})
		// this.SendAll(packets, []string{})

	case Struct.CLIENT_LOAD_CHEST:
		out, _ := json.Marshal(cmdIn.Data)
		var params *Struct.ParamLoadChest
		json.Unmarshal(out, &params)
		this.Entities.LoadChest(params, conn)

	case Struct.CLIENT_SET_CHEST_SLOT_ITEM:
		out, _ := json.Marshal(cmdIn.Data)
		var params *Struct.ParamChestSetSlotItem
		json.Unmarshal(out, &params)
		this.Entities.SetChestSlotItem(params, conn)

	}
}

// PlayerLeave... Игрок разорвал соединение с сервером
func (this *World) PlayerLeave(conn *UserConn) {
	log.Printf("Player leave %s (%s)", conn.Username, conn.ID)
	// Unsubscribe from chunks
	for _, chunk := range this.Chunks {
		chunk.RemoveUserConn(conn)
	}
	// Delete from current connected list
	delete(this.Connections, conn.ID)
	// Notify about leave
	params := &Struct.ParamPlayerJoin{
		ID:       conn.ID,
		Skin:     conn.Skin,
		Nickname: conn.Username,
	}
	packet := Struct.JSONResponse{Name: Struct.CLIENT_PLAYER_LEAVE, Data: params, ID: nil}
	packets := []Struct.JSONResponse{packet}
	this.SendAll(packets, []string{conn.ID})

	// Write to chat about new player
	chatMessage := &Struct.ParamChatSendMessage{
		Nickname: "<SERVER>",
		Text:     conn.Username + " вышел из игры",
	}
	packet2 := Struct.JSONResponse{Name: Struct.EVENT_CHAT_SEND_MESSAGE, Data: chatMessage, ID: nil}
	packets2 := []Struct.JSONResponse{packet2}
	this.SendAll(packets2, []string{conn.ID})

}

//
func (this *World) ChunkGet(pos Struct.Vector3) *Chunk {
	//
	this.Mu.Lock()
	defer this.Mu.Unlock()
	//
	if val, ok := this.Chunks[pos]; ok {
		return val
	}
	this.Chunks[pos] = &Chunk{
		Pos:         pos,
		Connections: make(map[string]*UserConn, 0),
		World:       this,
		ModifyList:  make(map[string]Struct.BlockItem, 0),
	}
	this.Chunks[pos].Load()
	return this.Chunks[pos]
}

//
func (this *World) GetDir() string {
	ps := string(os.PathSeparator)
	dir, err := filepath.Abs("world" + ps + this.ID)
	if err != nil {
		log.Println(1, err)
		return ""
	}
	err = os.MkdirAll(dir, os.ModePerm)
	if err != nil {
		log.Println(2, err)
		return ""
	}
	return dir
}

func (this *World) SendAll(packets []Struct.JSONResponse, exceptIDs []string) {
	for _, conn := range this.Connections {
		found := false
		for _, ID := range exceptIDs {
			if conn.ID == ID {
				found = true
				break
			}
		}
		if !found {
			conn.WriteJSON(packets)
		}
	}
}

func (this *World) SendSelected(packets []Struct.JSONResponse, connections map[string]*UserConn, exceptIDs []string) {
	for _, conn := range connections {
		found := false
		for _, ID := range exceptIDs {
			if conn.ID == ID {
				found = true
				break
			}
		}
		if !found {
			conn.WriteJSON(packets)
		}
	}
}
